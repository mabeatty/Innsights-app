import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { EquitySource, DebtTranche, Investor, CashFlowRow } from "./types";

export function useCapitalData(projectId: string) {
  const [equitySources, setEquitySources] = useState<EquitySource[]>([]);
  const [debtTranches, setDebtTranches] = useState<DebtTranche[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [cashFlowRows, setCashFlowRows] = useState<CashFlowRow[]>([]);
  const [budgetTotal, setBudgetTotal] = useState(0);
  const [transactions, setTransactions] = useState<{ date: string; amount: number; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [investorPositions, setInvestorPositions] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [eqRes, dtRes, invRes, cfRes, budRes, txRes, ipRes] = await Promise.all([
      supabase.from("capital_equity_sources").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("capital_debt_tranches").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("capital_investors").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("capital_cash_flow").select("*").eq("project_id", projectId).order("month_year"),
      supabase.from("project_budget").select("scheduled_value").eq("project_id", projectId),
      supabase.from("budget_transactions").select("date, amount, status").eq("project_id", projectId),
      supabase.from("investor_positions").select("*").eq("project_id", projectId).order("investing_entity") as any,
    ]);

    if (eqRes.data) setEquitySources(eqRes.data as EquitySource[]);
    if (dtRes.data) setDebtTranches(dtRes.data as DebtTranche[]);
    if (invRes.data) setInvestors(invRes.data as Investor[]);
    if (cfRes.data) setCashFlowRows(cfRes.data as CashFlowRow[]);
    if (budRes.data) setBudgetTotal(budRes.data.reduce((s, r) => s + Number(r.scheduled_value), 0));
    if (txRes.data) setTransactions(txRes.data.map(t => ({ date: t.date, amount: Number(t.amount), status: t.status })));
    if (ipRes.data) setInvestorPositions(ipRes.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Equity CRUD
  const addEquity = async (fields?: Partial<EquitySource>) => {
    const { data, error } = await supabase.from("capital_equity_sources").insert({ project_id: projectId, source_name: "", equity_type: "GP Equity", ...fields }).select().single();
    if (error) toast.error(error.message);
    else setEquitySources(prev => [...prev, data as EquitySource]);
  };
  const updateEquity = async (id: string, fields: Partial<EquitySource>) => {
    setEquitySources(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r));
    const { error } = await supabase.from("capital_equity_sources").update(fields).eq("id", id);
    if (error) toast.error(error.message);
  };
  const deleteEquity = async (id: string) => {
    const { error } = await supabase.from("capital_equity_sources").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setEquitySources(prev => prev.filter(r => r.id !== id));
  };

  // Debt CRUD
  const addDebt = async (fields?: Partial<DebtTranche>) => {
    const { data, error } = await supabase.from("capital_debt_tranches").insert({ project_id: projectId, lender_name: "", loan_type: "Construction Loan", ...fields }).select().single();
    if (error) toast.error(error.message);
    else setDebtTranches(prev => [...prev, data as DebtTranche]);
  };
  const updateDebt = async (id: string, fields: Partial<DebtTranche>) => {
    setDebtTranches(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r));
    const { error } = await supabase.from("capital_debt_tranches").update(fields).eq("id", id);
    if (error) toast.error(error.message);
  };
  const deleteDebt = async (id: string) => {
    const { error } = await supabase.from("capital_debt_tranches").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setDebtTranches(prev => prev.filter(r => r.id !== id));
  };

  // Investor CRUD
  const addInvestor = async (fields?: Partial<Investor>) => {
    const { data, error } = await supabase.from("capital_investors").insert({ project_id: projectId, investor_name: "", ...fields }).select().single();
    if (error) toast.error(error.message);
    else setInvestors(prev => [...prev, data as Investor]);
  };
  const updateInvestor = async (id: string, fields: Partial<Investor>) => {
    setInvestors(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r));
    const { error } = await supabase.from("capital_investors").update(fields).eq("id", id);
    if (error) toast.error(error.message);
  };
  const deleteInvestor = async (id: string) => {
    const { error } = await supabase.from("capital_investors").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setInvestors(prev => prev.filter(r => r.id !== id));
  };

  // Cash Flow CRUD
  const upsertCashFlow = async (monthYear: string, fields: Partial<CashFlowRow>) => {
    // Always try insert first; if conflict, update. Avoids stale state issues.
    const { data: inserted, error: insertErr } = await supabase
      .from("capital_cash_flow")
      .insert({ project_id: projectId, month_year: monthYear, projected_spend: 0, draw_amount: 0, ...fields })
      .select()
      .single();
    if (insertErr) {
      // Row exists — update instead
      const { data: updated, error: updateErr } = await supabase
        .from("capital_cash_flow")
        .update(fields)
        .eq("project_id", projectId)
        .eq("month_year", monthYear)
        .select()
        .single();
      if (updateErr) toast.error(updateErr.message);
      else {
        setCashFlowRows(prev => {
          const idx = prev.findIndex(r => r.month_year === monthYear);
          if (idx >= 0) { const next = [...prev]; next[idx] = updated as CashFlowRow; return next; }
          return [...prev, updated as CashFlowRow].sort((a, b) => a.month_year.localeCompare(b.month_year));
        });
      }
    } else {
      setCashFlowRows(prev => [...prev, inserted as CashFlowRow].sort((a, b) => a.month_year.localeCompare(b.month_year)));
    }
  };

  const deleteCashFlowAll = async () => {
    const ids = cashFlowRows.map(r => r.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("capital_cash_flow").delete().eq("project_id", projectId);
    if (error) toast.error(error.message);
    else setCashFlowRows([]);
  };

  return {
    loading, budgetTotal, transactions,
    equitySources, addEquity, updateEquity, deleteEquity,
    debtTranches, addDebt, updateDebt, deleteDebt,
    investors, addInvestor, updateInvestor, deleteInvestor,
    cashFlowRows, upsertCashFlow, deleteCashFlowAll,
    investorPositions, reload: load,
  };
}
