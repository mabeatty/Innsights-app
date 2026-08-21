import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ALL_DIVISIONS, TRANSACTION_STATUSES, fmtDecimal, BudgetTransaction } from "./types";
import { DrawRecord } from "./DrawHistoryTab";

interface Row {
  id: string; // real budget_transactions id, or a temp "new-..." id before save
  isNew: boolean;
  isDeleted: boolean;
  payee: string;
  division_number: string;
  description: string;
  amount: number;
  retainage_amount: number;
  status: string;
  date: string;
}

const toRow = (t: BudgetTransaction): Row => ({
  id: t.id,
  isNew: false,
  isDeleted: false,
  payee: t.payee,
  division_number: t.division_number,
  description: t.description,
  amount: Number(t.amount),
  retainage_amount: Number(t.retainage_amount),
  status: t.status,
  date: t.date,
});

interface Props {
  draw: DrawRecord | null;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void; // refresh draws + transactions in the parent
}

/**
 * Full editor for a closed draw's actual budget_transactions rows — not the
 * frozen snapshot_json shown in "View", and not the metadata-only editor
 * behind the pencil icon (month/status/notes). This edits real money: amounts,
 * line items added or removed after a draw was already closed and approved,
 * which happens when a late invoice or correction comes in after close-out.
 *
 * On save, draw_history.total_amount/snapshot_json AND capital_cash_flow's
 * matching month row are both resynced — the two tables must never drift
 * apart after an edit like this.
 */
export default function EditDrawTransactionsDialog({ draw, projectId, onOpenChange, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  let tempIdCounter = 0;

  const load = useCallback(async () => {
    if (!draw) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("budget_transactions")
      .select("*")
      .eq("draw_id", draw.id)
      .order("division_number");
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows(((data ?? []) as BudgetTransaction[]).map(toRow));
    setLoading(false);
  }, [draw]);

  useEffect(() => {
    if (draw) load();
  }, [draw, load]);

  const visibleRows = useMemo(() => rows.filter((r) => !r.isDeleted), [rows]);
  const totalAmount = useMemo(() => visibleRows.reduce((s, r) => s + Number(r.amount || 0), 0), [visibleRows]);
  const totalRetainage = useMemo(() => visibleRows.reduce((s, r) => s + Number(r.retainage_amount || 0), 0), [visibleRows]);
  const netTotal = totalAmount - totalRetainage;

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => {
    tempIdCounter += 1;
    const newRow: Row = {
      id: `new-${Date.now()}-${tempIdCounter}`,
      isNew: true,
      isDeleted: false,
      payee: "",
      division_number: ALL_DIVISIONS[0]?.number ?? "",
      description: "",
      amount: 0,
      retainage_amount: 0,
      status: "Approved",
      date: draw?.draw_month ?? new Date().toISOString().slice(0, 10),
    };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isDeleted: true } : r)));

  const handleSave = async () => {
    if (!draw) return;
    const invalidNew = rows.some((r) => r.isNew && !r.isDeleted && (!r.payee.trim() || !r.division_number));
    if (invalidNew) {
      toast.error("New line items need a payee and division before saving.");
      return;
    }
    setSaving(true);
    try {
      const toDelete = rows.filter((r) => r.isDeleted && !r.isNew).map((r) => r.id);
      if (toDelete.length > 0) {
        const { error } = await supabase.from("budget_transactions").delete().in("id", toDelete);
        if (error) throw error;
      }

      const toUpdate = rows.filter((r) => !r.isNew && !r.isDeleted);
      for (const r of toUpdate) {
        const { error } = await supabase
          .from("budget_transactions")
          .update({
            payee: r.payee,
            division_number: r.division_number,
            division_name: ALL_DIVISIONS.find((d) => d.number === r.division_number)?.name ?? r.division_number,
            description: r.description,
            amount: r.amount,
            retainage_amount: r.retainage_amount,
            net_amount: r.amount - r.retainage_amount,
            status: r.status,
          })
          .eq("id", r.id);
        if (error) throw error;
      }

      const toInsert = rows.filter((r) => r.isNew && !r.isDeleted);
      if (toInsert.length > 0) {
        const { data: maxRow } = await supabase
          .from("budget_transactions")
          .select("transaction_number")
          .eq("project_id", projectId)
          .order("transaction_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        let nextNumber = (maxRow?.transaction_number ?? 0) + 1;

        const insertPayload = toInsert.map((r) => {
          const payload = {
            project_id: projectId,
            draw_id: draw.id,
            transaction_type: "Contractor Pay Application",
            transaction_number: nextNumber,
            date: r.date,
            payee: r.payee,
            division_number: r.division_number,
            division_name: ALL_DIVISIONS.find((d) => d.number === r.division_number)?.name ?? r.division_number,
            description: r.description,
            amount: r.amount,
            retainage_percent: 0,
            retainage_amount: r.retainage_amount,
            net_amount: r.amount - r.retainage_amount,
            status: r.status,
            notes: `Added to Draw #${draw.draw_number} after close-out.`,
          };
          nextNumber += 1;
          return payload;
        });
        const { error } = await supabase.from("budget_transactions").insert(insertPayload);
        if (error) throw error;
      }

      const existingSnapshot = draw.snapshot_json ?? {};
      const updatedG702 = { ...existingSnapshot.g702, "8. Current Payment Due": netTotal };
      const { error: drawError } = await supabase
        .from("draw_history")
        .update({ total_amount: netTotal, snapshot_json: { ...existingSnapshot, g702: updatedG702 } })
        .eq("id", draw.id);
      if (drawError) throw drawError;

      const monthYear = draw.draw_month.substring(0, 7);
      const { data: existingCF } = await supabase
        .from("capital_cash_flow")
        .select("id")
        .eq("project_id", projectId)
        .eq("month_year", monthYear)
        .maybeSingle();
      if (existingCF) {
        await supabase.from("capital_cash_flow").update({ draw_amount: netTotal }).eq("id", existingCF.id);
      } else {
        await supabase.from("capital_cash_flow").insert({ project_id: projectId, month_year: monthYear, projected_spend: 0, draw_amount: netTotal });
      }

      toast.success(`Draw #${draw.draw_number} transactions updated.`);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!draw} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Draw #{draw?.draw_number} Transactions</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Editing line items after close-out. This updates the actual transaction records, not just the draw summary —
            the draw total and cash flow plan will be recalculated on save.
          </p>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-left text-xs">
                    <th className="px-3 py-2">Payee</th>
                    <th className="px-3 py-2 w-40">Division</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right w-32">Amount</th>
                    <th className="px-3 py-2 text-right w-32">Retainage</th>
                    <th className="px-3 py-2 w-28">Status</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <Input className="h-8 text-xs" value={r.payee} onChange={(e) => updateRow(r.id, { payee: e.target.value })} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Select value={r.division_number} onValueChange={(v) => updateRow(r.id, { division_number: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ALL_DIVISIONS.map((d) => <SelectItem key={d.number} value={d.number}>{d.number} — {d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input className="h-8 text-xs" value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value })} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          className="h-8 text-xs text-right"
                          value={r.amount}
                          onChange={(e) => updateRow(r.id, { amount: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          className="h-8 text-xs text-right"
                          value={r.retainage_amount}
                          onChange={(e) => updateRow(r.id, { retainage_amount: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Select value={r.status} onValueChange={(v) => updateRow(r.id, { status: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TRANSACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remove line item" onClick={() => removeRow(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground text-sm">No line items in this draw.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add Line Item
            </Button>

            <div className="flex items-center justify-end gap-6 text-sm border-t pt-3">
              <div><span className="text-muted-foreground">Total Amount: </span><span className="font-medium">{fmtDecimal(totalAmount)}</span></div>
              <div><span className="text-muted-foreground">Retainage: </span><span className="font-medium">{fmtDecimal(totalRetainage)}</span></div>
              <div><span className="text-muted-foreground">Net (Draw Total): </span><span className="font-semibold">{fmtDecimal(netTotal)}</span></div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>{saving ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
