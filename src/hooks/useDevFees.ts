import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getRevenueCalendarMonths } from "@/lib/revenueCalendar";

export interface DevFeeProject {
  projectId: string;
  projectName: string;
  devFee: number;
  totalFee: number; // == devFee (kept as a distinct field in case a non-dev-fee component is reintroduced later)
  totalBilled: number; // sum of real QuickBooks-sourced actuals (or schedule-derived actuals, for unmapped projects)
  remaining: number; // totalFee - totalBilled
  notes: string | null;
}

export interface MonthlyFeeTotal {
  month: string;
  total: number;
  actualTotal: number; // real, billed amount for the month
  forecastTotal: number; // projected, not-yet-billed amount for the month
  byProject: Record<string, number>; // deprecated alias for byProjectActual — kept for compatibility
  byProjectActual: Record<string, number>;
  byProjectForecast: Record<string, number>;
}

// Loads the Development Fees revenue tracker for the fixed 24-month
// Revenue-tab calendar (see revenueCalendar.ts). Real monthly actuals come
// from revenue_qb_actuals (revenue_type='development_fee') for any project
// with a QuickBooks mapping in revenue_qb_account_map — this is the real,
// per-project QuickBooks sub-account data, more accurate than the
// project-accounting-derived dev_fee_schedule rows it replaces for those
// projects (direction given 2026-09-14). Projects with no QB mapping yet
// fall back to dev_fee_schedule's is_billed=true rows exactly as before.
// Every month in the 24-month calendar is always present in monthlyTotals,
// even at $0, so charts never silently skip a month.
export function useDevFees() {
  const { organizationId } = useAuth();
  const [projects, setProjects] = useState<DevFeeProject[]>([]);
  const [scheduleRows, setScheduleRows] = useState<{ projectId: string; projectName: string; month: string; amount: number; isBilled: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: feeRows, error: feeErr }, { data: schedRows, error: schedErr }, { data: qbRows, error: qbErr }] = await Promise.all([
        supabase.from("dev_fee_projects").select("project_id, dev_fee, notes, projects(name)").eq("org_id", organizationId),
        supabase.from("dev_fee_schedule").select("project_id, month, amount, is_billed, projects(name)").eq("org_id", organizationId).order("month"),
        supabase.from("revenue_qb_actuals").select("project_id, month, amount").eq("org_id", organizationId).eq("revenue_type", "development_fee").order("month"),
      ]);
      if (feeErr) throw feeErr;
      if (schedErr) throw schedErr;
      if (qbErr) throw qbErr;

      const qbProjectIds = new Set((qbRows ?? []).map((r: any) => r.project_id));

      const billedByProject = new Map<string, number>();
      (schedRows ?? []).forEach((r: any) => {
        if (r.is_billed && !qbProjectIds.has(r.project_id)) {
          billedByProject.set(r.project_id, (billedByProject.get(r.project_id) ?? 0) + Number(r.amount));
        }
      });
      (qbRows ?? []).forEach((r: any) => {
        billedByProject.set(r.project_id, (billedByProject.get(r.project_id) ?? 0) + Number(r.amount));
      });

      const builtProjects: DevFeeProject[] = (feeRows ?? []).map((r: any) => {
        const devFee = Number(r.dev_fee);
        const totalFee = devFee;
        const totalBilled = billedByProject.get(r.project_id) ?? 0;
        return {
          projectId: r.project_id,
          projectName: r.projects?.name ?? "Unknown",
          devFee, totalFee, totalBilled,
          remaining: totalFee - totalBilled,
          notes: r.notes,
        };
      });
      builtProjects.sort((a, b) => b.totalFee - a.totalFee);
      setProjects(builtProjects);

      // Build the monthly chart's row set. dev_fee_schedule.month is a full
      // date ('2026-06-01'); revenue_qb_actuals.month is 'YYYY-MM' — both
      // are normalized to 'YYYY-MM' so the same calendar month is never
      // treated as two separate keys. For QB-mapped projects, a schedule
      // forecast row is dropped once QB has actualized that exact month
      // (otherwise a stale forecast and a real actual both render for the
      // same month).
      const qbMonthsByProject = new Map<string, Set<string>>();
      (qbRows ?? []).forEach((r: any) => {
        if (!qbMonthsByProject.has(r.project_id)) qbMonthsByProject.set(r.project_id, new Set());
        qbMonthsByProject.get(r.project_id)!.add(r.month);
      });
      const nonQbRows = (schedRows ?? [])
        .map((r: any) => ({ ...r, month: String(r.month).slice(0, 7) }))
        .filter((r: any) => {
          if (!qbProjectIds.has(r.project_id)) return true;
          if (r.is_billed) return false;
          return !qbMonthsByProject.get(r.project_id)?.has(r.month);
        })
        .map((r: any) => ({
          projectId: r.project_id, projectName: r.projects?.name ?? "Unknown",
          month: r.month, amount: Number(r.amount), isBilled: r.is_billed,
        }));
      const projectNameById = new Map((feeRows ?? []).map((r: any) => [r.project_id, r.projects?.name ?? "Unknown"]));
      const qbActualRows = (qbRows ?? []).map((r: any) => ({
        projectId: r.project_id, projectName: projectNameById.get(r.project_id) ?? "Unknown",
        month: r.month, amount: Number(r.amount), isBilled: true,
      }));
      setScheduleRows([...nonQbRows, ...qbActualRows]);
    } catch (e: any) {
      setError(e?.message || "Failed to load development fee data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const totalDevFee = projects.reduce((s, p) => s + p.devFee, 0);
  const totalFee = projects.reduce((s, p) => s + p.totalFee, 0);
  const totalBilled = projects.reduce((s, p) => s + p.totalBilled, 0);
  const totalRemaining = projects.reduce((s, p) => s + p.remaining, 0);

  // Every month in the fixed 24-month Revenue calendar is included, even if
  // no rows exist for it (actualTotal/forecastTotal both 0) — so charts
  // consuming this always show the full calendar, not just months with data.
  const months = getRevenueCalendarMonths();
  const monthlyTotals: MonthlyFeeTotal[] = months.map((month) => {
    const rowsForMonth = scheduleRows.filter((r) => r.month === month);
    const actualRows = rowsForMonth.filter((r) => r.isBilled);
    const forecastRows = rowsForMonth.filter((r) => !r.isBilled);
    const byProjectActual: Record<string, number> = {};
    actualRows.forEach((r) => { byProjectActual[r.projectId] = (byProjectActual[r.projectId] ?? 0) + r.amount; });
    const byProjectForecast: Record<string, number> = {};
    forecastRows.forEach((r) => { byProjectForecast[r.projectId] = (byProjectForecast[r.projectId] ?? 0) + r.amount; });
    return {
      month,
      total: rowsForMonth.reduce((s, r) => s + r.amount, 0),
      actualTotal: actualRows.reduce((s, r) => s + r.amount, 0),
      forecastTotal: forecastRows.reduce((s, r) => s + r.amount, 0),
      byProject: byProjectActual,
      byProjectActual, byProjectForecast,
    };
  });

  return {
    loading, error, refetch: load,
    projects, scheduleRows, monthlyTotals,
    totalDevFee, totalFee, totalBilled, totalRemaining,
  };
}
