import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startOfMonth, endOfMonth } from "date-fns";
import { BudgetRow, BudgetTransaction, ALL_DIVISIONS } from "./budget/types";
import BudgetSummaryTab from "./budget/BudgetSummaryTab";
import ProjectAccountingModule from "./ProjectAccountingModule";

interface Props {
  projectId: string;
  projectName: string;
  projectInfo?: any;
  activeTab: "executive-summary" | "project-accounting";
}

export default function BudgetModule({ projectId, projectName, projectInfo, activeTab }: Props) {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialsStored, setMaterialsStored] = useState<Record<string, number>>({});
  const [periodStart, setPeriodStart] = useState<Date>(startOfMonth(new Date()));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfMonth(new Date()));

  const loadBudget = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_budget")
      .select("*")
      .eq("project_id", projectId)
      .order("division_number");

    if (error) {
      toast.error("Failed to load budget.");
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      setRows(data as BudgetRow[]);
      setLoading(false);
      return;
    }

    const seeds = ALL_DIVISIONS.map((d) => ({
      project_id: projectId,
      division_number: d.number,
      division_name: d.name,
      cost_type: d.cost_type,
      scheduled_value: 0,
      notes: null,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("project_budget")
      .insert(seeds)
      .select();

    if (insertErr) toast.error("Failed to initialize budget.");
    else setRows((inserted as BudgetRow[]).sort((a, b) => a.division_number.localeCompare(b.division_number)));
    setLoading(false);
  }, [projectId]);

  const loadTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from("budget_transactions")
      .select("*")
      .eq("project_id", projectId)
      .order("transaction_number");
    if (!error && data) {
      setTransactions(data as BudgetTransaction[]);
    }
  }, [projectId]);

  useEffect(() => { loadBudget(); loadTransactions(); }, [loadBudget, loadTransactions]);

  const handleTransactionsChange = useCallback((txns: BudgetTransaction[]) => {
    setTransactions(txns);
  }, []);

  const handlePeriodChange = useCallback((start: Date, end: Date) => {
    setPeriodStart(start);
    setPeriodEnd(end);
  }, []);

  const handleMaterialsChange = useCallback((divNum: string, value: number) => {
    setMaterialsStored((prev) => ({ ...prev, [divNum]: value }));
  }, []);

  const handleScheduledValueChange = useCallback((id: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, scheduled_value: value } : r)));
  }, []);

  const handleScheduledValueBlur = useCallback(async (id: string, value: number) => {
    const { error } = await supabase
      .from("project_budget")
      .update({ scheduled_value: value })
      .eq("id", id);
    if (error) toast.error("Save failed.");
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading budget…</p>;

  if (activeTab === "executive-summary") {
    return (
      <BudgetSummaryTab
        budgetRows={rows}
        transactions={transactions}
        materialsStored={materialsStored}
        projectId={projectId}
      />
    );
  }

  return (
    <ProjectAccountingModule
      projectId={projectId}
      projectName={projectName}
      projectInfo={projectInfo}
      budgetRows={rows}
      transactions={transactions}
      materialsStored={materialsStored}
      periodStart={periodStart}
      periodEnd={periodEnd}
      onPeriodChange={handlePeriodChange}
      onMaterialsChange={handleMaterialsChange}
      onScheduledValueChange={handleScheduledValueChange}
      onScheduledValueBlur={handleScheduledValueBlur}
      onTransactionsChange={handleTransactionsChange}
      onBudgetReload={loadBudget}
    />
  );
}
