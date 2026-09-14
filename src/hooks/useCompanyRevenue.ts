import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CompanyRevenueMonth {
  month: string; // 'YYYY-MM'
  amount: number;
}

// Loads a single company-wide (not project-attributed) revenue stream —
// e.g. Construction Fees, Consulting Fees — synced nightly from QuickBooks
// by sync-dev-fee-revenue-quickbooks. Unlike Development Fees, QuickBooks
// doesn't track these per-project (see that function's comments), so this
// is a flat monthly total, no per-project breakdown.
export function useCompanyRevenue(revenueType: string) {
  const { organizationId } = useAuth();
  const [months, setMonths] = useState<CompanyRevenueMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("company_revenue_monthly")
        .select("month, amount")
        .eq("org_id", organizationId)
        .eq("revenue_type", revenueType)
        .order("month");
      if (err) throw err;
      setMonths((data ?? []).map((r: any) => ({ month: r.month, amount: Number(r.amount) })));
    } catch (e: any) {
      setError(e?.message || "Failed to load revenue data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, revenueType]);

  useEffect(() => { load(); }, [load]);

  const total = months.reduce((s, m) => s + m.amount, 0);

  return { loading, error, refetch: load, months, total };
}
