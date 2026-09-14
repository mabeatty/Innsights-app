import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DevFeeProject {
  projectId: string;
  projectName: string;
  devFee: number;
  totalFee: number; // == devFee (kept as a distinct field in case a non-dev-fee component is reintroduced later)
  totalBilled: number; // sum of is_billed=true schedule rows
  remaining: number; // totalFee - totalBilled
  notes: string | null;
}

export interface MonthlyFeeTotal {
  month: string;
  total: number;
  actualTotal: number; // real, billed (is_billed=true) amount for the month
  forecastTotal: number; // projected, not-yet-billed (is_billed=false) amount for the month
  byProject: Record<string, number>; // deprecated alias for byProjectActual — kept for compatibility
  byProjectActual: Record<string, number>;
  byProjectForecast: Record<string, number>;
}

// Loads the development fee tracker: one row per New-Build project (total
// fee, billed-to-date, remaining) plus the monthly billing schedule needed
// for the "paid each month, aggregate and per-project" view. Billed-to-date
// here reflects only what's recorded in dev_fee_schedule with is_billed =
// true — historical billing that predates this tracker (e.g. 2025 amounts)
// isn't broken out by month in the source data, so it isn't fabricated
// here; those totals live only in each project's aggregate billed figure
// until real monthly detail exists to back them.
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
        supabase.from("dev_fee_qb_actuals").select("project_id, month, amount").eq("org_id", organizationId).order("month"),
      ]);
      if (feeErr) throw feeErr;
      if (schedErr) throw schedErr;
      if (qbErr) throw qbErr;

      // Projects with real QuickBooks-sourced monthly actuals (dev_fee_qb_actuals)
      // use QB as the source of truth for actual billed amounts — more accurate
      // than the project-accounting-derived dev_fee_schedule rows, per direction
      // (2026-09-14). Projects with no QB mapping/data fall back to the
      // schedule-derived actuals exactly as before, so nothing regresses for
      // projects QuickBooks doesn't track yet.
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

      // Build the monthly chart's row set: schedule-derived forecast rows
      // (is_billed=false) pass through unchanged for every project — QB has
      // no concept of "not yet billed" — but schedule-derived actual rows
      // are dropped for QB-mapped projects and replaced with the real QB
      // monthly amounts, which may not split across months identically to
      // the old schedule data.
      const nonQbRows = (schedRows ?? [])
        .filter((r: any) => !r.is_billed || !qbProjectIds.has(r.project_id))
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

  // Monthly totals, split cleanly into actual (is_billed=true, real money
  // received) vs. forecast (is_billed=false, expected future billing) —
  // these are never combined into one number per month, since a month is
  // either something that already happened or something projected to
  // happen, never both. Previous version summed every row regardless of
  // is_billed, which meant future forecast months rendered identically to
  // real billed months on the chart — a genuine display bug, not just a
  // data problem, since the underlying is_billed flag was already correct
  // and simply never consulted here.
  const monthsSet = new Set(scheduleRows.map((r) => r.month));
  const months = Array.from(monthsSet).sort();
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
      byProject: byProjectActual, // kept for backward compatibility — actual only
      byProjectActual, byProjectForecast,
    };
  });

  return {
    loading, error, refetch: load,
    projects, scheduleRows, monthlyTotals,
    totalDevFee, totalFee, totalBilled, totalRemaining,
  };
}
