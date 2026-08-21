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
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fmt } from "@/components/budget/types";

export const COVERAGE_TYPES = [
  "General Liability",
  "Auto",
  "Workers Comp",
  "Umbrella/Excess",
  "Errors & Omissions",
  "Professional Liability",
] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

interface CoiRequirement {
  id: string;
  contract_id: string;
  coverage_type: CoverageType;
  required_limit: number | null;
  notes: string | null;
}

interface Coi {
  id: string;
  contract_id: string;
  coverage_type: CoverageType;
  carrier: string | null;
  policy_number: string | null;
  actual_limit: number | null;
  effective_date: string | null;
  expiration_date: string;
  document_url: string | null;
  document_name: string | null;
  notes: string | null;
}

// A coverage type is "satisfied" when there's a current (latest expiration_date
// among its certs) COI on file, not expired, and (if a limit is required) its
// actual_limit meets or exceeds the requirement.
export type CoiStatus = "expired" | "expiring" | "insufficient" | "missing" | "current";

export function computeCoiStatus(requirements: CoiRequirement[], certs: Coi[]): {
  overall: CoiStatus;
  byType: Record<string, { status: CoiStatus; current: Coi | null; requirement: CoiRequirement | null }>;
} {
  const byType: Record<string, { status: CoiStatus; current: Coi | null; requirement: CoiRequirement | null }> = {};
  const today = new Date();

  for (const req of requirements) {
    const certsForType = certs
      .filter((c) => c.coverage_type === req.coverage_type)
      .sort((a, b) => new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime());
    const current = certsForType[0] ?? null;

    let status: CoiStatus = "missing";
    if (current) {
      const daysToExpiry = differenceInCalendarDays(new Date(current.expiration_date), today);
      if (daysToExpiry < 0) status = "expired";
      else if (req.required_limit && current.actual_limit != null && current.actual_limit < req.required_limit) status = "insufficient";
      else if (daysToExpiry <= 30) status = "expiring";
      else status = "current";
    }
    byType[req.coverage_type] = { status, current, requirement: req };
  }

  const statuses = Object.values(byType).map((v) => v.status);
  let overall: CoiStatus = "current";
  if (statuses.includes("expired")) overall = "expired";
  else if (statuses.includes("missing")) overall = "missing";
  else if (statuses.includes("insufficient")) overall = "insufficient";
  else if (statuses.includes("expiring")) overall = "expiring";

  return { overall, byType };
}

export const coiStatusBadgeClasses = (status: CoiStatus) =>
  cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
    status === "current" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "expiring" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    (status === "expired" || status === "insufficient") && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    status === "missing" && "bg-muted text-muted-foreground"
  );

export const coiStatusLabel = (status: CoiStatus) => ({
  current: "Current",
  expiring: "Expiring Soon",
  expired: "Expired",
  insufficient: "Insufficient",
  missing: "Missing",
}[status]);

interface Props {
  contractId: string;
  contractLabel: string;
  vendorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: () => void; // called after any save/delete so the parent can refresh its badge
}

export default function CoiPanel({ contractId, contractLabel, vendorName, open, onOpenChange, onStatusChange }: Props) {
  const [requirements, setRequirements] = useState<CoiRequirement[]>([]);
  const [certs, setCerts] = useState<Coi[]>([]);
  const [loading, setLoading] = useState(true);

  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqEditingId, setReqEditingId] = useState<string | null>(null);
  const [reqCoverageType, setReqCoverageType] = useState<CoverageType>("General Liability");
  const [reqLimit, setReqLimit] = useState<number | "">("");
  const [reqNotes, setReqNotes] = useState("");

  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [certEditingId, setCertEditingId] = useState<string | null>(null);
  const [certCoverageType, setCertCoverageType] = useState<CoverageType>("General Liability");
  const [certCarrier, setCertCarrier] = useState("");
  const [certPolicyNumber, setCertPolicyNumber] = useState("");
  const [certLimit, setCertLimit] = useState<number | "">("");
  const [certEffective, setCertEffective] = useState<Date | undefined>(undefined);
  const [certExpiration, setCertExpiration] = useState<Date | undefined>(undefined);
  const [certNotes, setCertNotes] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certDocUrl, setCertDocUrl] = useState<string | null>(null);
  const [certDocName, setCertDocName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [reqRes, certRes] = await Promise.all([
      supabase.from("coi_requirements").select("*").eq("contract_id", contractId),
      supabase.from("certificates_of_insurance").select("*").eq("contract_id", contractId).order("expiration_date", { ascending: false }),
    ]);
    setRequirements((reqRes.data as CoiRequirement[]) ?? []);
    setCerts((certRes.data as Coi[]) ?? []);
    setLoading(false);
  }, [contractId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const { byType } = useMemo(() => computeCoiStatus(requirements, certs), [requirements, certs]);

  const requiredTypesInUse = new Set(requirements.map((r) => r.coverage_type));
  const availableTypesForNewReq = COVERAGE_TYPES.filter((t) => !requiredTypesInUse.has(t));

  const resetReqForm = () => {
    setReqEditingId(null);
    setReqCoverageType(availableTypesForNewReq[0] ?? "General Liability");
    setReqLimit("");
    setReqNotes("");
  };

  const openEditReq = (r: CoiRequirement) => {
    setReqEditingId(r.id);
    setReqCoverageType(r.coverage_type);
    setReqLimit(r.required_limit ?? "");
    setReqNotes(r.notes ?? "");
    setReqDialogOpen(true);
  };

  const saveRequirement = async () => {
    const payload = {
      contract_id: contractId,
      coverage_type: reqCoverageType,
      required_limit: reqLimit === "" ? null : Number(reqLimit),
      notes: reqNotes || null,
    };
    const { error } = reqEditingId
      ? await supabase.from("coi_requirements").update(payload).eq("id", reqEditingId)
      : await supabase.from("coi_requirements").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(reqEditingId ? "Requirement updated" : "Requirement added");
    setReqDialogOpen(false);
    resetReqForm();
    load();
    onStatusChange?.();
  };

  const deleteRequirement = async (id: string) => {
    const { error } = await supabase.from("coi_requirements").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Requirement removed");
    load();
    onStatusChange?.();
  };

  const resetCertForm = () => {
    setCertEditingId(null);
    setCertCoverageType("General Liability");
    setCertCarrier("");
    setCertPolicyNumber("");
    setCertLimit("");
    setCertEffective(undefined);
    setCertExpiration(undefined);
    setCertNotes("");
    setCertFile(null);
    setCertDocUrl(null);
    setCertDocName(null);
  };

  const openEditCert = (c: Coi) => {
    setCertEditingId(c.id);
    setCertCoverageType(c.coverage_type);
    setCertCarrier(c.carrier ?? "");
    setCertPolicyNumber(c.policy_number ?? "");
    setCertLimit(c.actual_limit ?? "");
    setCertEffective(c.effective_date ? new Date(c.effective_date) : undefined);
    setCertExpiration(new Date(c.expiration_date));
    setCertNotes(c.notes ?? "");
    setCertFile(null);
    setCertDocUrl(c.document_url);
    setCertDocName(c.document_name);
    setCertDialogOpen(true);
  };

  const saveCert = async () => {
    if (!certExpiration) { toast.error("Expiration date is required."); return; }
    setUploading(true);
    let docUrl = certDocUrl;
    let docName = certDocName;
    let docPath: string | null = null;

    if (certFile) {
      const timestamp = Date.now();
      const path = `${contractId}/coi/${timestamp}-${certFile.name}`;
      const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, certFile);
      if (uploadError) {
        toast.error(`File upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("project-documents").getPublicUrl(path);
      docUrl = urlData.publicUrl;
      docName = certFile.name;
      docPath = path;
    }

    const payload = {
      contract_id: contractId,
      coverage_type: certCoverageType,
      carrier: certCarrier || null,
      policy_number: certPolicyNumber || null,
      actual_limit: certLimit === "" ? null : Number(certLimit),
      effective_date: certEffective ? format(certEffective, "yyyy-MM-dd") : null,
      expiration_date: format(certExpiration, "yyyy-MM-dd"),
      notes: certNotes || null,
      document_url: docUrl,
      document_name: docName,
      ...(docPath ? { document_path: docPath } : {}),
    };

    const { error } = certEditingId
      ? await supabase.from("certificates_of_insurance").update(payload).eq("id", certEditingId)
      : await supabase.from("certificates_of_insurance").insert(payload);
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(certEditingId ? "Certificate updated" : "Certificate added");
    setCertDialogOpen(false);
    resetCertForm();
    load();
    onStatusChange?.();
  };

  const deleteCert = async (id: string) => {
    const { error } = await supabase.from("certificates_of_insurance").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Certificate removed");
    load();
    onStatusChange?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Certificates of Insurance — {contractLabel}</DialogTitle>
            <p className="text-sm text-muted-foreground">{vendorName}</p>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Required Coverage</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={availableTypesForNewReq.length === 0}
                  onClick={() => { resetReqForm(); setReqDialogOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Requirement
                </Button>
              </div>

              {requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No coverage requirements set for this contract yet.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 text-muted-foreground text-left text-xs">
                        <th className="px-3 py-2">Coverage Type</th>
                        <th className="px-3 py-2 text-right">Required Limit</th>
                        <th className="px-3 py-2 text-right">Actual Limit</th>
                        <th className="px-3 py-2">Current Cert Expires</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {requirements.map((r) => {
                        const info = byType[r.coverage_type];
                        return (
                          <tr key={r.id} className="border-t">
                            <td className="px-3 py-2">{r.coverage_type}</td>
                            <td className="px-3 py-2 text-right">{r.required_limit ? fmt(r.required_limit) : "—"}</td>
                            <td className="px-3 py-2 text-right">{info?.current?.actual_limit ? fmt(info.current.actual_limit) : "—"}</td>
                            <td className="px-3 py-2">{info?.current ? format(new Date(info.current.expiration_date), "MM/dd/yyyy") : "—"}</td>
                            <td className="px-3 py-2">
                              <span className={coiStatusBadgeClasses(info?.status ?? "missing")}>
                                {coiStatusLabel(info?.status ?? "missing")}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit requirement" onClick={() => openEditReq(r)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete requirement" onClick={() => deleteRequirement(r.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <h3 className="text-sm font-medium">Certificate History</h3>
                <Button size="sm" className="gap-1.5" onClick={() => { resetCertForm(); setCertDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Log Certificate
                </Button>
              </div>

              {certs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No certificates logged yet.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 text-muted-foreground text-left text-xs">
                        <th className="px-3 py-2">Coverage Type</th>
                        <th className="px-3 py-2">Carrier</th>
                        <th className="px-3 py-2">Policy #</th>
                        <th className="px-3 py-2 text-right">Limit</th>
                        <th className="px-3 py-2">Effective</th>
                        <th className="px-3 py-2">Expires</th>
                        <th className="px-3 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {certs.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="px-3 py-2">{c.coverage_type}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.carrier ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.policy_number ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{c.actual_limit ? fmt(c.actual_limit) : "—"}</td>
                          <td className="px-3 py-2">{c.effective_date ? format(new Date(c.effective_date), "MM/dd/yyyy") : "—"}</td>
                          <td className="px-3 py-2">{format(new Date(c.expiration_date), "MM/dd/yyyy")}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {c.document_url && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Open document" onClick={() => window.open(c.document_url!, "_blank", "noopener,noreferrer")}>
                                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditCert(c)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => deleteCert(c.id)}>
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Requirement add/edit dialog */}
      <Dialog open={reqDialogOpen} onOpenChange={setReqDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{reqEditingId ? "Edit" : "Add"} Coverage Requirement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Coverage Type</Label>
              <Select value={reqCoverageType} onValueChange={(v) => setReqCoverageType(v as CoverageType)} disabled={!!reqEditingId}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(reqEditingId ? COVERAGE_TYPES : availableTypesForNewReq).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Required Limit ($)</Label>
              <Input type="number" className="h-8" value={reqLimit} onChange={(e) => setReqLimit(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 1000000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm" rows={2} value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={saveRequirement}>{reqEditingId ? "Save" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Certificate add/edit dialog */}
      <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{certEditingId ? "Edit" : "Log"} Certificate of Insurance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Coverage Type</Label>
              <Select value={certCoverageType} onValueChange={(v) => setCertCoverageType(v as CoverageType)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVERAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Carrier</Label>
                <Input className="h-8" value={certCarrier} onChange={(e) => setCertCarrier(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Policy #</Label>
                <Input className="h-8" value={certPolicyNumber} onChange={(e) => setCertPolicyNumber(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Actual Limit ($)</Label>
              <Input type="number" className="h-8" value={certLimit} onChange={(e) => setCertLimit(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Effective Date</Label>
                <DatePickerInput value={certEffective} onChange={setCertEffective} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiration Date</Label>
                <DatePickerInput value={certExpiration} onChange={setCertExpiration} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Document</Label>
              {certDocUrl && !certFile ? (
                <div className="flex items-center gap-2 text-xs">
                  <a href={certDocUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">{certDocName}</a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setCertDocUrl(null); setCertDocName(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="application/pdf,image/*"
                    className="h-8 text-xs"
                    onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm" rows={2} value={certNotes} onChange={(e) => setCertNotes(e.target.value)} />
            </div>
            <Button className="w-full gap-1.5" onClick={saveCert} disabled={uploading}>
              <Upload className="h-3.5 w-3.5" /> {uploading ? "Saving…" : certEditingId ? "Save" : "Log Certificate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
