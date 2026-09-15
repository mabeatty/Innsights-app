import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useDevFees } from "@/hooks/useDevFees";
import { makeStackedBarShape } from "@/lib/stackedBarShape";

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

// Chosen so no two colors are close enough to be confused at reduced
// (forecast) opacity — the previous palette had New Albany (#1baf7a) and
// Carmel (#16a085) as two near-identical green/teal shades, which is
// exactly what looked like a rendering bug but was actually just two
// projects sharing indistinguishable colors.
const PROJECT_COLORS = ["#2a78d6", "#eda100", "#c0392b", "#8e44ad", "#1baf7a", "#e84393", "#2c3e50", "#e67e22"];

export default function DevFeesTab() {
  const { loading, error, projects, monthlyTotals, totalFee, totalBilled, totalRemaining } = useDevFees();

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading development fees…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;
  if (projects.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No development fee data loaded yet.</div>;
  }

  const projectIds = projects.map((p) => p.projectId);
  // Actual and forecast are combined into one chart per project — each
  // month/project pair only ever has one of the two nonzero (a schedule
  // forecast row is dropped once QB has actualized that month, see
  // useDevFees), so stacking an actual segment and a forecast segment
  // together never double-counts height; it just shows whichever applies,
  // with the forecast segment rendered at reduced opacity in the same
  // project color.
  const chartData = monthlyTotals.map((m) => {
    const row: Record<string, any> = { label: format(new Date(`${m.month.length === 7 ? `${m.month}-01` : m.month}T00:00:00`), "MMM yy") };
    projectIds.forEach((pid) => {
      row[`${pid}_actual`] = m.byProjectActual[pid] ?? 0;
      row[`${pid}_forecast`] = m.byProjectForecast[pid] ?? 0;
    });
    return row;
  });

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
        <h3 className="text-sm font-medium mb-2">Fee by month, by project</h3>
        <p className="text-xs text-muted-foreground mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {projectIds.map((pid, i) => (
            <span key={pid} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
              {projects.find((p) => p.projectId === pid)?.projectName ?? pid}
            </span>
          ))}
          <span className="text-muted-foreground/70">· solid = actual · faded = forecast</span>
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const nonZero = payload.filter((entry: any) => Number(entry.value) > 0);
                if (nonZero.length === 0) {
                  return (
                    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                      <p className="font-medium mb-0.5">{label}</p>
                      <p className="text-muted-foreground">No fee this month</p>
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
                      const [pid, kind] = (entry.dataKey as string).split("_");
                      const projectName = projects.find((p) => p.projectId === pid)?.projectName ?? pid;
                      return (
                        <p key={entry.dataKey} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{projectName}{kind === "forecast" ? " (forecast)" : ""}</span>
                          <span>{fmtFull(Number(entry.value))}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {projectIds.map((pid, i) => (
              <Bar
                key={`${pid}_actual`}
                dataKey={`${pid}_actual`}
                stackId="fees_actual"
                fill={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                shape={makeStackedBarShape(`${pid}_actual`, projectIds.map((id) => `${id}_actual`))}
              />
            ))}
            {projectIds.map((pid, i) => (
              <Bar
                key={`${pid}_forecast`}
                dataKey={`${pid}_forecast`}
                stackId="fees_forecast"
                fill={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                fillOpacity={0.35}
                shape={makeStackedBarShape(`${pid}_forecast`, projectIds.map((id) => `${id}_forecast`))}
              />
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
