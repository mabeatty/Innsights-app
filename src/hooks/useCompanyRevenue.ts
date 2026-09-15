import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getRevenueCalendarMonths } from "@/lib/revenueCalendar";
import { formatProjectLabel } from "@/lib/projectLabel";

export interface RevenueMonthTotal {
  month: string;
  total: number;
  byProject: Record<string, number>;
}

export interface RevenueProjectTotal {
  projectId: string;
  projectName: string;
  total: number;
}

// Loads a single revenue stream (Construction Fees, Consulting Fees, etc.)
// broken out by project, for the fixed 24-month Revenue calendar. Sourced
// from revenue_qb_actuals via revenue_qb_account_map (see
// sync-dev-fee-revenue-quickbooks) — same per-project mechanism Development
// Fees uses. If QuickBooks has no per-project mapping configured yet for
// this revenue type, months/projects simply come back empty rather than
// guessing an attribution.
export function useCompanyRevenue(revenueType: string) {
  const { organizationId } = useAuth();
  const [monthlyTotals, setMonthlyTotals] = useState<RevenueMonthTotal[]>([]);
  const [projectTotals, setProjectTotals] = useState<RevenueProjectTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("revenue_qb_actuals")
        .select("project_id, month, amount, projects(name, hotel_name)")
        .eq("org_id", organizationId)
        .eq("revenue_type", revenueType)
        .order("month");
      if (err) throw err;

      const rows = (data ?? []).map((r: any) => ({
        projectId: r.project_id, projectName: formatProjectLabel(r.projects?.name ?? "Unknown", r.projects?.hotel_name),
        month: r.month, amount: Number(r.amount),
      }));

      const months = getRevenueCalendarMonths();
      const built: RevenueMonthTotal[] = months.map((month) => {
        const rowsForMonth = rows.filter((r) => r.month === month);
        const byProject: Record<string, number> = {};
        rowsForMonth.forEach((r) => { byProject[r.projectId] = (byProject[r.projectId] ?? 0) + r.amount; });
        return { month, total: rowsForMonth.reduce((s, r) => s + r.amount, 0), byProject };
      });
      setMonthlyTotals(built);

      const totalByProject = new Map<string, RevenueProjectTotal>();
      rows.forEach((r) => {
        const existing = totalByProject.get(r.projectId);
        if (existing) existing.total += r.amount;
        else totalByProject.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, total: r.amount });
      });
      setProjectTotals(Array.from(totalByProject.values()).sort((a, b) => b.total - a.total));
    } catch (e: any) {
      setError(e?.message || "Failed to load revenue data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, revenueType]);

  useEffect(() => { load(); }, [load]);

  const total = projectTotals.reduce((s, p) => s + p.total, 0);

  return { loading, error, refetch: load, monthlyTotals, projectTotals, total };
}
