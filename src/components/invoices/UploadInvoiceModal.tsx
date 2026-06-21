import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Sparkles, Upload, Loader2, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { APPROVER_ROLES } from "./types";
import { ALL_DIVISIONS, TRANSACTION_TYPES, fmtDecimal } from "../budget/types";
import { createNotifications } from "@/lib/notify";
import { format } from "date-fns";

interface Project { id: string; name: string }

interface LineItem {
  id: string;
  division: string;
  amount: number;
  retainageAmount: number;
  description: string;
}

let lineCounter = 0;
const newLine = (): LineItem => ({ id: `l-${++lineCounter}`, division: "", amount: 0, retainageAmount: 0, description: "" });

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
  const [projectId, setProjectId] = useState<string>(defaultProjectId || "");
  const [transactionType, setTransactionType] = useState<string>("Vendor Invoice");
  const [documentLink, setDocumentLink] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) {
    lineCounter = 0;
    setFile(null); setVendor(""); setInvoiceNumber(""); setInvoiceDate(undefined);
    setTransactionType("Vendor Invoice"); setDocumentLink(""); setNotes("");
    setLineItems([newLine()]); setExtracted({}); setProjectId(defaultProjectId || "");
  } }, [open, defaultProjectId]);

  useEffect(() => {
    if (!open) return;
    supabase.from("projects").select("id, name").order("name").then(({ data }) => setProjects(data ?? []));
  }, [open]);

  const updateLine = (id: string, field: keyof LineItem, value: any) =>
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  const removeLine = (id: string) =>
    setLineItems((prev) => (prev.length > 1 ? prev.filter((li) => li.id !== id) : prev));

  const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);
  const totalRetainage = lineItems.reduce((s, li) => s + li.retainageAmount, 0);
  const totalNet = totalAmount - totalRetainage;

  const handleFile = async (f: File) => {
    setFile(f);
    if (f.type !== "application/pdf") return;
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const { data } = await supabase.functions.invoke("extract-invoice-claude", {
        body: { pdfBase64: b64, mimeType: "application/pdf" },
      });
      if (data?.ok && data.fields) {
        const fields = data.fields;
        const flagged: Record<string, boolean> = {};
        if (fields.vendor_name) { setVendor(fields.vendor_name); flagged.vendor = true; }
        if (fields.invoice_number) { setInvoiceNumber(String(fields.invoice_number)); flagged.invoice_number = true; }
        if (fields.invoice_date) { const d = new Date(fields.invoice_date); if (!isNaN(d.getTime())) { setInvoiceDate(d); flagged.invoice_date = true; } }

        const total = fields.total_amount ?? fields.amount;
        if (total != null) {
          // Pre-fill the first row's amount with the extracted total. Line items
          // and categories are always entered manually.
          setLineItems((prev) => prev.map((li, i) => (i === 0 ? { ...li, amount: Number(total) || 0 } : li)));
          flagged.amount = true;
        }
        setExtracted(flagged);
        toast.success("AI extracted header fields — please add line items and categories");
      } else {
        // Extraction failed for some reason — don't block the upload.
        console.warn("[invoice] AI extraction unavailable:", data?.error);
        toast.message("AI extraction unavailable — please fill in fields manually");
      }
    } catch (e: any) {
      // Network/unexpected failure: still let the user continue manually.
      console.warn("[invoice] AI extraction error:", e?.message);
      toast.message("AI extraction unavailable — please fill in fields manually");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!file) return toast.error("Please upload a PDF.");
    if (!vendor || !projectId) return toast.error("Vendor and Project are required.");
    const validLines = lineItems.filter((li) => li.division && li.amount > 0);
    if (validLines.length === 0) return toast.error("Add at least one division line with an amount.");
    if (!organizationId || !user) return toast.error("Not authenticated.");
    setSaving(true);
    try {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("invoices").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);
      const pdfUrl = signed?.signedUrl ?? null;

      // Resolve approvers: PM/Lead per project, Treasury from the global profile flag.
      const [{ data: approverRows }, { data: treasuryRows }] = await Promise.all([
        supabase.from("project_approvers").select("role, approver_id").eq("project_id", projectId),
        supabase.from("profiles").select("user_id").eq("is_treasury", true).limit(1),
      ]);
      const approverMap: Record<string, string | null> = {};
      (approverRows ?? []).forEach((r) => { approverMap[r.role] = r.approver_id; });
      approverMap.treasury = treasuryRows?.[0]?.user_id ?? null;
      const hasApprovers = APPROVER_ROLES.some((r) => approverMap[r.key]);
      const status = hasApprovers ? "In Approval" : "Pending Review";

      const firstDiv = ALL_DIVISIONS.find((d) => d.number === validLines[0].division);
      const budgetLineSummary = validLines.length === 1
        ? `${firstDiv?.number} — ${firstDiv?.name}`
        : `${validLines.length} divisions`;

      // 1. Invoice
      const { data: inv, error } = await supabase.from("invoices").insert({
        organization_id: organizationId,
        project_id: projectId,
        vendor_name: vendor,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate ? format(invoiceDate, "yyyy-MM-dd") : null,
        amount: totalAmount,
        retainage_amount: totalRetainage,
        net_amount: totalNet,
        cost_type: firstDiv?.cost_type === "hard" ? "Hard Cost" : firstDiv?.cost_type === "soft" ? "Soft Cost" : null,
        budget_line_item: budgetLineSummary,
        status,
        submitted_by: user.id,
        submitted_by_email: user.email,
        notes: notes || null,
        pdf_url: pdfUrl,
        pdf_path: path,
        source: "manual",
        ai_extracted_fields: Object.keys(extracted).length ? extracted : null,
      }).select("id").single();
      if (error) throw error;

      // 2. Approval chain (one row per role)
      const { error: apprErr } = await supabase.from("invoice_approvals").insert(
        APPROVER_ROLES.map((r) => ({
          invoice_id: inv!.id, approver_role: r.key, approver_id: approverMap[r.key] ?? null, status: "Pending",
        })),
      );
      if (apprErr) throw apprErr;

      // 2b. Invoice line items (one row per division/category line).
      const { error: liErr } = await supabase.from("invoice_line_items").insert(
        validLines.map((li) => {
          const div = ALL_DIVISIONS.find((d) => d.number === li.division);
          return {
            invoice_id: inv!.id,
            category: div ? `${div.number} — ${div.name}` : li.division,
            amount: li.amount,
            retainage_amount: li.retainageAmount,
            net_amount: li.amount - li.retainageAmount,
          };
        }),
      );
      if (liErr) throw liErr;

      // 3. Linked budget_transactions (one per division line) — reflected in the
      //    project's transactions sub-tab. Not draw-eligible until the invoice is approved.
      const { count } = await supabase
        .from("budget_transactions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      const groupId = crypto.randomUUID();
      const txnDate = invoiceDate ? format(invoiceDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
      const txnRows = validLines.map((li) => {
        const div = ALL_DIVISIONS.find((d) => d.number === li.division);
        const retAmt = li.retainageAmount;
        return {
          project_id: projectId,
          invoice_id: inv!.id,
          transaction_group_id: groupId,
          transaction_type: transactionType,
          transaction_number: (count ?? 0) + 1,
          date: txnDate,
          payee: vendor,
          division_number: li.division,
          division_name: div?.name ?? "",
          description: li.description || "",
          amount: li.amount,
          retainage_percent: li.amount > 0 ? (retAmt / li.amount) * 100 : 0,
          retainage_amount: retAmt,
          net_amount: li.amount - retAmt,
          status: "Pending",
          notes: notes || null,
          document_url: documentLink || pdfUrl,
        };
      });
      const { error: txnErr } = await supabase.from("budget_transactions").insert(txnRows);
      if (txnErr) throw txnErr;

      await supabase.from("invoice_audit_trail").insert({
        invoice_id: inv!.id, action: "Invoice submitted", performed_by: user.id,
        performed_by_name: user.email, notes: `Vendor: ${vendor}${invoiceNumber ? ` · ${invoiceNumber}` : ""}`,
      });

      if (hasApprovers) {
        const projName = projects.find((p) => p.id === projectId)?.name || "a project";
        await createNotifications(APPROVER_ROLES.map((r) => ({
          user_id: approverMap[r.key] ?? undefined, invoice_id: inv!.id,
          title: "New invoice to approve",
          body: `${vendor} · ${fmtDecimal(totalAmount)} on ${projName} needs your approval.`,
        })));
      }

      toast.success(hasApprovers
        ? "Invoice submitted — routed to approvers and added to the project's transactions."
        : "Invoice submitted. Assign approvers in Project Info to start the approval chain.");
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
      <DialogContent className="max-w-[57.6rem] w-[95vw] max-h-[92vh] overflow-y-auto">
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
              <Label className="flex items-center">Invoice Number {extracted.invoice_number && <AIBadge />}</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Invoice Date {extracted.invoice_date && <AIBadge />}</Label>
              <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} heightClass="h-10" textClass="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!!defaultProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document Link</Label>
              <div className="relative">
                <LinkIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7" placeholder="Optional Drive link" value={documentLink} onChange={(e) => setDocumentLink(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Division line items */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Division Line Items * {extracted.amount && <AIBadge />}</Label>
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                    <th className="px-2 py-1.5 min-w-[180px]">Category</th>
                    <th className="px-2 py-1.5 w-28">Amount</th>
                    <th className="px-2 py-1.5 w-28">Retainage</th>
                    <th className="px-2 py-1.5 w-28 text-right">Net Amount</th>
                    <th className="px-2 py-1.5">Description</th>
                    <th className="px-2 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => (
                    <tr key={li.id} className="border-t">
                      <td className="px-2 py-1.5">
                        <Select value={li.division} onValueChange={(v) => updateLine(li.id, "division", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {ALL_DIVISIONS.map((d) => <SelectItem key={d.number} value={d.number}>{d.number} — {d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" step="0.01" className="h-8 text-xs" value={li.amount || ""} onChange={(e) => updateLine(li.id, "amount", Number(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" step="0.01" min="0" placeholder="0.00" className="h-8 text-xs" value={li.retainageAmount || ""} onChange={(e) => updateLine(li.id, "retainageAmount", Number(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground text-right">{fmtDecimal(li.amount - li.retainageAmount)}</td>
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs" value={li.description} onChange={(e) => updateLine(li.id, "description", e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLine(li.id)} disabled={lineItems.length <= 1}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold text-xs">
                    <td className="px-2 py-1.5">Totals</td>
                    <td className="px-2 py-1.5">{fmtDecimal(totalAmount)}</td>
                    <td className="px-2 py-1.5">{fmtDecimal(totalRetainage)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtDecimal(totalNet)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setLineItems((prev) => [...prev, newLine()])}>
              <Plus className="h-3 w-3" /> Add Line Item
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Submit Invoice"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
