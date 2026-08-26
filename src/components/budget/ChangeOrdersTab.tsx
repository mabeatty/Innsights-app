import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Plus, Pencil, Trash2, ExternalLink, Link } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BudgetRow, ALL_DIVISIONS, fmt, Contract } from "./types";

const CO_STATUSES = ["Proposed", "Under Review", "Approved", "Rejected"] as const;

export interface ChangeOrder {
  id: string;
  project_id: string;
  contract_id: string | null;
  co_number: number;
  date: string;
  description: string;
  division_number: string;
  division_name: string;
  amount: number;
  status: string;
  document_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  projectId: string;
  budgetRows: BudgetRow[];
  onBudgetReload: () => void;
}

export default function ChangeOrdersTab({ projectId, budgetRows, onBudgetReload }: Props) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ChangeOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Form state
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formContractId, setFormContractId] = useState<string>("");
  const [formDescription, setFormDescription] = useState("");
  const [formDivision, setFormDivision] = useState("");
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<string>("Proposed");
  const [formDocUrl, setFormDocUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Schedule impact: which critical-path tasks this CO shifts, and by how many days.
  const [criticalPathTasks, setCriticalPathTasks] = useState<{ id: string; task_name: string }[]>([]);
  const [scheduleImpacts, setScheduleImpacts] = useState<{ task_id: string; days: number }[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("change_orders")
      .select("*")
      .eq("project_id", projectId)
      .order("co_number", { ascending: true });
    if (error) toast.error("Failed to load change orders.");
    else setChangeOrders((data ?? []) as ChangeOrder[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const [cRes, vRes, tRes] = await Promise.all([
        supabase.from("contracts").select("*").eq("project_id", projectId).order("contract_number"),
        supabase.from("vendors").select("id, name").eq("project_id", projectId).order("name"),
        supabase.from("critical_path_tasks").select("id, task_name").eq("project_id", projectId).order("sort_order"),
      ]);
      if (!cRes.error) setContracts((cRes.data ?? []) as Contract[]);
      if (!vRes.error) setVendors((vRes.data ?? []) as { id: string; name: string }[]);
      if (!tRes.error) setCriticalPathTasks((tRes.data ?? []) as { id: string; task_name: string }[]);
    })();
  }, [projectId]);

  const contractLabel = useCallback((id: string | null) => {
    if (!id) return null;
    const c = contracts.find(x => x.id === id);
    if (!c) return null;
    const vName = vendors.find(v => v.id === c.vendor_id)?.name;
    return `${c.contract_number || "—"}${vName ? ` · ${vName}` : ""}`;
  }, [contracts, vendors]);

  // Summary calculations
  const originalContractValue = useMemo(
    () => budgetRows.reduce((s, r) => s + Number(r.scheduled_value), 0),
    [budgetRows]
  );

  const approvedCOTotal = useMemo(
    () => changeOrders
      .filter(co => co.status === "Approved")
      .reduce((s, co) => s + Number(co.amount), 0),
    [changeOrders]
  );

  // Note: originalContractValue from budgetRows already includes approved CO adjustments
  // So revised = originalContractValue (which already has CO adjustments baked in)
  // We need to show: Original = current scheduled - approved COs, Approved COs, Revised = current scheduled
  const displayOriginal = originalContractValue - approvedCOTotal;
  const revisedContractValue = originalContractValue;

  const nextCoNumber = changeOrders.length > 0
    ? Math.max(...changeOrders.map(co => co.co_number)) + 1
    : 1;

  const resetForm = () => {
    setFormDate(new Date());
    setFormContractId("");
    setFormDescription("");
    setFormDivision("");
    setFormAmount(0);
    setFormStatus("Proposed");
    setFormDocUrl("");
    setFormNotes("");
    setScheduleImpacts([]);
  };

  const openEdit = (co: ChangeOrder) => {
    setEditingId(co.id);
    setFormDate(new Date(co.date));
    setFormContractId(co.contract_id ?? "");
    setFormDescription(co.description);
    setFormDivision(co.division_number);
    setFormAmount(Number(co.amount));
    setFormStatus(co.status);
    setFormDocUrl(co.document_url ?? "");
    setFormNotes(co.notes ?? "");
    setScheduleImpacts([]);
    supabase
      .from("change_order_schedule_impacts")
      .select("critical_path_task_id, impact_days")
      .eq("change_order_id", co.id)
      .then(({ data }) => {
        if (data) setScheduleImpacts(data.map(d => ({ task_id: d.critical_path_task_id, days: d.impact_days })));
      });
    setDialogOpen(true);
  };

  const applyBudgetAdjustment = async (divisionNumber: string, amount: number) => {
    const budgetRow = budgetRows.find(r => r.division_number === divisionNumber);
    if (!budgetRow) return;
    const newValue = Number(budgetRow.scheduled_value) + amount;
    const { error } = await supabase
      .from("project_budget")
      .update({ scheduled_value: newValue })
      .eq("id", budgetRow.id);
    if (error) toast.error("Failed to update budget.");
    else onBudgetReload();
  };

  // Save (upsert) the CO's schedule-impact rows, and — only when the CO is
  // Approved — apply each day-shift to its critical-path task (cascading to
  // critical successors via the DB function). Impacts are tracked per-row as
  // `applied` so approving twice doesn't double-shift the schedule.
  const saveAndApplyScheduleImpacts = async (changeOrderId: string, nowApproved: boolean) => {
    const rows = scheduleImpacts.filter(si => si.task_id && si.days !== 0);

    // Replace existing impact rows for this CO with the current form state.
    await supabase.from("change_order_schedule_impacts").delete().eq("change_order_id", changeOrderId);
    if (rows.length === 0) return;

    const { data: inserted, error } = await supabase
      .from("change_order_schedule_impacts")
      .insert(rows.map(r => ({ change_order_id: changeOrderId, critical_path_task_id: r.task_id, impact_days: r.days })))
      .select();
    if (error) { toast.error("Failed to save schedule impact."); return; }

    if (nowApproved) {
      for (const row of inserted ?? []) {
        const { error: rpcErr } = await supabase.rpc("apply_schedule_impact", {
          p_task_id: row.critical_path_task_id,
          p_days: row.impact_days,
        });
        if (!rpcErr) {
          await supabase.from("change_order_schedule_impacts").update({ applied: true, applied_at: new Date().toISOString() }).eq("id", row.id);
        }
      }
      toast.success("Critical path updated with this change order's schedule impact.");
    }
  };

  const handleSave = async () => {
    if (!formDescription) { toast.error("Please enter a description."); return; }
    if (!formDivision) { toast.error("Please select a division."); return; }
    setSaving(true);

    try {
      const div = ALL_DIVISIONS.find(d => d.number === formDivision);
      const oldCO = editingId ? changeOrders.find(co => co.id === editingId) : null;

      if (editingId && oldCO) {
        // If status was Approved and is changing away, reverse adjustment
        if (oldCO.status === "Approved" && formStatus !== "Approved") {
          await applyBudgetAdjustment(oldCO.division_number, -Number(oldCO.amount));
        }
        // If status was Approved and staying Approved but amount/division changed
        if (oldCO.status === "Approved" && formStatus === "Approved") {
          // Reverse old
          await applyBudgetAdjustment(oldCO.division_number, -Number(oldCO.amount));
          // Apply new
          await applyBudgetAdjustment(formDivision, formAmount);
        }
        // If status is changing TO Approved
        if (oldCO.status !== "Approved" && formStatus === "Approved") {
          await applyBudgetAdjustment(formDivision, formAmount);
        }

        const { error } = await supabase
          .from("change_orders")
          .update({
            contract_id: formContractId || null,
            date: format(formDate, "yyyy-MM-dd"),
            description: formDescription,
            division_number: formDivision,
            division_name: div?.name ?? "",
            amount: formAmount,
            status: formStatus,
            document_url: formDocUrl || null,
            notes: formNotes || null,
          })
          .eq("id", editingId);
        if (error) throw error;
        await saveAndApplyScheduleImpacts(editingId, formStatus === "Approved" && oldCO.status !== "Approved");
        toast.success("Change order updated.");
      } else {
        // New change order
        if (formStatus === "Approved") {
          await applyBudgetAdjustment(formDivision, formAmount);
        }

        const { data: newCO, error } = await supabase
          .from("change_orders")
          .insert({
            project_id: projectId,
            contract_id: formContractId || null,
            co_number: nextCoNumber,
            date: format(formDate, "yyyy-MM-dd"),
            description: formDescription,
            division_number: formDivision,
            division_name: div?.name ?? "",
            amount: formAmount,
            status: formStatus,
            document_url: formDocUrl || null,
            notes: formNotes || null,
          })
          .select()
          .single();
        if (error) throw error;
        await saveAndApplyScheduleImpacts(newCO.id, formStatus === "Approved");
        toast.success("Change order added.");
      }

      setDialogOpen(false);
      setEditingId(null);
      resetForm();
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save change order.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      // If approved, reverse the budget adjustment
      if (deleteTarget.status === "Approved") {
        await applyBudgetAdjustment(deleteTarget.division_number, -Number(deleteTarget.amount));
      }
      const { error } = await supabase
        .from("change_orders")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`CO-${String(deleteTarget.co_number).padStart(3, "0")} deleted.`);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete change order.");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading change orders…</p>;

  return (
    <div className="space-y-4 pt-2">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Original Contract Value</p>
            <p className="text-xl font-bold">{fmt(displayOriginal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Approved Change Orders</p>
            <p className={cn("text-xl font-bold", approvedCOTotal > 0 && "text-primary", approvedCOTotal < 0 && "text-destructive")}>
              {approvedCOTotal >= 0 ? "+" : ""}{fmt(approvedCOTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Revised Contract Value</p>
            <p className="text-xl font-bold">{fmt(revisedContractValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Change Order
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-left">
              <th className="px-3 py-2 w-20">CO #</th>
              <th className="px-3 py-2 w-24">Date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 w-40">Contract</th>
              <th className="px-3 py-2 w-44">Division</th>
              <th className="px-3 py-2 text-right w-28">Amount</th>
              <th className="px-3 py-2 w-28">Status</th>
              <th className="px-3 py-2 w-10">Doc</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {changeOrders.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No change orders yet.</td></tr>
            ) : changeOrders.map(co => (
              <tr key={co.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono text-muted-foreground">CO-{String(co.co_number).padStart(3, "0")}</td>
                <td className="px-3 py-2 text-xs">{co.date}</td>
                <td className="px-3 py-2 text-sm">{co.description}</td>
                <td className="px-3 py-2 text-xs">{contractLabel(co.contract_id) ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-xs">{co.division_number} — {co.division_name}</td>
                <td className={cn("px-3 py-2 text-right", Number(co.amount) < 0 && "text-destructive")}>{fmt(Number(co.amount))}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                    co.status === "Approved" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                    co.status === "Under Review" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                    co.status === "Proposed" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                    co.status === "Rejected" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                  )}>{co.status}</span>
                </td>
                <td className="px-3 py-2">
                  {co.document_url && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Open document" onClick={() => window.open(co.document_url!, "_blank")}>
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(co)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => { setDeleteTarget(co); setDeleteConfirmText(""); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Change Order" : "Add Change Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <DatePickerInput value={formDate} onChange={(d) => d && setFormDate(d)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CO_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input className="h-8" value={formDescription} onChange={e => setFormDescription(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Contract</Label>
              <Select value={formContractId || "__none__"} onValueChange={(v) => setFormContractId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None (unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {contracts.map(c => {
                    const vName = vendors.find(v => v.id === c.vendor_id)?.name;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.contract_number || "—")} · {vName ?? c.scope_summary}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Division *</Label>
                <Select value={formDivision} onValueChange={setFormDivision}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select division" /></SelectTrigger>
                  <SelectContent>
                    {ALL_DIVISIONS.map(d => <SelectItem key={d.number} value={d.number}>{d.number} — {d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" className="h-8" value={formAmount || ""} onChange={e => setFormAmount(Number(e.target.value) || 0)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Document Link</Label>
              <div className="relative">
                <Link className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="h-8 pl-7 text-xs" placeholder="Paste Google Drive link..." value={formDocUrl} onChange={e => setFormDocUrl(e.target.value)} />
              </div>
            </div>

            {criticalPathTasks.length > 0 && (
              <div className="space-y-1.5 rounded-md border p-3">
                <Label className="text-xs">Schedule Impact (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  If this CO extends or pulls in the schedule, pick the affected task(s) and how many days. Applied automatically when the CO is Approved.
                </p>
                {scheduleImpacts.map((si, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={si.task_id} onValueChange={(v) => setScheduleImpacts(prev => prev.map((r, i) => i === idx ? { ...r, task_id: v } : r))}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select task" /></SelectTrigger>
                      <SelectContent>
                        {criticalPathTasks.map(t => <SelectItem key={t.id} value={t.id}>{t.task_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="h-8 w-24 text-xs"
                      placeholder="Days"
                      value={si.days || ""}
                      onChange={(e) => setScheduleImpacts(prev => prev.map((r, i) => i === idx ? { ...r, days: Number(e.target.value) || 0 } : r))}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setScheduleImpacts(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setScheduleImpacts(prev => [...prev, { task_id: "", days: 0 }])}
                >
                  + Add affected task
                </Button>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="min-h-[60px]" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Change Order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Change Order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are about to permanently delete <strong>CO-{String(deleteTarget?.co_number ?? 0).padStart(3, "0")}</strong>. This action cannot be undone.
          </p>
          <div className="space-y-1 py-2">
            <Label className="text-xs">Type "delete" to confirm</Label>
            <Input className="h-8" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="delete" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmText.toLowerCase() !== "delete"} onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
