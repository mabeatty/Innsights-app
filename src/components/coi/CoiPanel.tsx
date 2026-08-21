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

interface CoverageLine {
  id: string;
  certificate_id: string;
  coverage_type: CoverageType;
  actual_limit: number | null;
  effective_date: string | null;
  expiration_date: string;
}

interface Certificate {
  id: string;
  contract_id: string;
  carrier: string | null;
  policy_number: string | null;
  document_url: string | null;
  document_name: string | null;
  document_path: string | null;
  notes: string | null;
  lines: CoverageLine[];
}

export type CoiStatus = "expired" | "expiring" | "insufficient" | "missing" | "current";

export function computeCoiStatus(requirements: CoiRequirement[], certificates: Certificate[]): {
  overall: CoiStatus;
  byType: Record<string, { status: CoiStatus; current: CoverageLine | null; requirement: CoiRequirement | null }>;
} {
  const allLines = certificates.flatMap((c) => c.lines);
  const byType: Record<string, { status: CoiStatus; current: CoverageLine | null; requirement: CoiRequirement | null }> = {};
  const today = new Date();

  for (const req of requirements) {
    const linesForType = allLines
      .filter((l) => l.coverage_type === req.coverage_type)
      .sort((a, b) => new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime());
    const current = linesForType[0] ?? null;

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

interface DraftLine {
  key: string;
  coverage_type: CoverageType;
  actual_limit: number | "";
  effective_date: Date | undefined;
  expiration_date: Date | undefined;
}

interface Props {
  contractId: string;
  contractLabel: string;
  vendorName: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: () => void;
}

export default function CoiPanel({ contractId, contractLabel, vendorName, projectId, open, onOpenChange, onStatusChange }: Props) {
  const [requirements, setRequirements] = useState<CoiRequirement[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqEditingId, setReqEditingId] = useState<string | null>(null);
  const [reqCoverageType, setReqCoverageType] = useState<CoverageType>("General Liability");
  const [reqLimit, setReqLimit] = useState<number | "">("");
  const [reqNotes, setReqNotes] = useState("");

  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [certEditingId, setCertEditingId] = useState<string | null>(null);
  const [certCarrier, setCertCarrier] = useState("");
  const [certPolicyNumber, setCertPolicyNumber] = useState("");
  const [certNotes, setCertNotes] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certDocUrl, setCertDocUrl] = useState<string | null>(null);
  const [certDocName, setCertDocName] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [reqRes, certRes] = await Promise.all([
      supabase.from("coi_requirements").select("*").eq("contract_id", contractId),
      supabase.from("certificates_of_insurance").select("*, coi_coverage_lines(*)").eq("contract_id", contractId).order("created_at", { ascending: false }),
    ]);
    setRequirements((reqRes.data as CoiRequirement[]) ?? []);
    setCertificates(
      ((certRes.data ?? []) as any[]).map((c) => ({ ...c, lines: (c.coi_coverage_lines ?? []) as CoverageLine[] }))
    );
    setLoading(false);
  }, [contractId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const { byType } = useMemo(() => computeCoiStatus(requirements, certificates), [requirements, certificates]);

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

  const newDraftLine = (): DraftLine => ({
    key: `${Date.now()}-${Math.random()}`,
    coverage_type: "General Liability",
    actual_limit: "",
    effective_date: undefined,
    expiration_date: undefined,
  });

  const resetCertForm = () => {
    setCertEditingId(null);
    setCertCarrier("");
    setCertPolicyNumber("");
    setCertNotes("");
    setCertFile(null);
    setCertDocUrl(null);
    setCertDocName(null);
    setDraftLines([newDraftLine()]);
  };

  const openEditCert = (c: Certificate) => {
    setCertEditingId(c.id);
    setCertCarrier(c.carrier ?? "");
    setCertPolicyNumber(c.policy_number ?? "");
    setCertNotes(c.notes ?? "");
    setCertFile(null);
    setCertDocUrl(c.document_url);
    setCertDocName(c.document_name);
    setDraftLines(
      c.lines.length > 0
        ? c.lines.map((l) => ({
            key: l.id,
            coverage_type: l.coverage_type,
            actual_limit: l.actual_limit ?? "",
            effective_date: l.effective_date ? new Date(l.effective_date) : undefined,
            expiration_date: new Date(l.expiration_date),
          }))
        : [newDraftLine()]
    );
    setCertDialogOpen(true);
  };

  const addDraftLine = () => setDraftLines((prev) => [...prev, newDraftLine()]);
  const removeDraftLine = (key: string) => setDraftLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  const updateDraftLine = (key: string, patch: Partial<DraftLine>) =>
    setDraftLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const saveCert = async () => {
    const validLines = draftLines.filter((l) => l.expiration_date);
    if (validLines.length === 0) { toast.error("At least one coverage line with an expiration date is required."); return; }

    setSaving(true);
    let docUrl = certDocUrl;
    let docName = certDocName;
    let docPath: string | null = null;

    if (certFile) {
      const timestamp = Date.now();
      const path = `${projectId}/contracts/${contractId}/coi/${timestamp}-${certFile.name}`;
      const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, certFile);
      if (uploadError) {
        toast.error(`File upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("project-documents").getPublicUrl(path);
      docUrl = urlData.publicUrl;
      docName = certFile.name;
      docPath = path;
    }

    const certPayload = {
      contract_id: contractId,
      carrier: certCarrier || null,
      policy_number: certPolicyNumber || null,
      notes: certNotes || null,
      document_url: docUrl,
      document_name: docName,
      ...(docPath ? { document_path: docPath } : {}),
    };

    let certificateId = certEditingId;
    if (certEditingId) {
      const { error } = await supabase.from("certificates_of_insurance").update(certPayload).eq("id", certEditingId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await supabase.from("coi_coverage_lines").delete().eq("certificate_id", certEditingId);
    } else {
      const { data, error } = await supabase.from("certificates_of_insurance").insert(certPayload).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      certificateId = data.id;
    }

    const linesPayload = validLines.map((l) => ({
      certificate_id: certificateId,
      coverage_type: l.coverage_type,
      actual_limit: l.actual_limit === "" ? null : Number(l.actual_limit),
      effective_date: l.effective_date ? format(l.effective_date, "yyyy-MM-dd") : null,
      expiration_date: format(l.expiration_date!, "yyyy-MM-dd"),
    }));
    const { error: linesError } = await supabase.from("coi_coverage_lines").insert(linesPayload);
    setSaving(false);
    if (linesError) { toast.error(linesError.message); return; }

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
                        <th className="px-3 py-2">Current Expires</th>
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
                <h3 className="text-sm font-medium">Certificates on File</h3>
                <Button size="sm" className="gap-1.5" onClick={() => { resetCertForm(); setCertDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Log Certificate
                </Button>
              </div>

              {certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No certificates logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {certificates.map((c) => (
                    <div key={c.id} className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                        <div className="text-sm">
                          <span className="font-medium">{c.carrier || "Unknown carrier"}</span>
                          {c.policy_number && <span className="text-muted-foreground"> · Policy {c.policy_number}</span>}
                        </div>
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
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/10 text-muted-foreground text-left text-xs">
                            <th className="px-3 py-1.5">Coverage</th>
                            <th className="px-3 py-1.5 text-right">Limit</th>
                            <th className="px-3 py-1.5">Effective</th>
                            <th className="px-3 py-1.5">Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.lines.map((l) => (
                            <tr key={l.id} className="border-t">
                              <td className="px-3 py-1.5">{l.coverage_type}</td>
                              <td className="px-3 py-1.5 text-right">{l.actual_limit ? fmt(l.actual_limit) : "—"}</td>
                              <td className="px-3 py-1.5">{l.effective_date ? format(new Date(l.effective_date), "MM/dd/yyyy") : "—"}</td>
                              <td className="px-3 py-1.5">{format(new Date(l.expiration_date), "MM/dd/yyyy")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{certEditingId ? "Edit" : "Log"} Certificate of Insurance</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
              <Label className="text-xs">Document</Label>
              {certDocUrl && !certFile ? (
                <div className="flex items-center gap-2 text-xs">
                  <a href={certDocUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">{certDocName}</a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setCertDocUrl(null); setCertDocName(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  className="h-8 text-xs"
                  onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Coverage Lines</Label>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addDraftLine}>
                  <Plus className="h-3 w-3" /> Add Coverage
                </Button>
              </div>
              <div className="space-y-2">
                {draftLines.map((line) => (
                  <div key={line.key} className="grid grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_auto] gap-2 items-end border rounded-md p-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Coverage Type</Label>
                      <Select value={line.coverage_type} onValueChange={(v) => updateDraftLine(line.key, { coverage_type: v as CoverageType })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COVERAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Limit ($)</Label>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={line.actual_limit}
                        onChange={(e) => updateDraftLine(line.key, { actual_limit: e.target.value === "" ? "" : Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Effective</Label>
                      <DatePickerInput value={line.effective_date} onChange={(d) => updateDraftLine(line.key, { effective_date: d })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Expires</Label>
                      <DatePickerInput value={line.expiration_date} onChange={(d) => updateDraftLine(line.key, { expiration_date: d })} />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={draftLines.length === 1}
                      onClick={() => removeDraftLine(line.key)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm" rows={2} value={certNotes} onChange={(e) => setCertNotes(e.target.value)} />
            </div>
            <Button className="w-full gap-1.5" onClick={saveCert} disabled={saving}>
              <Upload className="h-3.5 w-3.5" /> {saving ? "Saving…" : certEditingId ? "Save" : "Log Certificate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
