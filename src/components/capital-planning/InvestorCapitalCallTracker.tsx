import { useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2, Plus, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "./types";

/* ── types ── */
interface InvestorPosition {
  id: string;
  project_id: string;
  investing_entity: string;
  contact_name: string;
  ownership_pct: number;
  committed: number;
  contributed: number;
  distributed: number;
  unreturned_capital: number;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  projectId: string;
  positions: InvestorPosition[];
  reload: () => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

/* ── helpers ── */
function getStatus(committed: number, contributed: number) {
  if (committed <= 0) return "Unfunded";
  if (contributed >= committed) return "Funded";
  if (contributed > 0) return "Partial";
  return "Unfunded";
}

function statusBadgeVariant(s: string) {
  if (s === "Funded") return "default" as const;
  if (s === "Partial") return "secondary" as const;
  return "outline" as const;
}

function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(/[$,%\s]/g, "")) || 0;
}

/* ── Manual Entry Modal ── */
function InvestorModal({
  open, onOpenChange, position, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  position: Partial<InvestorPosition> | null;
  onSave: (fields: Partial<InvestorPosition>) => void;
}) {
  const [form, setForm] = useState<Partial<InvestorPosition>>({});
  const isEdit = !!position?.id;
  const active = { ...position, ...form };

  const handleSave = () => {
    if (!active.investing_entity?.trim()) { toast.error("Investing Entity is required"); return; }
    onSave(form);
    setForm({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setForm({}); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit JV Partner" : "Add JV Partner"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Investing Entity *</Label>
            <Input value={active.investing_entity ?? ""} onChange={e => setForm(f => ({ ...f, investing_entity: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input value={active.contact_name ?? ""} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Ownership %</Label>
            <Input type="number" value={active.ownership_pct ?? 0} onChange={e => setForm(f => ({ ...f, ownership_pct: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Committed ($)</Label>
              <Input type="number" value={active.committed ?? 0} onChange={e => setForm(f => ({ ...f, committed: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Contributed ($)</Label>
              <Input type="number" value={active.contributed ?? 0} onChange={e => setForm(f => ({ ...f, contributed: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Distributed ($)</Label>
            <Input type="number" value={active.distributed ?? 0} onChange={e => setForm(f => ({ ...f, distributed: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={active.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setForm({}); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Component ── */
export default function InvestorCapitalCallTracker({ projectId, positions, reload, selectable, selectedIds, onSelectionChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InvestorPosition | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...positions].sort((a, b) => a.investing_entity.localeCompare(b.investing_entity)),
    [positions]
  );

  const allSelected = selectable && sorted.length > 0 && sorted.every(p => selectedIds?.has(p.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(sorted.map(p => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  const totals = useMemo(() => {
    let ownershipPct = 0, committed = 0, contributed = 0, distributed = 0, unreturned = 0;
    for (const p of positions) {
      ownershipPct += Number(p.ownership_pct);
      committed += Number(p.committed);
      contributed += Number(p.contributed);
      distributed += Number(p.distributed);
      unreturned += Number(p.unreturned_capital);
    }
    return { ownershipPct, committed, contributed, remaining: committed - contributed, distributed, unreturned };
  }, [positions]);

  const pctCalled = totals.committed > 0 ? Math.min((totals.contributed / totals.committed) * 100, 100) : 0;

  /* ── save manual entry ── */
  const handleSave = useCallback(async (fields: Partial<InvestorPosition>) => {
    if (editing) {
      const { error } = await supabase.from("investor_positions").update({
        ...fields,
        updated_at: new Date().toISOString(),
      } as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Partner updated");
    } else {
      const { error } = await supabase.from("investor_positions").insert({
        project_id: projectId,
        investing_entity: fields.investing_entity ?? "",
        contact_name: fields.contact_name ?? "",
        ownership_pct: fields.ownership_pct ?? 0,
        committed: fields.committed ?? 0,
        contributed: fields.contributed ?? 0,
        distributed: fields.distributed ?? 0,
        unreturned_capital: 0,
        notes: fields.notes ?? null,
        source: "Manual",
      } as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Partner added");
    }
    setEditing(null);
    reload();
  }, [editing, projectId, reload]);

  /* ── CSV upload ── */
  const handleCsvUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length === 0) { toast.error("No data rows found in CSV"); return; }

      let upserted = 0;
      for (const row of rows) {
        const entity = row["Investing Entity"] ?? row["investing_entity"] ?? "";
        if (!entity.trim()) continue;

        const ownershipPct = parseNum(row["Ownership"] ?? row["Ownership %"] ?? row["ownership_pct"] ?? row["Own %"]);

        // Skip former investors with 0% ownership
        if (ownershipPct === 0) {
          // If they previously existed, remove them
          const { data: existing } = await supabase
            .from("investor_positions")
            .select("id")
            .eq("project_id", projectId)
            .eq("investing_entity", entity.trim())
            .eq("source", "AppFolio")
            .limit(1) as any;
          if (existing && existing.length > 0) {
            await supabase.from("investor_positions").delete().eq("id", existing[0].id) as any;
          }
          continue;
        }

        const payload = {
          investing_entity: entity.trim(),
          contact_name: (row["Associated Contacts"] ?? row["contact_name"] ?? "").trim(),
          ownership_pct: ownershipPct,
          committed: parseNum(row["Committed"] ?? row["committed"]),
          contributed: parseNum(row["Contributed"] ?? row["contributed"]),
          distributed: parseNum(row["Distributed"] ?? row["distributed"]),
          unreturned_capital: parseNum(row["Unreturned Capital"] ?? row["unreturned_capital"]),
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from("investor_positions")
          .select("id")
          .eq("project_id", projectId)
          .eq("investing_entity", payload.investing_entity)
          .eq("source", "AppFolio")
          .limit(1) as any;

        if (existing && existing.length > 0) {
          await supabase.from("investor_positions").update(payload as any).eq("id", existing[0].id);
        } else {
          await supabase.from("investor_positions").insert({
            ...payload,
            project_id: projectId,
            source: "AppFolio",
          } as any);
        }
        upserted++;
      }
      toast.success(`${upserted} investor record(s) imported/updated`);
      reload();
    } catch (err: any) {
      toast.error("CSV parse error: " + (err?.message ?? "Unknown"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [projectId, reload]);

  const handleDelete = useCallback(async (id: string) => {
    const { error } = await supabase.from("investor_positions").delete().eq("id", id) as any;
    if (error) { toast.error(error.message); return; }
    toast.success("Record deleted");
    reload();
  }, [reload]);

  return (
    <div className="space-y-5">
      {/* Progress Card */}
      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Capital Call Progress</h3>
          <span className="text-sm font-semibold text-foreground">{pctCalled.toFixed(1)}% Called</span>
        </div>
        <Progress value={pctCalled} className="h-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          {[
            { label: "Total Committed", value: fmt(totals.committed) },
            { label: "Total Contributed", value: fmt(totals.contributed) },
            { label: "Total Remaining", value: fmt(totals.remaining) },
            { label: "Total Distributed", value: fmt(totals.distributed) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="h-4 w-4" /> Investor Positions
        </h2>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" /> {uploading ? "Importing…" : "Import AppFolio CSV"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add JV Partner
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
              {selectable && (
                <th className="px-3 py-2 w-8">
                  <Checkbox checked={!!allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
              )}
              <th className="px-3 py-2">Investor Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Own %</th>
              <th className="px-3 py-2 text-right">Committed</th>
              <th className="px-3 py-2 text-right">Contributed</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-right">Distributed</th>
              <th className="px-3 py-2 text-right">Unreturned</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(pos => {
              const remaining = Number(pos.committed) - Number(pos.contributed);
              const status = getStatus(Number(pos.committed), Number(pos.contributed));
              return (
                <tr key={pos.id} className="border-t hover:bg-muted/20">
                  {selectable && (
                    <td className="px-3 py-2">
                      <Checkbox checked={selectedIds?.has(pos.id) ?? false} onCheckedChange={() => toggleOne(pos.id)} aria-label={`Select ${pos.investing_entity}`} />
                    </td>
                  )}
                  <td className="px-3 py-2">{pos.investing_entity || "—"}</td>
                  <td className="px-3 py-2">{pos.contact_name || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(pos.ownership_pct).toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right">{fmt(Number(pos.committed))}</td>
                  <td className="px-3 py-2 text-right">{fmt(Number(pos.contributed))}</td>
                  <td className="px-3 py-2 text-right">{fmt(remaining)}</td>
                  <td className="px-3 py-2 text-right">{fmt(Number(pos.distributed))}</td>
                  <td className="px-3 py-2 text-right">{fmt(Number(pos.unreturned_capital))}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusBadgeVariant(status)} className="text-xs">{status}</Badge>
                  </td>
                  <td className="px-2 py-2 flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(pos); setModalOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(pos.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={selectable ? 12 : 10} className="px-3 py-6 text-center text-muted-foreground text-xs">No investor positions yet. Import a CSV or add a JV partner.</td></tr>
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold text-sm">
                {selectable && <td className="px-3 py-2" />}
                <td className="px-3 py-2" colSpan={2}>Totals</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{totals.ownershipPct.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right">{fmt(totals.committed)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.contributed)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.remaining)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.distributed)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.unreturned)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      <InvestorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        position={editing}
        onSave={handleSave}
      />
    </div>
  );
}
