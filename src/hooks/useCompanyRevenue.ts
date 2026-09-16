import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getRevenueCalendarMonths } from "@/lib/revenueCalendar";
import { formatProjectLabel } from "@/lib/projectLabel";

export interface RevenueMonthTotal {
  month: string;
  total: number;
  forecastTotal: number;
  byProject: Record<string, number>;
  byProjectForecast: Record<string, number>;
}

export interface RevenueProjectTotal {
  projectId: string; // real project id, or 'ext:<label>' for unlinked properties
  projectName: string;
  total: number;
  forecastTotal: number;
  isUnlinked: boolean;
}

// Loads a single revenue stream (Construction Fees/"Owner's Rep",
// Consulting Fees, etc.) broken out by project, for the fixed 24-month
// Revenue calendar. Actuals come from revenue_qb_actuals via
// revenue_qb_account_map (see sync-dev-fee-revenue-quickbooks) — same
// per-project mechanism Development Fees uses. Forecast (not-yet-billed)
// amounts come from revenue_forecast.
//
// Some real QuickBooks entities bill genuine revenue but aren't tracked as
// full Innsights projects and won't be (per direction 2026-09-15) — those
// rows have project_id = null and external_label = the raw QuickBooks
// entity name instead. They're surfaced here with a synthetic id
// ('ext:<label>') so they render alongside real projects everywhere this
// hook's output is used, tagged isUnlinked so the UI can label them
// distinctly.
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
      const [{ data: actualData, error: actualErr }, { data: forecastData, error: forecastErr }, { data: adjustmentData, error: adjustErr }] = await Promise.all([
        supabase.from("revenue_qb_actuals").select("project_id, external_label, month, amount, projects(name, hotel_name)").eq("org_id", organizationId).eq("revenue_type", revenueType).order("month"),
        supabase.from("revenue_forecast").select("project_id, month, amount, projects(name, hotel_name)").eq("org_id", organizationId).eq("revenue_type", revenueType).order("month"),
        supabase.from("revenue_manual_adjustments").select("project_id, external_label, month, amount, projects(name, hotel_name)").eq("org_id", organizationId).eq("revenue_type", revenueType),
      ]);
      if (actualErr) throw actualErr;
      if (forecastErr) throw forecastErr;
      if (adjustErr) throw adjustErr;

      const mapRow = (r: any) => {
        const isUnlinked = !r.project_id;
        return {
          projectId: isUnlinked ? `ext:${r.external_label}` : r.project_id,
          projectName: isUnlinked ? r.external_label : formatProjectLabel(r.projects?.name ?? "Unknown", r.projects?.hotel_name),
          isUnlinked,
          month: r.month, amount: Number(r.amount),
        };
      };
      // Manual adjustments (revenue_manual_adjustments) are durable
      // corrections the automated sync would otherwise silently overwrite —
      // see that table's comment. Merged in additively alongside the raw
      // synced actuals, same treatment as revenue_qb_actuals rows.
      const rows = [...(actualData ?? []).map(mapRow), ...(adjustmentData ?? []).map(mapRow)];
      // revenue_forecast doesn't (yet) support external_label — no forecast
      // has been loaded for any unlinked property.
      const forecastRows = (forecastData ?? []).map((r: any) => ({
        projectId: r.project_id, projectName: formatProjectLabel(r.projects?.name ?? "Unknown", r.projects?.hotel_name),
        month: r.month, amount: Number(r.amount),
      }));

      const months = getRevenueCalendarMonths();
      const built: RevenueMonthTotal[] = months.map((month) => {
        const rowsForMonth = rows.filter((r) => r.month === month);
        const forecastForMonth = forecastRows.filter((r) => r.month === month);
        const byProject: Record<string, number> = {};
        rowsForMonth.forEach((r) => { byProject[r.projectId] = (byProject[r.projectId] ?? 0) + r.amount; });
        const byProjectForecast: Record<string, number> = {};
        forecastForMonth.forEach((r) => { byProjectForecast[r.projectId] = (byProjectForecast[r.projectId] ?? 0) + r.amount; });
        return {
          month,
          total: rowsForMonth.reduce((s, r) => s + r.amount, 0),
          forecastTotal: forecastForMonth.reduce((s, r) => s + r.amount, 0),
          byProject, byProjectForecast,
        };
      });
      setMonthlyTotals(built);

      const totalByProject = new Map<string, RevenueProjectTotal>();
      rows.forEach((r) => {
        const existing = totalByProject.get(r.projectId);
        if (existing) existing.total += r.amount;
        else totalByProject.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, total: r.amount, forecastTotal: 0, isUnlinked: r.isUnlinked });
      });
      forecastRows.forEach((r) => {
        const existing = totalByProject.get(r.projectId);
        if (existing) existing.forecastTotal += r.amount;
        else totalByProject.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, total: 0, forecastTotal: r.amount, isUnlinked: false });
      });
      setProjectTotals(Array.from(totalByProject.values()).sort((a, b) => (b.total + b.forecastTotal) - (a.total + a.forecastTotal)));
    } catch (e: any) {
      setError(e?.message || "Failed to load revenue data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, revenueType]);

  useEffect(() => { load(); }, [load]);

  const total = projectTotals.reduce((s, p) => s + p.total, 0);
  const forecastTotal = projectTotals.reduce((s, p) => s + p.forecastTotal, 0);

  return { loading, error, refetch: load, monthlyTotals, projectTotals, total, forecastTotal };
}
