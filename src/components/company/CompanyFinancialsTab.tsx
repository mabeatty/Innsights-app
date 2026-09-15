import { useState, Fragment } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyFinancials } from "@/hooks/useCompanyFinancials";

const fmtK = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n) / 1000)}K`;
};
const fmtFull = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`;
};

function KpiCard({ label, value, sub, negative }: { label: string; value: string; sub: string; negative?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-xl font-medium", negative && "text-destructive")}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function VarianceChart({ data, actualColor }: {
  data: { label: string; actual: number; budget: number; isProjected: boolean }[];
  actualColor: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip formatter={(v: number) => fmtFull(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={actualColor} fillOpacity={d.isProjected ? 0 : 1} />
          ))}
        </Bar>
        <Bar dataKey="budget" name="Budget" fill="hsl(var(--muted-foreground) / 0.35)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function CompanyFinancialsTab() {
  const year = 2026;
  const {
    loading, error, categories, series, monthlyTotals,
    revenueBudgetTotal, revenueActualTotal, expenseBudgetTotal, expenseActualTotal,
    netIncomeBudget, netIncomeActual,
    toDateRevenue, toDateExpenses, toDateEbitdaApprox, toDateNetMarginPct,
  } = useCompanyFinancials(year);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading company financials…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;
  if (categories.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No budget or actuals loaded yet for {year}.
      </div>
    );
  }

  const revChartData = monthlyTotals.map((m) => ({
    label: format(new Date(`${m.month}T00:00:00`), "MMM"),
    actual: m.isProjected ? 0 : m.revActual, budget: m.revBudget, isProjected: m.isProjected,
  }));
  const expChartData = monthlyTotals.map((m) => ({
    label: format(new Date(`${m.month}T00:00:00`), "MMM"),
    actual: m.isProjected ? 0 : m.expActual, budget: m.expBudget, isProjected: m.isProjected,
  }));

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company financials</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {year} actual vs. budget · <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-foreground/70" />actual</span>
            {" · "}
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/35" />budget</span>
            {" · "}no actual is shown for months that haven't closed yet
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Year to date <span className="text-xs font-normal text-muted-foreground">(closed months only, excludes projections)</span></h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Gross revenue" value={fmtFull(toDateRevenue)} sub="Closed months" />
          <KpiCard label="Gross expenses" value={fmtFull(toDateExpenses)} sub="Closed months" />
          <KpiCard
            label="EBITDA (approx.)"
            value={fmtFull(toDateEbitdaApprox)}
            sub="Net income + taxes — no D&A in this business's accounts"
            negative={toDateEbitdaApprox < 0}
          />
          <KpiCard
            label="Net margin"
            value={toDateNetMarginPct === null ? "—" : `${toDateNetMarginPct.toFixed(1)}%`}
            sub="Net income ÷ revenue — no separate COGS tracked"
            negative={toDateNetMarginPct !== null && toDateNetMarginPct < 0}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Revenue vs. budget"
          value={fmtK(revenueActualTotal - revenueBudgetTotal)}
          sub={`${fmtFull(revenueActualTotal)} actual of ${fmtFull(revenueBudgetTotal)}`}
          negative={revenueActualTotal < revenueBudgetTotal}
        />
        <KpiCard
          label="Expenses vs. budget"
          value={fmtK(expenseActualTotal - expenseBudgetTotal)}
          sub={`${fmtFull(expenseActualTotal)} actual of ${fmtFull(expenseBudgetTotal)}`}
          negative={expenseActualTotal > expenseBudgetTotal}
        />
        <KpiCard
          label="Net income vs. budget"
          value={fmtK(netIncomeActual - netIncomeBudget)}
          sub={`${fmtFull(netIncomeActual)} actual vs. ${fmtFull(netIncomeBudget)} budgeted`}
          negative={netIncomeActual < netIncomeBudget}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Revenue: actual vs. budget by month</h3>
        <VarianceChart data={revChartData} actualColor="#2a78d6" />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Expenses: actual vs. budget by month</h3>
        <VarianceChart data={expChartData} actualColor="#eb6834" />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Category detail</h3>
        <p className="text-xs text-muted-foreground mb-2">Full-year actual vs. budget by category — click a row for the monthly breakdown.</p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const variance = s.actualTotal - s.budgetTotal;
                const isBad = s.category.type === "revenue" ? variance < 0 : variance > 0;
                const expanded = expandedCategoryId === s.category.id;
                return (
                  <Fragment key={s.category.id}>
                    <tr
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedCategoryId(expanded ? null : s.category.id)}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          {s.category.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmtFull(s.budgetTotal)}</td>
                      <td className="px-3 py-2 text-right">{fmtFull(s.actualTotal)}</td>
                      <td className={cn("px-3 py-2 text-right", isBad ? "text-destructive" : "text-emerald-600 dark:text-emerald-500")}>
                        {variance >= 0 ? "+" : ""}{fmtFull(variance)}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t bg-muted/10">
                        <td colSpan={4} className="px-3 py-3">
                          <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 text-xs">
                            {s.months.map((m) => (
                              <div key={m.month} className="text-center">
                                <p className="text-muted-foreground">{format(new Date(`${m.month}T00:00:00`), "MMM")}</p>
                                <p>{m.is_projected ? "—" : fmtK(m.actual)}</p>
                                <p className="text-muted-foreground">{fmtK(m.budget)}</p>
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
          </table>
        </div>
      </div>
    </div>
  );
}
