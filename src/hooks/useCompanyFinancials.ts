import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FinancialCategory {
  id: string;
  name: string;
  type: "revenue" | "expense";
  sort_order: number;
}

export interface MonthlyValue {
  month: string; // yyyy-MM-dd, first of month
  budget: number;
  actual: number;
  is_projected: boolean;
}

export interface CategorySeries {
  category: FinancialCategory;
  months: MonthlyValue[];
  budgetTotal: number;
  actualTotal: number;
}

// Loads company-level budget + actuals for a given year and joins them by
// (category, month) — this is the single source both the top-line KPIs and
// the category detail table pull from, so they can never show different
// numbers for the same underlying data.
export function useCompanyFinancials(year: number) {
  const { organizationId } = useAuth();
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [series, setSeries] = useState<CategorySeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const [{ data: cats, error: catErr }, { data: budgetRows, error: budgetErr }, { data: actualRows, error: actualErr }] = await Promise.all([
        supabase.from("company_financial_categories").select("id, name, type, sort_order").eq("org_id", organizationId).order("type").order("sort_order"),
        supabase.from("company_budget").select("category_id, month, amount").eq("org_id", organizationId).gte("month", yearStart).lte("month", yearEnd),
        supabase.from("company_actuals").select("category_id, month, amount, is_projected").eq("org_id", organizationId).gte("month", yearStart).lte("month", yearEnd),
      ]);
      if (catErr) throw catErr;
      if (budgetErr) throw budgetErr;
      if (actualErr) throw actualErr;

      const catList = (cats ?? []) as FinancialCategory[];
      setCategories(catList);

      const budgetByKey = new Map<string, number>();
      (budgetRows ?? []).forEach((r: any) => budgetByKey.set(`${r.category_id}|${r.month}`, Number(r.amount)));
      const actualByKey = new Map<string, { amount: number; is_projected: boolean }>();
      (actualRows ?? []).forEach((r: any) => actualByKey.set(`${r.category_id}|${r.month}`, { amount: Number(r.amount), is_projected: r.is_projected }));

      const months12 = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);

      const builtSeries: CategorySeries[] = catList.map((cat) => {
        const months: MonthlyValue[] = months12.map((m) => {
          const key = `${cat.id}|${m}`;
          const budget = budgetByKey.get(key) ?? 0;
          const actualEntry = actualByKey.get(key);
          return { month: m, budget, actual: actualEntry?.amount ?? 0, is_projected: actualEntry?.is_projected ?? false };
        });
        const budgetTotal = months.reduce((s, m) => s + m.budget, 0);
        const actualTotal = months.reduce((s, m) => s + m.actual, 0);
        return { category: cat, months, budgetTotal, actualTotal };
      });
      setSeries(builtSeries);
    } catch (e: any) {
      setError(e?.message || "Failed to load company financials.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, year]);

  useEffect(() => { load(); }, [load]);

  const revenueSeries = series.filter((s) => s.category.type === "revenue");
  const expenseSeries = series.filter((s) => s.category.type === "expense");

  const monthlyTotals = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const revBudget = revenueSeries.reduce((s, c) => s + c.months[i].budget, 0);
    const revActual = revenueSeries.reduce((s, c) => s + c.months[i].actual, 0);
    const expBudget = expenseSeries.reduce((s, c) => s + c.months[i].budget, 0);
    const expActual = expenseSeries.reduce((s, c) => s + c.months[i].actual, 0);
    const isProjected = series.some((c) => c.months[i]?.is_projected);
    return { month, revBudget, revActual, expBudget, expActual, isProjected };
  });

  const revenueBudgetTotal = revenueSeries.reduce((s, c) => s + c.budgetTotal, 0);
  const revenueActualTotal = revenueSeries.reduce((s, c) => s + c.actualTotal, 0);
  const expenseBudgetTotal = expenseSeries.reduce((s, c) => s + c.budgetTotal, 0);
  const expenseActualTotal = expenseSeries.reduce((s, c) => s + c.actualTotal, 0);

  return {
    loading, error, refetch: load,
    categories, series, revenueSeries, expenseSeries, monthlyTotals,
    revenueBudgetTotal, revenueActualTotal, expenseBudgetTotal, expenseActualTotal,
    netIncomeBudget: revenueBudgetTotal - expenseBudgetTotal,
    netIncomeActual: revenueActualTotal - expenseActualTotal,
  };
}
