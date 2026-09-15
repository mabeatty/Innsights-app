import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { useDevFees } from "@/hooks/useDevFees";
import { useCompanyRevenue } from "@/hooks/useCompanyRevenue";
import { getRevenueCalendarMonths } from "@/lib/revenueCalendar";

const fmtK = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n) / 1000)}K`;
};
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

const SERIES = [
  { key: "developmentFee", label: "Development Fees", color: "#2a78d6" },
  { key: "constructionFee", label: "Owner's Rep", color: "#eda100" },
  { key: "consultingFee", label: "Consulting Fees", color: "#8e44ad" },
];

// Aggregates all three fee types onto one chart across the fixed 24-month
// Revenue calendar. Development Fees' monthly actual comes from useDevFees
// (per-project QB actuals, summed); Construction/Consulting Fees come from
// useCompanyRevenue, each also per-project under the hood but summed to a
// company-wide total here since the Summary view is about total revenue by
// type, not by project. Only fee types with real 2026 QuickBooks activity
// are included — Acquisition Fees and Disposition Fees are excluded per
// direction (2026-09-14), since they show zero activity this year.
export default function RevenueSummaryTab() {
  const devFees = useDevFees();
  const constructionFees = useCompanyRevenue("construction_fee");
  const consultingFees = useCompanyRevenue("consulting_fee");

  const loading = devFees.loading || constructionFees.loading || consultingFees.loading;
  const error = devFees.error || constructionFees.error || consultingFees.error;

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading revenue summary…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;

  const months = getRevenueCalendarMonths();
  const devByMonth = new Map(devFees.monthlyTotals.map((m) => [m.month, m.actualTotal]));
  const constructionByMonth = new Map(constructionFees.monthlyTotals.map((m) => [m.month, m.total]));
  const consultingByMonth = new Map(consultingFees.monthlyTotals.map((m) => [m.month, m.total]));

  const chartData = months.map((month) => ({
    label: format(new Date(`${month}-01T00:00:00`), "MMM yy"),
    developmentFee: devByMonth.get(month) ?? 0,
    constructionFee: constructionByMonth.get(month) ?? 0,
    consultingFee: consultingByMonth.get(month) ?? 0,
  }));

  const totalDev = devFees.monthlyTotals.reduce((s, m) => s + m.actualTotal, 0);
  const totalConstruction = constructionFees.total;
  const totalConsulting = consultingFees.total;
  const totalRevenue = totalDev + totalConstruction + totalConsulting;

  // Revenue by source (project): combine each project's Development,
  // Construction, and Consulting Fee totals into one row, so "where does
  // our revenue actually come from" is answerable at a glance without
  // switching between sub-tabs.
  type SourceRow = { projectId: string; projectName: string; developmentFee: number; constructionFee: number; consultingFee: number; total: number };
  const bySourceMap = new Map<string, SourceRow>();
  const addToSource = (projectId: string, projectName: string, key: "developmentFee" | "constructionFee" | "consultingFee", amount: number) => {
    if (!bySourceMap.has(projectId)) {
      bySourceMap.set(projectId, { projectId, projectName, developmentFee: 0, constructionFee: 0, consultingFee: 0, total: 0 });
    }
    const row = bySourceMap.get(projectId)!;
    row[key] += amount;
    row.total += amount;
  };
  devFees.projects.forEach((p) => { if (p.totalBilled > 0) addToSource(p.projectId, p.projectName, "developmentFee", p.totalBilled); });
  constructionFees.projectTotals.forEach((p) => addToSource(p.projectId, p.projectName, "constructionFee", p.total));
  consultingFees.projectTotals.forEach((p) => addToSource(p.projectId, p.projectName, "consultingFee", p.total));
  const bySource = Array.from(bySourceMap.values()).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue summary</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          All fee revenue synced from QuickBooks, aggregated by month across a 24-month calendar. Real billed/received amounts only.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <KpiCard label="Total revenue" value={fmtFull(totalRevenue)} sub="All fee types, 24-month calendar" />
        <KpiCard label="Development Fees" value={fmtFull(totalDev)} />
        <KpiCard label="Owner's Rep" value={fmtFull(totalConstruction)} />
        <KpiCard label="Consulting Fees" value={fmtFull(totalConsulting)} />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Revenue by month, by fee type</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const nonZero = payload.filter((entry: any) => Number(entry.value) > 0);
                if (nonZero.length === 0) {
                  return (
                    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                      <p className="font-medium mb-0.5">{label}</p>
                      <p className="text-muted-foreground">No revenue this month</p>
                    </div>
                  );
                }
                return (
                  <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="font-medium mb-1">{label}</p>
                    {nonZero.map((entry: any) => {
                      const series = SERIES.find((s) => s.key === entry.dataKey);
                      return (
                        <p key={entry.dataKey} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{series?.label ?? entry.dataKey}</span>
                          <span>{fmtFull(Number(entry.value))}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="revenue" fill={s.color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Revenue by source (project)</h3>
        <p className="text-xs text-muted-foreground mb-2">Total revenue per project, combined across all fee types.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium py-1.5 pr-3">Project</th>
                <th className="text-right font-medium py-1.5 px-3">Dev Fee</th>
                <th className="text-right font-medium py-1.5 px-3">Owner's Rep</th>
                <th className="text-right font-medium py-1.5 px-3">Consulting</th>
                <th className="text-right font-medium py-1.5 pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((s) => (
                <tr key={s.projectId} className="border-b last:border-b-0">
                  <td className="py-1.5 pr-3">{s.projectName}</td>
                  <td className="text-right py-1.5 px-3 text-muted-foreground">{s.developmentFee > 0 ? fmtFull(s.developmentFee) : "—"}</td>
                  <td className="text-right py-1.5 px-3 text-muted-foreground">{s.constructionFee > 0 ? fmtFull(s.constructionFee) : "—"}</td>
                  <td className="text-right py-1.5 px-3 text-muted-foreground">{s.consultingFee > 0 ? fmtFull(s.consultingFee) : "—"}</td>
                  <td className="text-right py-1.5 pl-3 font-medium">{fmtFull(s.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="py-1.5 pr-3">Total</td>
                <td className="text-right py-1.5 px-3">{fmtFull(totalDev)}</td>
                <td className="text-right py-1.5 px-3">{fmtFull(totalConstruction)}</td>
                <td className="text-right py-1.5 px-3">{fmtFull(totalConsulting)}</td>
                <td className="text-right py-1.5 pl-3">{fmtFull(totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
