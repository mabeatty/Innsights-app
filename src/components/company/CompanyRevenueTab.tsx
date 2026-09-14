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

interface CompanyRevenueTabProps {
  revenueType: string;
  title: string;
  color: string;
}

// Company-wide monthly revenue for fee types QuickBooks doesn't attribute
// to individual projects (see sync-dev-fee-revenue-quickbooks's comments on
// why Construction Fees and Consulting Fees are pooled, not per-project,
// unlike Development Fees). One bar per month, no project breakdown.
export default function CompanyRevenueTab({ revenueType, title, color }: CompanyRevenueTabProps) {
  const { loading, error, months, total } = useCompanyRevenue(revenueType);

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading {title.toLowerCase()}…</p>;
  if (error) return <p className="text-sm text-destructive py-8">{error}</p>;
  if (months.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No {title.toLowerCase()} data synced from QuickBooks yet.</div>;
  }

  const chartData = months.map((m) => ({
    label: format(new Date(`${m.month}-01T00:00:00`), "MMM yy"),
    amount: m.amount,
  }));

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Company-wide monthly revenue synced from QuickBooks. QuickBooks does not track this fee type per project.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total revenue (YTD)" value={fmtFull(total)} sub={`${title}, all months synced`} />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Revenue by month</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="font-medium mb-0.5">{label}</p>
                    <p>{fmtFull(Number(payload[0].value))}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" fill={color} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
