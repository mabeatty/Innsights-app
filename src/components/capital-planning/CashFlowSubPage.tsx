import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Lock } from "lucide-react";
import { fmt } from "./types";
import type { CashFlowRow } from "./types";
import { toast } from "sonner";
import AccountBalanceSection from "@/components/account-balance/AccountBalanceSection";

function CurrencyInput({ value, onChange, placeholder = "$0", disabled = false }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  const num = parseFloat(value) || 0;
  return (
    <Input
      className="h-7 text-right text-sm w-32"
      value={focused ? value : (num > 0 ? fmt(num) : "")}
      onChange={e => onChange(e.target.value.replace(/[^0-9.-]/g, ""))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

interface Props {
  projectId: string;
  budgetTotal: number;
  cashFlowRows: CashFlowRow[];
  upsertCashFlow: (monthYear: string, fields: Partial<CashFlowRow>) => Promise<void>;
  deleteCashFlowAll: () => Promise<void>;
  plaidAccountId?: string | null;
}

function formatMonthLabel(my: string): string {
  if (!my) return "";
  const [y, m] = my.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function generateMonthRange(start: string, end: string): string[] {
  if (!start || !end) return [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const months: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

export default function CashFlowSubPage({ projectId, budgetTotal, cashFlowRows, upsertCashFlow, deleteCashFlowAll, plaidAccountId }: Props) {
  const { isPartner } = useAuth();
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);

  // Draft state for inline editing
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [draftDraws, setDraftDraws] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Track which months have draws (auto-populated from draw_history)
  const [drawMonths, setDrawMonths] = useState<Set<string>>(new Set());

  // Load draw months from draw_history
  useEffect(() => {
    const loadDrawMonths = async () => {
      const { data } = await (supabase as any)
        .from("draw_history")
        .select("draw_month")
        .eq("project_id", projectId);
      if (data) {
        const months = new Set<string>(
          data.map((d: any) => (d.draw_month as string).substring(0, 7))
        );
        setDrawMonths(months);
      }
    };
    loadDrawMonths();
  }, [projectId, cashFlowRows]); // re-check when cashFlowRows change (draw may have been closed)

  const sorted = useMemo(() => [...cashFlowRows].sort((a, b) => a.month_year.localeCompare(b.month_year)), [cashFlowRows]);

  // Initialize drafts from DB rows when they change (and drafts are clean)
  useMemo(() => {
    if (!dirty) {
      const amounts: Record<string, string> = {};
      const draws: Record<string, string> = {};
      const notes: Record<string, string> = {};
      sorted.forEach(r => {
        amounts[r.month_year] = Number(r.projected_spend) > 0 ? String(Number(r.projected_spend)) : "";
        draws[r.month_year] = Number(r.draw_amount) > 0 ? String(Number(r.draw_amount)) : "";
        notes[r.month_year] = r.notes ?? "";
      });
      setDraftAmounts(amounts);
      setDraftDraws(draws);
      setDraftNotes(notes);
    }
  }, [sorted, dirty]);

  const totalPlanned = useMemo(() => Object.values(draftAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0), [draftAmounts]);
  const totalDraw = useMemo(() => Object.values(draftDraws).reduce((s, v) => s + (parseFloat(v) || 0), 0), [draftDraws]);
  const totalVariance = totalDraw - totalPlanned;

  const handleGenerate = () => {
    if (cashFlowRows.length > 0) {
      setPendingGenerate(true);
      setConfirmReset(true);
    } else {
      doGenerate();
    }
  };

  const doGenerate = async () => {
    const months = generateMonthRange(startMonth, endMonth);
    if (months.length === 0) { toast.error("Invalid date range"); return; }
    if (months.length > 120) { toast.error("Maximum 120 months allowed"); return; }
    if (cashFlowRows.length > 0) {
      await deleteCashFlowAll();
    }
    for (const my of months) {
      await upsertCashFlow(my, { projected_spend: 0 });
    }
    setDirty(false);
    toast.success(`Generated ${months.length} months`);
  };

  const handleAddMonth = async () => {
    const lastMonth = sorted[sorted.length - 1]?.month_year;
    if (!lastMonth) return;
    const [y, m] = lastMonth.split("-").map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const nextMonthYear = `${nextY}-${String(nextM).padStart(2, "0")}`;
    await upsertCashFlow(nextMonthYear, { projected_spend: 0 });
    setDirty(false);
  };

  const handleSaveAll = async () => {
    for (const row of sorted) {
      const isFromDraw = drawMonths.has(row.month_year);
      const amount = parseFloat(draftAmounts[row.month_year] || "0") || 0;
      // Don't overwrite draw_amount for draw-populated months
      const draw = isFromDraw ? Number(row.draw_amount) : (parseFloat(draftDraws[row.month_year] || "0") || 0);
      const notes = draftNotes[row.month_year] || null;
      if (
        Number(row.projected_spend) !== amount ||
        (!isFromDraw && Number(row.draw_amount) !== draw) ||
        (row.notes ?? "") !== (notes ?? "")
      ) {
        const updateFields: any = { projected_spend: amount, notes };
        if (!isFromDraw) updateFields.draw_amount = draw;
        await upsertCashFlow(row.month_year, updateFields);
      }
    }
    setDirty(false);
    toast.success("Cash flow plan saved");
  };

  const updateAmount = (my: string, val: string) => {
    setDraftAmounts(prev => ({ ...prev, [my]: val }));
    setDirty(true);
  };

  const updateDraw = (my: string, val: string) => {
    setDraftDraws(prev => ({ ...prev, [my]: val }));
    setDirty(true);
  };

  const updateNotes = (my: string, val: string) => {
    setDraftNotes(prev => ({ ...prev, [my]: val }));
    setDirty(true);
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Account Balance — Partners only */}
      {isPartner && (
        <AccountBalanceSection projectId={projectId} plaidAccountId={plaidAccountId ?? null} />
      )}

      {/* Summary Card */}
      <div className="rounded-lg border p-4 bg-card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Project Cost</p>
            <p className="text-lg font-semibold text-foreground">{fmt(budgetTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Planned Spend</p>
            <p className="text-lg font-semibold text-foreground">{fmt(totalPlanned)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Draw Amount</p>
            <p className="text-lg font-semibold text-foreground">{fmt(totalDraw)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Variance</p>
            <p className={`text-lg font-semibold ${totalVariance > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(totalVariance)}</p>
          </div>
        </div>
      </div>

      {/* Schedule Range */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Start Month</label>
          <Input type="month" className="h-8 text-xs w-44" value={startMonth} onChange={e => setStartMonth(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">End Month</label>
          <Input type="month" className="h-8 text-xs w-44" value={endMonth} onChange={e => setEndMonth(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={!startMonth || !endMonth || startMonth > endMonth}>
          Generate Schedule
        </Button>
      </div>

      {/* Table */}
      {sorted.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Monthly Plan</h2>
            <Button size="sm" className="gap-1.5" onClick={handleSaveAll} disabled={!dirty}>
              <Save className="h-3.5 w-3.5" /> Save All
            </Button>
          </div>

          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                  <th className="px-3 py-2 w-40">Month</th>
                  <th className="px-3 py-2 w-36">Planned Amount</th>
                  <th className="px-3 py-2 w-36">Draw Amount</th>
                  <th className="px-3 py-2 text-right w-28">Variance</th>
                  <th className="px-3 py-2 text-right w-32">Cumulative Variance</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
              {sorted.reduce<{ elements: React.ReactNode[]; cumVar: number }>((acc, row) => {
                  const planned = parseFloat(draftAmounts[row.month_year] || "0") || 0;
                  const draw = parseFloat(draftDraws[row.month_year] || "0") || 0;
                  const isFromDraw = drawMonths.has(row.month_year);
                  const rowVariance = draw - planned;
                  const cumVar = acc.cumVar + rowVariance;
                  acc.elements.push(
                    <tr key={row.month_year} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-1.5 text-sm font-medium">{formatMonthLabel(row.month_year)}</td>
                      <td className="px-3 py-1.5">
                        <CurrencyInput
                          value={draftAmounts[row.month_year] ?? ""}
                          onChange={v => updateAmount(row.month_year, v)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        {isFromDraw ? (
                          <div className="flex items-center gap-1.5">
                            <span className="h-7 flex items-center text-sm text-right w-32 px-3 bg-muted/50 rounded-md border font-medium">
                              {draw > 0 ? fmt(draw) : "—"}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                              <Lock className="h-2.5 w-2.5" /> from draw
                            </span>
                          </div>
                        ) : (
                          <CurrencyInput
                            value={draftDraws[row.month_year] ?? ""}
                            onChange={v => updateDraw(row.month_year, v)}
                          />
                        )}
                      </td>
                      <td className={`px-3 py-1.5 text-sm text-right font-medium ${rowVariance > 0 ? "text-destructive" : "text-green-600"}`}>
                        {(planned > 0 || draw > 0) ? fmt(rowVariance) : "—"}
                      </td>
                      <td className={`px-3 py-1.5 text-sm text-right font-medium ${cumVar > 0 ? "text-destructive" : "text-green-600"}`}>
                        {(planned > 0 || draw > 0) ? fmt(cumVar) : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          className="h-7 text-sm"
                          value={draftNotes[row.month_year] ?? ""}
                          onChange={e => updateNotes(row.month_year, e.target.value)}
                          placeholder="Notes…"
                        />
                      </td>
                    </tr>
                  );
                  acc.cumVar = cumVar;
                  return acc;
                }, { elements: [], cumVar: 0 }).elements}
              </tbody>
              <tbody>
                <tr className="border-t">
                  <td colSpan={6} className="px-3 py-1.5">
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={handleAddMonth}>
                      + Add Month
                    </Button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/50 font-semibold text-xs">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right pr-6">{fmt(totalPlanned)}</td>
                  <td className="px-3 py-2 text-right pr-6">{fmt(totalDraw)}</td>
                  <td className={`px-3 py-2 text-right ${totalVariance > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(totalVariance)}</td>
                  <td className={`px-3 py-2 text-right ${totalVariance > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(totalVariance)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Set a start and end month above, then click "Generate Schedule" to begin your cash flow plan.
        </p>
      )}

      <p className="text-xs text-muted-foreground italic">
        This plan will be used for variance analysis once draw packages are connected.
      </p>

      {/* Confirm Reset Dialog */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Cash Flow Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete your existing plan and generate new months. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingGenerate(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmReset(false); setPendingGenerate(false); doGenerate(); }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
