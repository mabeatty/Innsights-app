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
  budgetToDateTotal: number;
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
        // Comparing actuals (which only cover closed months) against a
        // full 12-month budget understates performance for most of the
        // year by construction — e.g. 8 months of real revenue always
        // looks "behind" a full annual target, even on a month that's
        // running exactly on plan. budgetToDateTotal sums budget only for
        // the same months that have real (non-projected) actuals, so the
        // comparison is apples-to-apples (found 2026-09-23).
        const budgetToDateTotal = months.reduce((s, m) => s + (m.is_projected ? 0 : m.budget), 0);
        const actualTotal = months.reduce((s, m) => s + m.actual, 0);
        return { category: cat, months, budgetTotal, budgetToDateTotal, actualTotal };
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
    // Revenue and expenses close out independently — a month's books can
    // be current on the revenue side (e.g. QuickBooks-synced) while the
    // expense side still carries budget-copy placeholders, or vice versa.
    // Treating "isProjected" as a single flag requiring both sides to
    // agree meant a real revenue update for a month got silently ignored
    // in toDateRevenue as long as that month's expenses were still
    // projected (found 2026-09-15, when a from Revenue-tab reconciliation
    // didn't move the Company Financials KPI at all).
    const isRevenueProjected = revenueSeries.some((c) => c.months[i]?.is_projected);
    const isExpenseProjected = expenseSeries.some((c) => c.months[i]?.is_projected);
    const isProjected = isRevenueProjected || isExpenseProjected; // kept for existing chart-dimming behavior
    return { month, revBudget, revActual, expBudget, expActual, isProjected, isRevenueProjected, isExpenseProjected };
  });

  const revenueBudgetTotal = revenueSeries.reduce((s, c) => s + c.budgetTotal, 0);
  const revenueBudgetToDateTotal = revenueSeries.reduce((s, c) => s + c.budgetToDateTotal, 0);
  const revenueActualTotal = revenueSeries.reduce((s, c) => s + c.actualTotal, 0);
  const expenseBudgetTotal = expenseSeries.reduce((s, c) => s + c.budgetTotal, 0);
  const expenseBudgetToDateTotal = expenseSeries.reduce((s, c) => s + c.budgetToDateTotal, 0);
  const expenseActualTotal = expenseSeries.reduce((s, c) => s + c.actualTotal, 0);

  // "To-date" is deliberately restricted to closed (non-projected) months —
  // a projected month hasn't happened yet, so including it here would
  // misrepresent a forecast as something that's already occurred. Revenue
  // and expenses are evaluated against their own closed-month flag
  // independently (see isRevenueProjected/isExpenseProjected above), not a
  // combined one.
  const toDateRevenue = monthlyTotals.filter((m) => !m.isRevenueProjected).reduce((s, m) => s + m.revActual, 0);
  const toDateExpenses = monthlyTotals.filter((m) => !m.isExpenseProjected).reduce((s, m) => s + m.expActual, 0);
  const toDateNetIncome = toDateRevenue - toDateExpenses;
  // No Depreciation & Amortization category exists in this business's real
  // chart of accounts (no fixed assets being depreciated), and Interest is
  // folded into Banking & Finance Costs rather than broken out separately —
  // so this is Net Income + Taxes added back, an approximation of EBITDA
  // rather than a full D&A-adjusted figure.
  const toDateTaxes = series
    .filter((s) => s.category.name === "Taxes")
    .reduce((sum, s) => sum + s.months.filter((m) => !m.is_projected).reduce((a, m) => a + m.actual, 0), 0);
  const toDateEbitdaApprox = toDateNetIncome + toDateTaxes;
  // "Gross margin" here is really net margin (net income ÷ revenue) — there's
  // no COGS category distinct from operating expenses in this business's
  // real chart of accounts, so a traditional gross-margin calculation
  // (revenue minus COGS, before overhead) isn't meaningful for this data.
  const toDateNetMarginPct = toDateRevenue !== 0 ? (toDateNetIncome / toDateRevenue) * 100 : null;

  return {
    loading, error, refetch: load,
    categories, series, revenueSeries, expenseSeries, monthlyTotals,
    revenueBudgetTotal, revenueBudgetToDateTotal, revenueActualTotal,
    expenseBudgetTotal, expenseBudgetToDateTotal, expenseActualTotal,
    // Full-year budget totals are kept too (for "here's what we're pacing
    // toward" context), but net income vs. budget compares against the
    // to-date figure — comparing partial-year actuals to a full annual
    // target always looks artificially behind, regardless of how the
    // year's actually going.
    netIncomeBudget: revenueBudgetToDateTotal - expenseBudgetToDateTotal,
    netIncomeActual: revenueActualTotal - expenseActualTotal,
    toDateRevenue, toDateExpenses, toDateNetIncome, toDateEbitdaApprox, toDateNetMarginPct,
  };
}
