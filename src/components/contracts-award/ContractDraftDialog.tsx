import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles, Upload, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { BidItem, VendorQuote, Adjustment } from "@/components/vendor-quotes/types";
import { fmt } from "@/components/vendor-quotes/types";
import type { ContractTemplate, ContractDraft, TemplateType } from "./types";
import { draftStatusPillClass } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bidItem: BidItem;
  awardedQuote: VendorQuote;
  adjustments: Adjustment[];
  leveledAmount: number;
}

export default function ContractDraftDialog({
  open, onOpenChange, projectId, bidItem, awardedQuote, adjustments, leveledAmount,
}: Props) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [templateType, setTemplateType] = useState<TemplateType>("PO");
  const [templateId, setTemplateId] = useState<string>("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateFile, setNewTemplateFile] = useState<File | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [uploadingFinal, setUploadingFinal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tpls }, { data: existingDraft }] = await Promise.all([
      supabase.from("contract_templates").select("*").eq("is_active", true).order("template_name"),
      supabase.from("contract_drafts").select("*").eq("vendor_quote_id", awardedQuote.id).maybeSingle(),
    ]);
    setTemplates((tpls ?? []) as ContractTemplate[]);
    setDraft((existingDraft as ContractDraft) ?? null);
    if (existingDraft?.template_id) setTemplateId(existingDraft.template_id);
    setLoading(false);
  }, [awardedQuote.id]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const filteredTemplates = templates.filter((t) => t.template_type === templateType);

  const handleUploadTemplate = async () => {
    if (!newTemplateFile || !newTemplateName.trim()) {
      toast.error("Template name and file are required.");
      return;
    }
    setUploadingTemplate(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: orgId, error: orgErr } = await supabase.rpc("get_user_organization_id", { _user_id: userData.user!.id });
      if (orgErr || !orgId) throw new Error(orgErr?.message || "Could not determine organization.");

      const safeName = newTemplateFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `contract-templates/${orgId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("project-documents").upload(path, newTemplateFile);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("project-documents").getPublicUrl(path);

      const { data: row, error: insErr } = await supabase
        .from("contract_templates")
        .insert({ org_id: orgId, template_type: templateType, template_name: newTemplateName.trim(), file_url: pub.publicUrl, file_path: path })
        .select()
        .single();
      if (insErr) throw insErr;

      toast.success("Template uploaded.");
      setTemplates((prev) => [...prev, row as ContractTemplate]);
      setTemplateId(row.id);
      setUploadOpen(false);
      setNewTemplateName("");
      setNewTemplateFile(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload template.");
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleDraft = async () => {
    if (!templateId) {
      toast.error("Select a template first.");
      return;
    }
    setDrafting(true);
    try {
      const { data } = await supabase.functions.invoke("draft-contract-terms-claude", {
        body: {
          itemName: bidItem.item_name,
          segment: bidItem.segment,
          vendorName: awardedQuote.vendor_name,
          amount: leveledAmount,
          adjustments: adjustments.map((a) => ({ category: a.category, description: a.description, amount: a.amount })),
        },
      });
      if (!data?.ok) {
        toast.error(data?.error ? `AI drafting failed: ${data.error}` : "AI drafting failed — you can fill terms in manually.");
      }
      const fields = data?.ok ? data.fields : {};

      const payload = {
        project_id: projectId,
        vendor_bid_item_id: bidItem.id,
        vendor_quote_id: awardedQuote.id,
        template_id: templateId,
        status: "Draft Ready" as const,
        vendor_name: awardedQuote.vendor_name,
        contract_amount: leveledAmount,
        scope_of_work: fields.scope_of_work ?? null,
        payment_terms: fields.payment_terms ?? null,
        special_terms: fields.special_terms ?? null,
        extracted_at: new Date().toISOString(),
      };

      const { data: row, error } = draft
        ? await supabase.from("contract_drafts").update(payload).eq("id", draft.id).select().single()
        : await supabase.from("contract_drafts").insert(payload).select().single();
      if (error) throw error;
      setDraft(row as ContractDraft);
      if (data?.ok) toast.success("Draft terms ready for review.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create draft.");
    } finally {
      setDrafting(false);
    }
  };

  const updateDraftField = (patch: Partial<ContractDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSaveReview = async () => {
    if (!draft) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("contract_drafts")
      .update({
        scope_of_work: draft.scope_of_work,
        payment_terms: draft.payment_terms,
        special_terms: draft.special_terms,
        start_date: draft.start_date,
        completion_date: draft.completion_date,
        notes: draft.notes,
        status: "Ready to Generate",
        reviewed_by: userData.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", draft.id)
      .select()
      .single();
    if (error) toast.error(error.message);
    else {
      toast.success("Terms approved — ready to generate the document.");
      await load();
    }
    setSaving(false);
  };

  const handleUploadFinal = async () => {
    if (!draft || !finalFile) return;
    setUploadingFinal(true);
    try {
      const safeName = finalFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${projectId}/contracts/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("project-documents").upload(path, finalFile);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("project-documents").getPublicUrl(path);
      const { error } = await supabase
        .from("contract_drafts")
        .update({ final_document_url: pub.publicUrl, status: "Sent for Execution", sent_at: new Date().toISOString() })
        .eq("id", draft.id);
      if (error) throw error;
      toast.success("Final document attached — marked Sent for Execution.");
      setFinalFile(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to attach document.");
    } finally {
      setUploadingFinal(false);
    }
  };

  const markExecuted = async () => {
    if (!draft) return;
    const { error } = await supabase
      .from("contract_drafts")
      .update({ status: "Executed", executed_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Marked executed.");
      await load();
    }
  };

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft Contract — {bidItem.item_name}</DialogTitle>
          <DialogDescription>
            {awardedQuote.vendor_name} · {fmt(leveledAmount)}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground py-4">Loading…</p>}

        {!loading && (
          <div className="space-y-5 py-2">
            {draft && (
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${draftStatusPillClass(draft.status)}`}>
                  {draft.status}
                </span>
              </div>
            )}

            {(!draft || draft.status === "Awaiting Draft") && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Document Type</Label>
                    <Select value={templateType} onValueChange={(v) => { setTemplateType(v as TemplateType); setTemplateId(""); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PO">Purchase Order</SelectItem>
                        <SelectItem value="Subcontract">Subcontract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Template</Label>
                    <Select value={templateId} onValueChange={setTemplateId}>
                      <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                      <SelectContent>
                        {filteredTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {filteredTemplates.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> No {templateType} template uploaded yet.
                  </p>
                )}

                {!uploadOpen ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-3.5 w-3.5" /> Upload a New {templateType} Template
                  </Button>
                ) : (
                  <div className="space-y-2 border rounded-md p-3">
                    <Input placeholder="Template name (e.g. Standard Subcontract Agreement)" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
                    <Input type="file" accept=".doc,.docx" onChange={(e) => setNewTemplateFile(e.target.files?.[0] ?? null)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleUploadTemplate} disabled={uploadingTemplate}>
                        {uploadingTemplate ? "Uploading…" : "Save Template"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setUploadOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                <Button className="gap-1.5" onClick={handleDraft} disabled={!templateId || drafting}>
                  <Sparkles className="h-3.5 w-3.5" /> {drafting ? "Drafting terms…" : "Draft Contract Terms"}
                </Button>
              </div>
            )}

            {draft && (draft.status === "Draft Ready" || draft.status === "Under PM Review") && (
              <div className="space-y-3">
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Drafted against template: {selectedTemplate.template_name}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input type="date" value={draft.start_date ?? ""} onChange={(e) => updateDraftField({ start_date: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Completion Date</Label>
                    <Input type="date" value={draft.completion_date ?? ""} onChange={(e) => updateDraftField({ completion_date: e.target.value || null })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Scope of Work</Label>
                  <Textarea rows={4} value={draft.scope_of_work ?? ""} onChange={(e) => updateDraftField({ scope_of_work: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Terms</Label>
                  <Textarea rows={2} value={draft.payment_terms ?? ""} onChange={(e) => updateDraftField({ payment_terms: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Special Terms</Label>
                  <Textarea rows={2} value={draft.special_terms ?? ""} onChange={(e) => updateDraftField({ special_terms: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Internal Notes (optional)</Label>
                  <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => updateDraftField({ notes: e.target.value })} />
                </div>
                <Button className="gap-1.5" onClick={handleSaveReview} disabled={saving}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Approve Terms — Ready to Generate"}
                </Button>
              </div>
            )}

            {draft && draft.status === "Ready to Generate" && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <p className="font-medium">Next: generate the {templateType} document</p>
                  <p className="text-muted-foreground text-xs">
                    Populating your exact {templateType} template with these approved terms requires editing the Word
                    document directly — open a Claude session, point it at the "{selectedTemplate?.template_name}" template
                    and the terms below, and it will produce the populated agreement. Once you have the final file, attach
                    it here.
                  </p>
                  <dl className="text-xs space-y-1 pt-1">
                    <div><dt className="inline font-medium">Vendor:</dt> <dd className="inline">{draft.vendor_name}</dd></div>
                    <div><dt className="inline font-medium">Amount:</dt> <dd className="inline">{fmt(draft.contract_amount)}</dd></div>
                    <div><dt className="inline font-medium">Scope:</dt> <dd className="inline">{draft.scope_of_work}</dd></div>
                  </dl>
                  {selectedTemplate && (
                    <a href={selectedTemplate.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                      <ExternalLink className="h-3 w-3" /> Open template
                    </a>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Attach Final Document</Label>
                  <Input type="file" accept=".doc,.docx,.pdf" onChange={(e) => setFinalFile(e.target.files?.[0] ?? null)} />
                </div>
                <Button className="gap-1.5" onClick={handleUploadFinal} disabled={!finalFile || uploadingFinal}>
                  <Upload className="h-3.5 w-3.5" /> {uploadingFinal ? "Uploading…" : "Attach & Mark Sent for Execution"}
                </Button>
              </div>
            )}

            {draft && draft.status === "Sent for Execution" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Sent to {draft.vendor_name} for review and execution.</p>
                {draft.final_document_url && (
                  <a href={draft.final_document_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                    <ExternalLink className="h-3.5 w-3.5" /> View sent document
                  </a>
                )}
                <Button className="gap-1.5" onClick={markExecuted}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Executed
                </Button>
              </div>
            )}

            {draft && draft.status === "Executed" && (
              <div className="rounded-md border bg-green-50 dark:bg-green-900/10 p-3 text-sm text-green-800 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Executed{draft.executed_at ? ` on ${new Date(draft.executed_at).toLocaleDateString()}` : ""}.
                {draft.final_document_url && (
                  <a href={draft.final_document_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 ml-auto">
                    <ExternalLink className="h-3.5 w-3.5" /> View
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
