import { useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetRow, BudgetTransaction, fmtDecimal } from "./types";

interface Props {
  budgetRows: BudgetRow[];
  transactions: BudgetTransaction[];
  materialsStored: Record<string, number>;
  projectId: string;
}

interface CostGroup {
  label: string;
  scheduled: number;
  completed: number;
  pctComplete: number;
  balance: number;
  retainage: number;
}

export default function BudgetSummaryTab({ budgetRows, transactions, materialsStored, projectId }: Props) {
  const { isPartner } = useAuth();
  const [plaidAccountId, setPlaidAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPartner) return;
    supabase
      .from("projects")
      .select("plaid_account_id")
      .eq("id", projectId)
      .single()
      .then(({ data: proj }) => {
        setPlaidAccountId((proj as any)?.plaid_account_id ?? null);
      });
  }, [projectId, isPartner]);

  const approvedTxns = useMemo(
    () => transactions.filter((t) => t.status === "Approved" || t.status === "Paid" || t.status === "Deferred"),
    [transactions]
  );

  const totalDeferred = useMemo(
    () => transactions.filter((t) => t.status === "Deferred").reduce((s, t) => s + Number(t.amount), 0),
    [transactions]
  );

  const computeGroup = (costType: string): CostGroup => {
    const rows = budgetRows.filter((r) => r.cost_type === costType);
    const scheduled = rows.reduce((s, r) => s + Number(r.scheduled_value), 0);
    let completed = 0;
    let retainage = 0;
    for (const row of rows) {
      const divTxns = approvedTxns.filter((t) => t.division_number === row.division_number);
      const work = divTxns.reduce((s, t) => s + Number(t.amount), 0);
      const mat = materialsStored[row.division_number] ?? 0;
      completed += work + mat;
      retainage += divTxns.reduce((s, t) => s + Number(t.retainage_amount), 0);
    }
    const pctComplete = scheduled > 0 ? (completed / scheduled) * 100 : 0;
    const balance = scheduled - completed;
    return { label: costType === "hard" ? "Hard Costs" : "Soft Costs", scheduled, completed, pctComplete, balance, retainage };
  };

  const hard = useMemo(() => computeGroup("hard"), [budgetRows, approvedTxns, materialsStored]);
  const soft = useMemo(() => computeGroup("soft"), [budgetRows, approvedTxns, materialsStored]);

  const projectCost = hard.scheduled + soft.scheduled;
  const totalCompleted = hard.completed + soft.completed;
  const totalRetainage = hard.retainage + soft.retainage;
  const balanceToFinish = projectCost - totalCompleted;
  const pctComplete = projectCost > 0 ? (totalCompleted / projectCost) * 100 : 0;

  const summaryCards = [
    { label: "Project Cost", value: fmtDecimal(projectCost) },
    { label: "Completed to Date", value: fmtDecimal(totalCompleted) },
    { label: "Retainage Held", value: fmtDecimal(totalRetainage) },
    { label: "Balance to Finish", value: fmtDecimal(balanceToFinish) },
    { label: "% Complete", value: `${pctComplete.toFixed(1)}%` },
    ...(totalDeferred > 0 ? [{ label: "Deferred Fees", value: fmtDecimal(totalDeferred) }] : []),
  ];

  // Account balance card for Partners
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!isPartner || !plaidAccountId) return;
    setBalanceLoading(true);
    supabase
      .from("plaid_accounts")
      .select("plaid_account_id")
      .eq("id", plaidAccountId)
      .single()
      .then(({ data: acct }) => {
        if (!acct) { setBalanceLoading(false); return; }
        supabase
          .from("plaid_transactions")
          .select("amount")
          .eq("account_id", (acct as any).plaid_account_id ?? "")
          .then(({ data: balData }) => {
            if (balData) {
              setBalance(balData.reduce((s, t) => s + Number(t.amount), 0));
            }
            setBalanceLoading(false);
          });
      });
  }, [plaidAccountId, isPartner]);

  const groups = [hard, soft];

  return (
    <div className="space-y-6 pt-4">
      {/* Summary Cards */}
      <div className={`grid grid-cols-2 gap-3 ${isPartner ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
              <p className="text-lg font-bold mt-1">{c.value}</p>
            </CardContent>
          </Card>
        ))}
        {isPartner && (
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Balance</p>
              {balanceLoading ? (
                <p className="text-lg font-bold mt-1 text-muted-foreground">…</p>
              ) : plaidAccountId ? (
                <p className="text-lg font-bold mt-1">{balance !== null ? fmtDecimal(balance) : "—"}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">— Link in Project Info</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Progress Bars */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Overall Progress</span>
              <span>{pctComplete.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(pctComplete, 100)} className="h-3" />
          </div>
          {groups.map((g) => (
            <div key={g.label} className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{g.label}</span>
                <span>{g.pctComplete.toFixed(1)}%</span>
              </div>
              <Progress value={Math.min(g.pctComplete, 100)} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Hard vs Soft Breakdown Table */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Cost Breakdown
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Scheduled Value</th>
                  <th className="px-3 py-2 text-right">Completed to Date</th>
                  <th className="px-3 py-2 text-right">% Complete</th>
                  <th className="px-3 py-2 text-right">Balance to Finish</th>
                  <th className="px-3 py-2 text-right">Retainage Held</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">{g.label}</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(g.scheduled)}</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(g.completed)}</td>
                    <td className="px-3 py-2 text-right">{g.pctComplete.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(g.balance)}</td>
                    <td className="px-3 py-2 text-right">{fmtDecimal(g.retainage)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/50 font-semibold text-xs">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(projectCost)}</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(totalCompleted)}</td>
                  <td className="px-3 py-2 text-right">{pctComplete.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(balanceToFinish)}</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(totalRetainage)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
