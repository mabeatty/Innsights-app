import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Plus, Pencil, Trash2, ExternalLink, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrency } from "./types";

export const WAIVER_TYPES = [
  "Conditional Progress",
  "Unconditional Progress",
  "Conditional Final",
  "Unconditional Final",
] as const;
export type WaiverType = (typeof WAIVER_TYPES)[number];

interface LienWaiver {
  id: string;
  invoice_id: string;
  waiver_type: WaiverType;
  waiver_amount: number;
  vendor_name: string | null;
  signed_date: string | null;
  document_url: string | null;
  document_name: string | null;
  document_path: string | null;
  notes: string | null;
}

// Reconciliation is intentionally simple: sum of waiver amounts on file vs.
// the invoice's lienable_amount (not its full amount — some billed work,
// e.g. certain sub payments, may not be lien-eligible at all, so lienable_amount
// is a separate, editable field rather than always equal to net_amount).
export type LienWaiverStatus = "matched" | "under" | "over" | "none";

export function computeLienWaiverStatus(lienableAmount: number | null, waivers: LienWaiver[]): {
  status: LienWaiverStatus;
  totalWaived: number;
  difference: number;
} {
  const totalWaived = waivers.reduce((s, w) => s + Number(w.waiver_amount), 0);
  if (lienableAmount == null) return { status: "none", totalWaived, difference: 0 };
  const difference = totalWaived - lienableAmount;
  let status: LienWaiverStatus = "matched";
  if (waivers.length === 0) status = "none";
  else if (Math.abs(difference) < 0.01) status = "matched";
  else if (difference < 0) status = "under";
  else status = "over";
  return { status, totalWaived, difference };
}

export const lienWaiverStatusBadgeClasses = (status: LienWaiverStatus) =>
  cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
    status === "matched" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "under" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    status === "over" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    status === "none" && "bg-muted text-muted-foreground"
  );

export const lienWaiverStatusLabel = (status: LienWaiverStatus) => ({
  matched: "Matched",
  under: "Under-Waived",
  over: "Over-Waived",
  none: "No Waiver on File",
}[status]);

interface Props {
  invoiceId: string;
  invoiceLabel: string;
  vendorName: string;
  lienableAmount: number | null;
  onLienableAmountChange: (amount: number | null) => void;
}

/**
 * Embedded panel (not a separate dialog) for the Invoice Detail view — lien
 * waivers are specific to a single invoice, so unlike CoiPanel this renders
 * inline as a section rather than being opened from a badge elsewhere.
 */
export default function LienWaiverPanel({ invoiceId, invoiceLabel, vendorName, lienableAmount, onLienableAmountChange }: Props) {
  const [waivers, setWaivers] = useState<LienWaiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLienable, setEditingLienable] = useState(false);
  const [lienableDraft, setLienableDraft] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [waiverType, setWaiverType] = useState<WaiverType>("Conditional Progress");
  const [waiverAmount, setWaiverAmount] = useState<number | "">("");
  const [vendorNameField, setVendorNameField] = useState("");
  const [signedDate, setSignedDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("lien_waivers").select("*").eq("invoice_id", invoiceId).order("signed_date", { ascending: false });
    setWaivers((data as LienWaiver[]) ?? []);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const { status, totalWaived, difference } = useMemo(
    () => computeLienWaiverStatus(lienableAmount, waivers),
    [lienableAmount, waivers]
  );

  const resetForm = () => {
    setEditingId(null);
    setWaiverType("Conditional Progress");
    setWaiverAmount("");
    setVendorNameField(vendorName);
    setSignedDate(undefined);
    setNotes("");
    setFile(null);
    setDocUrl(null);
    setDocName(null);
  };

  const openEdit = (w: LienWaiver) => {
    setEditingId(w.id);
    setWaiverType(w.waiver_type);
    setWaiverAmount(w.waiver_amount);
    setVendorNameField(w.vendor_name ?? vendorName);
    setSignedDate(w.signed_date ? new Date(w.signed_date) : undefined);
    setNotes(w.notes ?? "");
    setFile(null);
    setDocUrl(w.document_url);
    setDocName(w.document_name);
    setDialogOpen(true);
  };

  const saveWaiver = async () => {
    if (waiverAmount === "") { toast.error("Waiver amount is required."); return; }
    setSaving(true);
    let uploadedUrl = docUrl;
    let uploadedName = docName;
    let uploadedPath: string | null = null;

    if (file) {
      const timestamp = Date.now();
      const path = `${invoiceId}/lien-waivers/${timestamp}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, file);
      if (uploadError) {
        toast.error(`File upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("project-documents").getPublicUrl(path);
      uploadedUrl = urlData.publicUrl;
      uploadedName = file.name;
      uploadedPath = path;
    }

    const payload = {
      invoice_id: invoiceId,
      waiver_type: waiverType,
      waiver_amount: Number(waiverAmount),
      vendor_name: vendorNameField || null,
      signed_date: signedDate ? format(signedDate, "yyyy-MM-dd") : null,
      notes: notes || null,
      document_url: uploadedUrl,
      document_name: uploadedName,
      ...(uploadedPath ? { document_path: uploadedPath } : {}),
    };

    const { error } = editingId
      ? await supabase.from("lien_waivers").update(payload).eq("id", editingId)
      : await supabase.from("lien_waivers").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Waiver updated" : "Waiver logged");
    setDialogOpen(false);
    resetForm();
    load();
  };

  const deleteWaiver = async (id: string) => {
    const { error } = await supabase.from("lien_waivers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Waiver removed");
    load();
  };

  const saveLienableAmount = () => {
    const parsed = lienableDraft.trim() === "" ? null : Number(lienableDraft.replace(/[^0-9.-]/g, ""));
    onLienableAmountChange(parsed);
    setEditingLienable(false);
  };

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Lien Waivers</h3>
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Log Waiver
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Lienable Amount:</span>
          {editingLienable ? (
            <div className="flex items-center gap-1">
              <Input
                className="h-7 w-32 text-xs"
                value={lienableDraft}
                onChange={(e) => setLienableDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveLienableAmount(); if (e.key === "Escape") setEditingLienable(false); }}
              />
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={saveLienableAmount}>Save</Button>
            </div>
          ) : (
            <button
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              title="Not every dollar billed is lien-eligible — edit if this invoice includes non-lienable amounts"
              onClick={() => { setLienableDraft(lienableAmount != null ? String(lienableAmount) : ""); setEditingLienable(true); }}
            >
              {lienableAmount != null ? formatCurrency(lienableAmount) : "Not set"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total Waived:</span>
          <span>{formatCurrency(totalWaived)}</span>
        </div>
        <span className={lienWaiverStatusBadgeClasses(status)}>
          {lienWaiverStatusLabel(status)}
          {status !== "none" && status !== "matched" && ` (${difference > 0 ? "+" : ""}${formatCurrency(difference)})`}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : waivers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lien waivers logged for this invoice yet.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-left text-xs">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Signed Date</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {waivers.map((w) => (
                <tr key={w.id} className="border-t">
                  <td className="px-3 py-2">{w.waiver_type}</td>
                  <td className="px-3 py-2 text-muted-foreground">{w.vendor_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(w.waiver_amount)}</td>
                  <td className="px-3 py-2">{w.signed_date ? format(new Date(w.signed_date), "MM/dd/yyyy") : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {w.document_url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Open document" onClick={() => window.open(w.document_url!, "_blank", "noopener,noreferrer")}>
                          <ExternalLink className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(w)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => deleteWaiver(w.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Log"} Lien Waiver — {invoiceLabel}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Waiver Type</Label>
              <Select value={waiverType} onValueChange={(v) => setWaiverType(v as WaiverType)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAIVER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor / Payee</Label>
              <Input className="h-8" value={vendorNameField} onChange={(e) => setVendorNameField(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Waiver Amount ($)</Label>
                <Input type="number" className="h-8" value={waiverAmount} onChange={(e) => setWaiverAmount(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Signed Date</Label>
                <DatePickerInput value={signedDate} onChange={setSignedDate} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Document</Label>
              {docUrl && !file ? (
                <div className="flex items-center gap-2 text-xs">
                  <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">{docName}</a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDocUrl(null); setDocName(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Input type="file" accept="application/pdf,image/*" className="h-8 text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full gap-1.5" onClick={saveWaiver} disabled={saving}>
              <Upload className="h-3.5 w-3.5" /> {saving ? "Saving…" : editingId ? "Save" : "Log Waiver"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
