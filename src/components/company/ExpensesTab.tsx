import { useState, Fragment } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCompanyFinancials } from "@/hooks/useCompanyFinancials";
import { getRevenueCalendarMonths } from "@/lib/revenueCalendar";
import { makeStackedBarShape } from "@/lib/stackedBarShape";

const fmtK = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n) / 1000)}K`;
};
// The per-month detail cells previously used fmtK too, which rounds to the
// nearest $1,000 — any expense under ~$500 rounds down to "$0K", making a
// real (if small) expense look like there's nothing there at all. Below
// $1,000, show the actual dollar amount instead of a misleading rounded-to-
// zero figure (found 2026-09-23).
const fmtDetail = (n: number) => (Math.abs(n) < 1000 ? fmtFull(n) : fmtK(n));
const fmtFull = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`;
};

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

const CATEGORY_COLORS = ["#c0392b", "#eda100", "#2a78d6", "#8e44ad", "#1baf7a", "#e84393", "#2c3e50", "#e67e22", "#16a085"];

// Company-wide expense tracking across the fixed 24-month Revenue/Company
// calendar. Sourced from company_budget / company_actuals (the same tables
// Company Financials uses) — there's no per-project expense data loaded
// anywhere in the system, so this is company-wide only, not broken out by
// project. Actual figures are only ever shown for closed (non-projected)
// months — a month that hasn't happened yet shows nothing in the actual
// series, only in the forecast/budget series, matching the fix applied to
// Company Financials on 2026-09-15.
export default function ExpensesTab() {
  const calendarYear1 = new Date().getFullYear();
  const financialsYear1 = useCompanyFinancials(calendarYear1);
  const financialsYear2 = useCompanyFinancials(calendarYear1 + 1);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const loading = financialsYear1.loading || financialsYear2.loading;
  const error = financialsYear1.error || financialsYear2.error;

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading expenses…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;

  const expenseCategories = financialsYear1.categories.filter((c) => c.type === "expense");
  if (expenseCategories.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No expense categories loaded yet.</div>;
  }

  const hasExpenseDataForYear = (month: string) => month.slice(0, 4) === String(calendarYear1);

  type MonthEntry = { actual: number; budget: number; isProjected: boolean };
  const byCategoryMonth = new Map<string, Map<string, MonthEntry>>();
  [financialsYear1, financialsYear2].forEach((yearData) => {
    yearData.expenseSeries.forEach((s) => {
      if (!byCategoryMonth.has(s.category.id)) byCategoryMonth.set(s.category.id, new Map());
      const monthMap = byCategoryMonth.get(s.category.id)!;
      s.months.forEach((m) => {
        monthMap.set(m.month.slice(0, 7), { actual: m.actual, budget: m.budget, isProjected: m.is_projected });
      });
    });
  });

  const months = getRevenueCalendarMonths();
  const chartData = months.map((month) => {
    const row: Record<string, any> = { label: format(new Date(`${month}-01T00:00:00`), "MMM yy") };
    expenseCategories.forEach((cat) => {
      const entry = byCategoryMonth.get(cat.id)?.get(month);
      row[`${cat.id}_actual`] = entry && !entry.isProjected ? entry.actual : 0;
      row[`${cat.id}_forecast`] = hasExpenseDataForYear(month) ? (entry?.budget ?? 0) : 0;
    });
    return row;
  });

  const totalActual = financialsYear1.toDateExpenses + financialsYear2.toDateExpenses;
  // Same bug as Company Financials, independently reimplemented here:
  // comparing to-date actuals against a full 12-month budget always looks
  // artificially behind. expenseBudgetToDateTotal (added to the hook
  // alongside this fix) sums budget only for months with real closed
  // actuals, so this is now apples-to-apples (found 2026-09-23).
  const totalBudget2026 = financialsYear1.expenseBudgetToDateTotal;
  const totalActualToDate2026 = financialsYear1.toDateExpenses;
  const variance = totalActualToDate2026 - totalBudget2026;

  const categoryTotals = expenseCategories.map((cat) => {
    const monthMap = byCategoryMonth.get(cat.id) ?? new Map();
    let actualTotal = 0;
    let budgetTotal = 0;
    const monthDetail: { month: string; actual: number; budget: number; isProjected: boolean }[] = [];
    months.forEach((month) => {
      const entry = monthMap.get(month);
      const actual = entry && !entry.isProjected ? entry.actual : 0;
      // Budget only counts toward the to-date total for months this
      // category actually has closed actuals for — not just any month in
      // the target year, which is what silently reintroduced the
      // full-year-vs-partial-year mismatch here even after the hook fix.
      const isClosedForYear = hasExpenseDataForYear(month) && entry && !entry.isProjected;
      const budget = isClosedForYear ? (entry?.budget ?? 0) : 0;
      actualTotal += actual;
      budgetTotal += budget;
      monthDetail.push({ month, actual, budget: hasExpenseDataForYear(month) ? (entry?.budget ?? 0) : 0, isProjected: entry?.isProjected ?? false });
    });
    return { category: cat, actualTotal, budgetTotal, monthDetail };
  }).sort((a, b) => b.actualTotal - a.actualTotal);

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Expenses</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Company-wide expenses by category, {calendarYear1}–{calendarYear1 + 1}. Not broken out by project — no
          per-project expense data is loaded anywhere in the system. Actual figures only shown for closed months.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total expenses to date" value={fmtFull(totalActual)} sub="Closed months, both years" />
        <KpiCard label={`${calendarYear1} budget`} value={fmtFull(totalBudget2026)} sub="Through closed months" />
        <KpiCard
          label={`${calendarYear1} variance (to date)`}
          value={`${variance >= 0 ? "+" : ""}${fmtFull(variance)}`}
          sub={variance > 0 ? "Over budget" : "Under budget"}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Expenses by month, by category</h3>
        <p className="text-xs text-muted-foreground mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {expenseCategories.map((cat, i) => (
            <span key={cat.id} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
              {cat.name}
            </span>
          ))}
          <span className="text-muted-foreground/70">
            · color = actual, by category (closed months) · grey = {calendarYear1} reforecast ({calendarYear1 + 1} not yet budgeted)
          </span>
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const allNonZero = payload.filter((entry: any) => Number(entry.value) > 0);
                // If this month has any real actual, drop forecast entries
                // from the tooltip entirely — mixing "here's what actually
                // happened" with "here's what's still projected elsewhere
                // this month" reads as confusing clutter, not useful detail.
                const hasActual = allNonZero.some((entry: any) => (entry.dataKey as string).endsWith("_actual"));
                const nonZero = hasActual ? allNonZero.filter((entry: any) => (entry.dataKey as string).endsWith("_actual")) : allNonZero;
                if (nonZero.length === 0) {
                  return (
                    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                      <p className="font-medium mb-0.5">{label}</p>
                      <p className="text-muted-foreground">No expenses this month</p>
                    </div>
                  );
                }
                return (
                  <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="font-semibold mb-1 flex items-center justify-between gap-3">
                      <span>{label}</span>
                      <span>{fmtFull(nonZero.reduce((s: number, e: any) => s + Number(e.value), 0))}</span>
                    </p>
                    {nonZero.map((entry: any) => {
                      const dataKey = entry.dataKey as string;
                      const kind = dataKey.endsWith("_forecast") ? "forecast" : "actual";
                      const catId = dataKey.replace(/_(actual|forecast)$/, "");
                      const cat = expenseCategories.find((c) => c.id === catId);
                      return (
                        <p key={dataKey} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{cat?.name ?? catId}{kind === "forecast" ? " (forecast)" : ""}</span>
                          <span>{fmtFull(Number(entry.value))}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {expenseCategories.map((cat, i) => (
              <Bar
                key={`${cat.id}_actual`}
                dataKey={`${cat.id}_actual`}
                stackId="expenses_actual"
                fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                shape={makeStackedBarShape(`${cat.id}_actual`, expenseCategories.map((c) => `${c.id}_actual`))}
              />
            ))}
            {expenseCategories.map((cat, i) => (
              <Bar
                key={`${cat.id}_forecast`}
                dataKey={`${cat.id}_forecast`}
                stackId="expenses_forecast"
                fill="hsl(var(--muted-foreground) / 0.35)"
                shape={makeStackedBarShape(`${cat.id}_forecast`, expenseCategories.map((c) => `${c.id}_forecast`))}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">By category</h3>
        <p className="text-xs text-muted-foreground mb-2">Click a row for the monthly breakdown.</p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">Actual to date</th>
                <th className="px-3 py-2 text-right">{calendarYear1} budget (to date)</th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map(({ category, actualTotal, budgetTotal, monthDetail }) => {
                const expanded = expandedCategoryId === category.id;
                return (
                  <Fragment key={category.id}>
                    <tr
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedCategoryId(expanded ? null : category.id)}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          {category.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtFull(actualTotal)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmtFull(budgetTotal)}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-t bg-muted/10">
                        <td colSpan={3} className="px-3 py-3">
                          <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 text-xs">
                            {monthDetail.map((m) => (
                              <div key={m.month} className="text-center">
                                <p className="text-muted-foreground">{format(new Date(`${m.month}-01T00:00:00`), "MMM yy")}</p>
                                <p>{m.isProjected || m.actual === 0 ? "—" : fmtDetail(m.actual)}</p>
                                <p className="text-muted-foreground">{m.budget > 0 ? fmtDetail(m.budget) : "—"}</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{fmtFull(totalActual)}</td>
                <td className="px-3 py-2 text-right">{fmtFull(totalBudget2026)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
