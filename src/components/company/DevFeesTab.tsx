import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useDevFees } from "@/hooks/useDevFees";

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

const PROJECT_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#eb6834", "#6250d6", "#c0392b", "#16a085", "#8e44ad"];

export default function DevFeesTab() {
  const { loading, error, projects, monthlyTotals, totalFee, totalBilled, totalRemaining } = useDevFees();

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading development fees…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;
  if (projects.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No development fee data loaded yet.</div>;
  }

  const projectIds = projects.map((p) => p.projectId);
  // Each cell is independently either real (billed) or forecast — a given
  // project's amount in a given month is never split between the two, so
  // this tracks per-project-month billed status directly rather than
  // approximating it at the whole-month level. Attached directly onto each
  // chart row (as `${pid}__billed`) so the tooltip can read it without
  // re-deriving the month from a formatted label string.
  const chartData = monthlyTotals.map((m) => {
    const row: Record<string, any> = { label: format(new Date(`${m.month}T00:00:00`), "MMM yy") };
    projectIds.forEach((pid) => {
      row[pid] = (m.byProjectActual[pid] ?? 0) + (m.byProjectForecast[pid] ?? 0);
      row[`${pid}__billed`] = (m.byProjectActual[pid] ?? 0) > 0;
    });
    return row;
  });
  const hasAnyForecast = monthlyTotals.some((m) => m.forecastTotal > 0);
  const hasAnyActual = monthlyTotals.some((m) => m.actualTotal > 0);

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Development fees</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Fee tracking across active development projects</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total fee pipeline" value={fmtFull(totalFee)} sub="Development fees, all projects" />
        <KpiCard label="Billed to date" value={fmtFull(totalBilled)} sub={`${totalFee > 0 ? Math.round((totalBilled / totalFee) * 100) : 0}% of total`} />
        <KpiCard label="Remaining" value={fmtFull(totalRemaining)} sub="Not yet billed" />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Fee billed each month, by project</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Solid bars are real, received billing. Lighter bars are the forward schedule — projected, not yet billed. Historical billing that predates this schedule isn't broken out by month.
        </p>
        {hasAnyActual && hasAnyForecast && (
          <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-foreground/70" />Actual (billed)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-foreground/30" />Forecast (not yet billed)</span>
          </div>
        )}
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              formatter={(v: number, name: string, entry: any) => {
                const projectName = projects.find((p) => p.projectId === name)?.projectName ?? name;
                const isBilled = entry?.payload?.[`${name}__billed`];
                return [`${fmtFull(Number(v))} ${isBilled ? "(actual)" : "(forecast)"}`, projectName];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => projects.find((p) => p.projectId === value)?.projectName ?? value} />
            {projectIds.map((pid, i) => (
              <Bar key={pid} dataKey={pid} stackId="fees" radius={i === projectIds.length - 1 ? [3, 3, 0, 0] : undefined}>
                {chartData.map((row, idx) => (
                  <Cell key={idx} fill={PROJECT_COLORS[i % PROJECT_COLORS.length]} fillOpacity={row[`${pid}__billed`] ? 1 : 0.35} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">By project</h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Project</th>
                <th className="px-3 py-2 text-right">Dev fee</th>
                <th className="px-3 py-2 text-right">Total fee</th>
                <th className="px-3 py-2 text-right">Billed to date</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-right">% billed</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const pctBilled = p.totalFee > 0 ? (p.totalBilled / p.totalFee) * 100 : 0;
                return (
                  <tr key={p.projectId} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">
                      {p.projectName}
                      {p.notes && <span className="ml-1.5 text-amber-600 dark:text-amber-500" title={p.notes}>⚠</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmtFull(p.devFee)}</td>
                    <td className="px-3 py-2 text-right">{fmtFull(p.totalFee)}</td>
                    <td className="px-3 py-2 text-right">{fmtFull(p.totalBilled)}</td>
                    <td className="px-3 py-2 text-right">{fmtFull(p.remaining)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full bg-primary", pctBilled === 0 && "bg-muted-foreground/30")} style={{ width: `${Math.min(100, pctBilled)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-9 text-right">{Math.round(pctBilled)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{fmtFull(projects.reduce((s, p) => s + p.devFee, 0))}</td>
                <td className="px-3 py-2 text-right">{fmtFull(totalFee)}</td>
                <td className="px-3 py-2 text-right">{fmtFull(totalBilled)}</td>
                <td className="px-3 py-2 text-right">{fmtFull(totalRemaining)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
