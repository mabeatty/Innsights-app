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
import { BudgetRow, ALL_DIVISIONS, fmt } from "./types";

const CO_STATUSES = ["Proposed", "Under Review", "Approved", "Rejected"] as const;

export interface ChangeOrder {
  id: string;
  project_id: string;
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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ChangeOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Form state
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formDescription, setFormDescription] = useState("");
  const [formDivision, setFormDivision] = useState("");
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<string>("Proposed");
  const [formDocUrl, setFormDocUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
    setFormDescription("");
    setFormDivision("");
    setFormAmount(0);
    setFormStatus("Proposed");
    setFormDocUrl("");
    setFormNotes("");
  };

  const openEdit = (co: ChangeOrder) => {
    setEditingId(co.id);
    setFormDate(new Date(co.date));
    setFormDescription(co.description);
    setFormDivision(co.division_number);
    setFormAmount(Number(co.amount));
    setFormStatus(co.status);
    setFormDocUrl(co.document_url ?? "");
    setFormNotes(co.notes ?? "");
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
        toast.success("Change order updated.");
      } else {
        // New change order
        if (formStatus === "Approved") {
          await applyBudgetAdjustment(formDivision, formAmount);
        }

        const { error } = await supabase
          .from("change_orders")
          .insert({
            project_id: projectId,
            co_number: nextCoNumber,
            date: format(formDate, "yyyy-MM-dd"),
            description: formDescription,
            division_number: formDivision,
            division_name: div?.name ?? "",
            amount: formAmount,
            status: formStatus,
            document_url: formDocUrl || null,
            notes: formNotes || null,
          });
        if (error) throw error;
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
              <th className="px-3 py-2 w-44">Division</th>
              <th className="px-3 py-2 text-right w-28">Amount</th>
              <th className="px-3 py-2 w-28">Status</th>
              <th className="px-3 py-2 w-10">Doc</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {changeOrders.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No change orders yet.</td></tr>
            ) : changeOrders.map(co => (
              <tr key={co.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono text-muted-foreground">CO-{String(co.co_number).padStart(3, "0")}</td>
                <td className="px-3 py-2 text-xs">{co.date}</td>
                <td className="px-3 py-2 text-sm">{co.description}</td>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(co.document_url!, "_blank")}>
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(co)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setDeleteTarget(co); setDeleteConfirmText(""); }}>
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
