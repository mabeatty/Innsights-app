import { useMemo, useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import DatePickerInput from "@/components/ui/date-picker-input";
import { format } from "date-fns";
import { BudgetRow, BudgetTransaction, fmt, fmtDecimal } from "./types";

function CurrencyInput({ value, onChange, onBlur }: { value: number; onChange: (v: number) => void; onBlur: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");

  const handleFocus = useCallback(() => {
    setEditing(true);
    setRaw(value ? String(value) : "");
  }, [value]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0;
    onBlur(parsed);
  }, [raw, onBlur]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRaw(e.target.value);
    const parsed = parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0;
    onChange(parsed);
  }, [onChange]);

  return (
    <Input
      type="text"
      className="h-7 text-right text-xs"
      value={editing ? raw : (value ? fmtDecimal(value) : "")}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

interface Props {
  budgetRows: BudgetRow[];
  transactions: BudgetTransaction[];
  projectName: string;
  periodStart: Date;
  periodEnd: Date;
  onPeriodChange: (start: Date, end: Date) => void;
  onMaterialsChange: (divNum: string, value: number) => void;
  onScheduledValueChange: (id: string, value: number) => void;
  onScheduledValueBlur: (id: string, value: number) => void;
  materialsStored: Record<string, number>;
}

export default function G703Tab({
  budgetRows, transactions, projectName,
  periodStart, periodEnd, onPeriodChange,
  onMaterialsChange, onScheduledValueChange, onScheduledValueBlur,
  materialsStored,
}: Props) {
  const approvedTxns = useMemo(
    () => transactions.filter((t) => t.status === "Approved" || t.status === "Paid" || t.status === "Deferred"),
    [transactions]
  );

  const buildRow = (div: BudgetRow) => {
    const divTxns = approvedTxns.filter((t) => t.division_number === div.division_number);
    const previous = divTxns
      .filter((t) => new Date(t.date) < periodStart)
      .reduce((s, t) => s + Number(t.amount), 0);
    const thisPeriod = divTxns
      .filter((t) => {
        const d = new Date(t.date);
        return d >= periodStart && d <= periodEnd;
      })
      .reduce((s, t) => s + Number(t.amount), 0);
    const materials = materialsStored[div.division_number] ?? 0;
    const totalCompleted = previous + thisPeriod + materials;
    const scheduled = Number(div.scheduled_value);
    const pctComplete = scheduled > 0 ? (totalCompleted / scheduled) * 100 : 0;
    const balance = scheduled - totalCompleted;
    const retainage = divTxns.reduce((s, t) => s + Number(t.retainage_amount), 0);

    return { div, scheduled, previous, thisPeriod, materials, totalCompleted, pctComplete, balance, retainage };
  };

  const hardRows = budgetRows.filter((r) => r.cost_type === "hard").map(buildRow);
  const softRows = budgetRows.filter((r) => r.cost_type === "soft").map(buildRow);
  const allRows = [...hardRows, ...softRows];

  const sumField = (rows: typeof allRows, field: keyof typeof allRows[0]) =>
    rows.reduce((s, r) => s + (r[field] as number), 0);

  // CSV export removed — export is now centralized in BudgetModule

  const renderSection = (title: string, rows: typeof allRows) => (
    <tbody>
      <tr className="bg-muted/30">
        <td colSpan={10} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.div.id} className="border-t hover:bg-muted/20 transition-colors">
          <td className="px-3 py-1.5 font-mono text-muted-foreground text-xs">{r.div.division_number}</td>
          <td className="px-3 py-1.5 text-xs">{r.div.division_name}</td>
          <td className="px-3 py-1.5 w-40">
            <CurrencyInput
              value={r.scheduled}
              onChange={(v) => onScheduledValueChange(r.div.id, v)}
              onBlur={(v) => onScheduledValueBlur(r.div.id, v)}
            />
          </td>
          <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(r.previous)}</td>
          <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(r.thisPeriod)}</td>
          <td className="px-3 py-1.5 w-40">
            <CurrencyInput
              value={r.materials}
              onChange={(v) => onMaterialsChange(r.div.division_number, v)}
              onBlur={(v) => onMaterialsChange(r.div.division_number, v)}
            />
          </td>
          <td className="px-3 py-1.5 text-right text-xs font-medium">{fmtDecimal(r.totalCompleted)}</td>
          <td className="px-3 py-1.5 text-right text-xs">{r.pctComplete.toFixed(1)}%</td>
          <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(r.balance)}</td>
          <td className="px-3 py-1.5 text-right text-xs">{fmtDecimal(r.retainage)}</td>
        </tr>
      ))}
      <tr className="border-t bg-muted/50 font-semibold text-xs">
        <td className="px-3 py-2" colSpan={2}>{title} Subtotal</td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "scheduled"))}</td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "previous"))}</td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "thisPeriod"))}</td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "materials"))}</td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "totalCompleted"))}</td>
        <td className="px-3 py-2 text-right">
          {sumField(rows, "scheduled") > 0
            ? ((sumField(rows, "totalCompleted") / sumField(rows, "scheduled")) * 100).toFixed(1) + "%"
            : "0%"}
        </td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "balance"))}</td>
        <td className="px-3 py-2 text-right">{fmtDecimal(sumField(rows, "retainage"))}</td>
      </tr>
    </tbody>
  );

  return (
    <div className="space-y-4 pt-2">
      {/* Period selector + export */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Period Start</Label>
          <DatePickerInput value={periodStart} onChange={(d) => d && onPeriodChange(d, periodEnd)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Period End</Label>
          <DatePickerInput value={periodEnd} onChange={(d) => d && onPeriodChange(periodStart, d)} />
        </div>
      </div>

      {/* G703 Table */}
      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
              <th className="px-3 py-2 w-14">Div</th>
              <th className="px-3 py-2">Description of Work</th>
              <th className="px-3 py-2 text-right w-40">Scheduled Value</th>
              <th className="px-3 py-2 text-right w-28">Previous Apps</th>
              <th className="px-3 py-2 text-right w-28">This Period</th>
              <th className="px-3 py-2 text-right w-40">Materials Stored</th>
              <th className="px-3 py-2 text-right w-28">Total Completed</th>
              <th className="px-3 py-2 text-right w-20">% Complete</th>
              <th className="px-3 py-2 text-right w-28">Balance to Finish</th>
              <th className="px-3 py-2 text-right w-24">Retainage</th>
            </tr>
          </thead>
          {renderSection("Hard Costs", hardRows)}
          {renderSection("Soft Costs", softRows)}
          <tfoot>
            <tr className="border-t bg-primary/5 font-bold text-xs">
              <td className="px-3 py-2" colSpan={2}>Project Cost</td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "scheduled"))}</td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "previous"))}</td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "thisPeriod"))}</td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "materials"))}</td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "totalCompleted"))}</td>
              <td className="px-3 py-2 text-right">
                {sumField(allRows, "scheduled") > 0
                  ? ((sumField(allRows, "totalCompleted") / sumField(allRows, "scheduled")) * 100).toFixed(1) + "%"
                  : "0%"}
              </td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "balance"))}</td>
              <td className="px-3 py-2 text-right">{fmtDecimal(sumField(allRows, "retainage"))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
