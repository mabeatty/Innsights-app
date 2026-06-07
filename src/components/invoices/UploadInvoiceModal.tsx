import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Sparkles, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { INVOICE_TYPES, APPROVER_EMAIL } from "./types";
import { format } from "date-fns";

interface Project { id: string; name: string }
interface BudgetRow { division_number: string; division_name: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProjectId?: string | null;
  onCreated?: () => void;
}

export default function UploadInvoiceModal({ open, onOpenChange, defaultProjectId, onCreated }: Props) {
  const { user, organizationId } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [partial, setPartial] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId || "");
  const [type, setType] = useState<string>("");
  const [budgetLine, setBudgetLine] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) {
    setFile(null); setVendor(""); setInvoiceNumber(""); setInvoiceDate(undefined);
    setAmount(""); setPartial(""); setType(""); setBudgetLine(""); setNotes("");
    setExtracted({}); setProjectId(defaultProjectId || "");
  } }, [open, defaultProjectId]);

  useEffect(() => {
    if (!open) return;
    supabase.from("projects").select("id, name").order("name").then(({ data }) => setProjects(data ?? []));
  }, [open]);

  useEffect(() => {
    if (!projectId) { setBudgetRows([]); return; }
    supabase.from("project_budget").select("division_number, division_name").eq("project_id", projectId).order("division_number").then(({ data }) => setBudgetRows(data ?? []));
  }, [projectId]);

  const handleFile = async (f: File) => {
    setFile(f);
    if (f.type !== "application/pdf") return;
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const s = reader.result as string; resolve(s.split(",")[1] || ""); };
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const { data } = await supabase.functions.invoke("extract-invoice-pdf", {
        body: { pdfBase64: b64, mimeType: "application/pdf" },
      });
      if (data?.ok && data.fields) {
        const f2 = data.fields;
        const flagged: Record<string, boolean> = {};
        if (f2.vendor_name) { setVendor(f2.vendor_name); flagged.vendor = true; }
        if (f2.invoice_number) { setInvoiceNumber(String(f2.invoice_number)); flagged.invoice_number = true; }
        if (f2.invoice_date) { const d = new Date(f2.invoice_date); if (!isNaN(d.getTime())) { setInvoiceDate(d); flagged.invoice_date = true; } }
        if (f2.amount != null) { setAmount(String(f2.amount)); flagged.amount = true; }
        setExtracted(flagged);
        toast.success("AI extracted fields — please verify");
      } else {
        toast.message("AI extraction unavailable", { description: data?.error || "Fill fields manually." });
      }
    } catch (e: any) {
      toast.error(e?.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!file) return toast.error("Please upload a PDF.");
    if (!vendor || !invoiceNumber || !invoiceDate || !amount || !projectId || !type) {
      return toast.error("Please fill all required fields.");
    }
    if (!organizationId || !user) return toast.error("Not authenticated.");
    setSaving(true);
    try {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("invoices").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);

      const partialNum = partial ? Number(partial) : null;
      const status = partialNum ? "Pending" : "Pending";

      const { data: inv, error } = await supabase.from("invoices").insert({
        organization_id: organizationId,
        project_id: projectId,
        vendor_name: vendor,
        invoice_number: invoiceNumber,
        invoice_date: format(invoiceDate, "yyyy-MM-dd"),
        amount: Number(amount),
        partial_approved_amount: partialNum,
        type,
        budget_line_item: budgetLine || null,
        status,
        submitted_by: user.id,
        submitted_by_email: user.email,
        notes: notes || null,
        pdf_url: signed?.signedUrl ?? null,
        pdf_path: path,
        source: "manual",
        ai_extracted_fields: Object.keys(extracted).length ? extracted : null,
      }).select("id").single();
      if (error) throw error;

      await supabase.from("invoice_audit_trail").insert({
        invoice_id: inv!.id,
        action: "Invoice submitted",
        performed_by: user.id,
        performed_by_name: user.email,
        notes: `Vendor: ${vendor} · ${invoiceNumber}`,
      });

      // notify approver (best effort)
      const projName = projects.find(p => p.id === projectId)?.name || "Project";
      supabase.functions.invoke("send-invoice-email", {
        body: {
          to: APPROVER_EMAIL,
          subject: `New invoice to review: ${vendor} · ${invoiceNumber}`,
          html: `<p>A new invoice has been submitted for <b>${projName}</b>.</p>
                 <ul><li>Vendor: ${vendor}</li><li>Invoice #: ${invoiceNumber}</li><li>Amount: $${Number(amount).toLocaleString()}</li></ul>
                 <p><a href="${window.location.origin}/invoices">Review in Innsights</a></p>`,
          attachPdfPath: path,
        },
      }).catch(() => {});

      toast.success("Invoice submitted for approval.");
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  };

  const AIBadge = () => <Badge variant="outline" className="ml-2 text-[10px] gap-1 bg-purple-50 text-purple-700 border-purple-200"><Sparkles className="h-2.5 w-2.5" />AI extracted</Badge>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Upload Invoice</DialogTitle></DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>PDF *</Label>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center gap-2 border border-dashed rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm">
                <Upload className="h-4 w-4" />
                <span className="truncate">{file ? file.name : "Choose PDF file…"}</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              {extracting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center">Vendor Name * {extracted.vendor && <AIBadge />}</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Invoice Number * {extracted.invoice_number && <AIBadge />}</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Invoice Date * {extracted.invoice_date && <AIBadge />}</Label>
              <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} heightClass="h-10" textClass="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Amount * {extracted.amount && <AIBadge />}</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Partial Approval Amount</Label>
              <Input type="number" step="0.01" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {INVOICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Budget Line Item</Label>
              <Select value={budgetLine} onValueChange={setBudgetLine} disabled={!projectId || budgetRows.length === 0}>
                <SelectTrigger><SelectValue placeholder={projectId ? "Select line item" : "Choose a project first"} /></SelectTrigger>
                <SelectContent>
                  {budgetRows.map((r) => <SelectItem key={r.division_number} value={`${r.division_number} - ${r.division_name}`}>{r.division_number} – {r.division_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
