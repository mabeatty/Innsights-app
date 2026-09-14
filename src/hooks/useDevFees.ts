import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DevFeeProject {
  projectId: string;
  projectName: string;
  devFee: number;
  orFee: number;
  totalFee: number; // devFee + orFee
  totalBilled: number; // sum of is_billed=true schedule rows
  remaining: number; // totalFee - totalBilled
  notes: string | null;
}

export interface MonthlyFeeTotal {
  month: string;
  total: number;
  byProject: Record<string, number>; // projectId -> amount
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
      const [{ data: feeRows, error: feeErr }, { data: schedRows, error: schedErr }] = await Promise.all([
        supabase.from("dev_fee_projects").select("project_id, dev_fee, or_fee, notes, projects(name)").eq("org_id", organizationId),
        supabase.from("dev_fee_schedule").select("project_id, month, amount, is_billed, projects(name)").eq("org_id", organizationId).order("month"),
      ]);
      if (feeErr) throw feeErr;
      if (schedErr) throw schedErr;

      const billedByProject = new Map<string, number>();
      (schedRows ?? []).forEach((r: any) => {
        if (r.is_billed) billedByProject.set(r.project_id, (billedByProject.get(r.project_id) ?? 0) + Number(r.amount));
      });

      const builtProjects: DevFeeProject[] = (feeRows ?? []).map((r: any) => {
        const devFee = Number(r.dev_fee);
        const orFee = Number(r.or_fee);
        const totalFee = devFee + orFee;
        const totalBilled = billedByProject.get(r.project_id) ?? 0;
        return {
          projectId: r.project_id,
          projectName: r.projects?.name ?? "Unknown",
          devFee, orFee, totalFee, totalBilled,
          remaining: totalFee - totalBilled,
          notes: r.notes,
        };
      });
      builtProjects.sort((a, b) => b.totalFee - a.totalFee);
      setProjects(builtProjects);

      setScheduleRows((schedRows ?? []).map((r: any) => ({
        projectId: r.project_id, projectName: r.projects?.name ?? "Unknown",
        month: r.month, amount: Number(r.amount), isBilled: r.is_billed,
      })));
    } catch (e: any) {
      setError(e?.message || "Failed to load development fee data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const totalDevFee = projects.reduce((s, p) => s + p.devFee, 0);
  const totalOrFee = projects.reduce((s, p) => s + p.orFee, 0);
  const totalFee = projects.reduce((s, p) => s + p.totalFee, 0);
  const totalBilled = projects.reduce((s, p) => s + p.totalBilled, 0);
  const totalRemaining = projects.reduce((s, p) => s + p.remaining, 0);

  // Monthly totals (forecast schedule) — aggregate and per-project, for the
  // "how much paid each month" view. Only reflects rows actually in
  // dev_fee_schedule (the forward-looking schedule loaded from the source
  // doc); doesn't include pre-tracker historical billing since that's not
  // broken out by month in the real data.
  const monthsSet = new Set(scheduleRows.map((r) => r.month));
  const months = Array.from(monthsSet).sort();
  const monthlyTotals: MonthlyFeeTotal[] = months.map((month) => {
    const rowsForMonth = scheduleRows.filter((r) => r.month === month);
    const byProject: Record<string, number> = {};
    rowsForMonth.forEach((r) => { byProject[r.projectId] = (byProject[r.projectId] ?? 0) + r.amount; });
    return { month, total: rowsForMonth.reduce((s, r) => s + r.amount, 0), byProject };
  });

  return {
    loading, error, refetch: load,
    projects, scheduleRows, monthlyTotals,
    totalDevFee, totalOrFee, totalFee, totalBilled, totalRemaining,
  };
}
