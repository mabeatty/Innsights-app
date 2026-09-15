import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { useCompanyRevenue } from "@/hooks/useCompanyRevenue";

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

// Same color logic used across Revenue tabs — enough visual separation
// between adjacent projects so no two bars in a stack are confusable.
const PROJECT_COLORS = ["#2a78d6", "#eda100", "#c0392b", "#8e44ad", "#1baf7a", "#e84393", "#2c3e50", "#e67e22"];

interface CompanyRevenueTabProps {
  revenueType: string;
  title: string;
}

// Revenue for one fee type (Construction Fees, Consulting Fees, etc.),
// broken out by project, across the fixed 24-month Revenue calendar.
export default function CompanyRevenueTab({ revenueType, title }: CompanyRevenueTabProps) {
  const { loading, error, monthlyTotals, projectTotals, total } = useCompanyRevenue(revenueType);

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading {title.toLowerCase()}…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;
  if (projectTotals.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No {title.toLowerCase()} synced from QuickBooks yet for any project. Add project mappings to revenue_qb_account_map
        once real per-project postings exist for this fee type.
      </div>
    );
  }

  const projectIds = projectTotals.map((p) => p.projectId);
  const chartData = monthlyTotals.map((m) => {
    const row: Record<string, any> = { label: format(new Date(`${m.month}-01T00:00:00`), "MMM yy") };
    projectIds.forEach((pid) => { row[pid] = m.byProject[pid] ?? 0; });
    return row;
  });

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Real revenue by project, synced from QuickBooks.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total revenue" value={fmtFull(total)} sub={`${title}, 24-month calendar`} />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Revenue by month, by project</h3>
        <ResponsiveContainer width="100%" height={280}>
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
                      const pid = entry.dataKey as string;
                      const projectName = projectTotals.find((p) => p.projectId === pid)?.projectName ?? pid;
                      return (
                        <p key={pid} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{projectName}</span>
                          <span>{fmtFull(Number(entry.value))}</span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {projectIds.map((pid, i) => (
              <Bar key={pid} dataKey={pid} stackId="revenue" fill={PROJECT_COLORS[i % PROJECT_COLORS.length]} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">By project</h3>
        <div className="space-y-1.5">
          {projectTotals.map((p, i) => (
            <div key={p.projectId} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                {p.projectName}
              </span>
              <span className="font-medium">{fmtFull(p.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
