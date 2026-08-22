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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Download, Upload, Pencil, X, FileText } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const TAX_CLASSIFICATIONS = [
  "Individual/Sole Proprietor",
  "C Corporation",
  "S Corporation",
  "Partnership",
  "Trust/Estate",
  "LLC — C Corporation",
  "LLC — S Corporation",
  "LLC — Partnership",
  "Other",
] as const;

export interface VendorW9 {
  id: string;
  vendor_id: string;
  legal_name: string | null;
  tax_classification: string | null;
  ein_last_four: string | null;
  document_url: string | null;
  document_name: string | null;
  document_path: string | null;
  uploaded_date: string;
  renewal_due_date: string | null;
  notes: string | null;
}

export type W9Status = "on_file" | "renewal_due_soon" | "renewal_overdue" | "missing";

export function computeW9Status(w9: VendorW9 | null): W9Status {
  if (!w9) return "missing";
  if (!w9.renewal_due_date) return "on_file";
  const days = differenceInCalendarDays(new Date(w9.renewal_due_date), new Date());
  if (days < 0) return "renewal_overdue";
  if (days <= 30) return "renewal_due_soon";
  return "on_file";
}

export const w9StatusBadgeClasses = (status: W9Status) =>
  cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
    status === "on_file" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "renewal_due_soon" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    status === "renewal_overdue" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    status === "missing" && "bg-muted text-muted-foreground"
  );

export const w9StatusLabel = (status: W9Status) => ({
  on_file: "On File",
  renewal_due_soon: "Renewal Due Soon",
  renewal_overdue: "Renewal Overdue",
  missing: "None",
}[status]);

interface Props {
  vendorId: string;
  vendorName: string;
  orgId: string; // storage RLS for the w9-forms bucket keys off org id
  mode?: "full" | "compact"; // full: edit UI (VendorDetail); compact: status + download only (Vendors list)
}

export default function VendorW9Panel({ vendorId, vendorName, orgId, mode = "full" }: Props) {
  const [w9, setW9] = useState<VendorW9 | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [legalName, setLegalName] = useState("");
  const [taxClassification, setTaxClassification] = useState<string>(TAX_CLASSIFICATIONS[0]);
  const [einLastFour, setEinLastFour] = useState("");
  const [uploadedDate, setUploadedDate] = useState<Date | undefined>(new Date());
  const [renewalDueDate, setRenewalDueDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("vendor_w9s").select("*").eq("vendor_id", vendorId).maybeSingle();
    setW9((data as VendorW9) ?? null);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  const status = computeW9Status(w9);

  const openEdit = () => {
    setLegalName(w9?.legal_name ?? vendorName);
    setTaxClassification(w9?.tax_classification ?? TAX_CLASSIFICATIONS[0]);
    setEinLastFour(w9?.ein_last_four ?? "");
    setUploadedDate(w9?.uploaded_date ? new Date(w9.uploaded_date) : new Date());
    setRenewalDueDate(w9?.renewal_due_date ? new Date(w9.renewal_due_date) : undefined);
    setNotes(w9?.notes ?? "");
    setFile(null);
    setDocUrl(w9?.document_url ?? null);
    setDocName(w9?.document_name ?? null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (einLastFour && !/^\d{0,4}$/.test(einLastFour)) {
      toast.error("EIN last 4 digits should be numbers only.");
      return;
    }
    setSaving(true);
    let uploadedUrl = docUrl;
    let uploadedName = docName;
    let uploadedPath: string | null = null;

    if (file) {
      const timestamp = Date.now();
      // Path starts with org id, matching this bucket's RLS policy shape
      // (see project-documents RLS, which required the same fix for COI/lien
      // waiver uploads — the first path segment must match what the policy
      // actually checks against, not just any related record's id).
      const path = `${orgId}/vendors/${vendorId}/w9/${timestamp}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("vendor-documents").upload(path, file);
      if (uploadError) {
        toast.error(`File upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("vendor-documents").getPublicUrl(path);
      uploadedUrl = urlData.publicUrl;
      uploadedName = file.name;
      uploadedPath = path;
    }

    const payload = {
      vendor_id: vendorId,
      legal_name: legalName || null,
      tax_classification: taxClassification,
      ein_last_four: einLastFour || null,
      uploaded_date: uploadedDate ? format(uploadedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      renewal_due_date: renewalDueDate ? format(renewalDueDate, "yyyy-MM-dd") : null,
      notes: notes || null,
      document_url: uploadedUrl,
      document_name: uploadedName,
      ...(uploadedPath ? { document_path: uploadedPath } : {}),
    };

    const { error } = await supabase.from("vendor_w9s").upsert(payload, { onConflict: "vendor_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("W-9 saved");
    setDialogOpen(false);
    load();
  };

  if (mode === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        <span className={w9StatusBadgeClasses(status)}>{w9StatusLabel(status)}</span>
        {w9?.document_url && (
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Download W-9" onClick={() => window.open(w9.document_url!, "_blank", "noopener,noreferrer")}>
            <Download className="h-3.5 w-3.5 text-primary" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">W-9</h3>
          {!loading && <span className={w9StatusBadgeClasses(status)}>{w9StatusLabel(status)}</span>}
        </div>
        <div className="flex gap-1">
          {w9?.document_url && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => window.open(w9.document_url!, "_blank", "noopener,noreferrer")}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" /> {w9 ? "Edit" : "Add W-9"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : w9 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Legal Name: </span>{w9.legal_name || "—"}</div>
          <div><span className="text-muted-foreground">Tax Classification: </span>{w9.tax_classification || "—"}</div>
          <div><span className="text-muted-foreground">EIN (last 4): </span>{w9.ein_last_four ? `•••${w9.ein_last_four}` : "—"}</div>
          <div><span className="text-muted-foreground">Uploaded: </span>{format(new Date(w9.uploaded_date), "MM/dd/yyyy")}</div>
          <div className="col-span-2"><span className="text-muted-foreground">Renewal Due: </span>{w9.renewal_due_date ? format(new Date(w9.renewal_due_date), "MM/dd/yyyy") : "Not tracked"}</div>
          {w9.notes && <div className="col-span-2 text-muted-foreground border-t pt-1.5 mt-1">{w9.notes}</div>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No W-9 on file for this vendor yet.</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{w9 ? "Edit" : "Add"} W-9 — {vendorName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Legal Name (as on W-9)</Label>
              <Input className="h-8" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tax Classification</Label>
                <Select value={taxClassification} onValueChange={setTaxClassification}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_CLASSIFICATIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">EIN (last 4 digits)</Label>
                <Input className="h-8" maxLength={4} value={einLastFour} onChange={(e) => setEinLastFour(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Uploaded Date</Label>
                <DatePickerInput value={uploadedDate} onChange={setUploadedDate} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Renewal Due</Label>
                <DatePickerInput value={renewalDueDate} onChange={setRenewalDueDate} />
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
            <Button className="w-full gap-1.5" onClick={save} disabled={saving}>
              <Upload className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
