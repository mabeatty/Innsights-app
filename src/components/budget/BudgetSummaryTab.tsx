import { useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetRow, BudgetTransaction, fmtDecimal } from "./types";
import ProjectRisksCard from "./ProjectRisksCard";
import { useAPAging, daysPastDue as apDaysPastDue, daysAgo as apDaysAgo, fmtShortDate as apFmtShortDate } from "./useAPAging";
import InvoiceDetailDialog from "../invoices/InvoiceDetailDialog";
import { ChevronDown, ChevronUp } from "lucide-react";

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

const fmtCompact = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `$${(v / 1_000_000).toFixed(2)}M`
    : Math.abs(v) >= 1_000
    ? `$${(v / 1_000).toFixed(0)}K`
    : fmtDecimal(v);

const daysAgo = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
};

// Positive = days overdue (due date has passed), negative = days until due.
const daysPastDue = (dueDateStr: string) => {
  const d = new Date(dueDateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

const fmtShortDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function BudgetSummaryTab({ budgetRows, transactions, materialsStored, projectId }: Props) {
  const { isPartner } = useAuth();
  const [plaidAccountId, setPlaidAccountId] = useState<string | null>(null);
  const [roomCount, setRoomCount] = useState<number | null>(null);
  const { approvedRows: apRows, refetch: refetchAPAging } = useAPAging(projectId);
  const [apExpanded, setApExpanded] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      const { data: infoRow } = await supabase
        .from("project_info")
        .select("total_room_count")
        .eq("project_id", projectId)
        .maybeSingle();
      const infoCount = (infoRow as any)?.total_room_count ?? null;
      if (infoCount) {
        setRoomCount(infoCount);
        return;
      }
      const { data: matrixRows } = await supabase
        .from("room_matrix_entries")
        .select("quantity")
        .eq("project_id", projectId);
      if (matrixRows && matrixRows.length > 0) {
        setRoomCount(matrixRows.reduce((s, r: any) => s + (r.quantity ?? 0), 0));
        return;
      }
      setRoomCount(null);
    })();
  }, [projectId]);

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

  const costPerKey = roomCount && roomCount > 0 ? projectCost / roomCount : null;

  // Accounts payable: approved but not yet paid — the invoice is committed
  // but cash hasn't gone out the door yet. A GC pay app is billed as ONE
  // invoice even though it's stored as multiple division-level line items
  // (all sharing the same draw_id + payee), so group those together rather
  // than listing each division as its own row. Transactions with no draw_id
  // are standalone vendor invoices and stay one row each.
  const unpaidTxns = useMemo(
    () => transactions.filter((t) => t.status === "Approved"),
    [transactions]
  );

  const totalAP = useMemo(() => unpaidTxns.reduce((s, t) => s + Number(t.amount), 0), [unpaidTxns]);

  const summaryCards = [
    { label: "Project Cost", value: fmtDecimal(projectCost) },
    { label: "Completed to Date", value: fmtDecimal(totalCompleted) },
    { label: "Balance to Finish", value: fmtDecimal(balanceToFinish) },
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
      {/* Top metric row */}
      <div className={`grid grid-cols-2 gap-3 ${isPartner ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
              <p className="text-lg font-bold mt-1">{c.value}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Cost Per Key</p>
            {costPerKey !== null ? (
              <>
                <p className="text-lg font-bold mt-1 text-primary">{fmtDecimal(costPerKey)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{roomCount} keys · budget basis</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">— Add room count in Project Info</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash & Payables + Cost Breakdown */}
      <div className="grid gap-4 lg:grid-cols-5">
        {isPartner && (
          <Card className="lg:col-span-3">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Cash & Payables
              </h3>
              <div className="flex flex-wrap gap-6 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cash Balance</p>
                  {balanceLoading ? (
                    <p className="text-lg font-bold mt-0.5 text-muted-foreground">…</p>
                  ) : plaidAccountId ? (
                    <p className="text-lg font-bold mt-0.5">{balance !== null ? fmtDecimal(balance) : "—"}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Link in Project Info</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Approved, Unpaid</p>
                  <p className="text-lg font-bold mt-0.5 text-amber-600">{fmtDecimal(totalAP)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Available</p>
                  <p className="text-lg font-bold mt-0.5">
                    {balance !== null ? fmtDecimal(balance - totalAP) : "—"}
                  </p>
                </div>
              </div>
              {apRows.length > 0 && (
                <div className="border-t pt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground text-left">
                        <th className="pb-1 font-normal">Vendor</th>
                        <th className="pb-1 font-normal text-right">Amount</th>
                        <th className="pb-1 font-normal text-right">Invoice Date</th>
                        <th className="pb-1 font-normal text-right">Due Date</th>
                        <th className="pb-1 font-normal text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(apExpanded ? apRows : apRows.slice(0, 5)).map((inv) => {
                        // Prefer the due date to judge timeliness; fall back to the
                        // 30-day-since-invoice heuristic when no due date is on file.
                        const overdueByDueDate = inv.dueDate ? apDaysPastDue(inv.dueDate) : null;
                        const isOverdue = overdueByDueDate !== null ? overdueByDueDate > 0 : (inv.invoiceDate ? apDaysAgo(inv.invoiceDate) > 30 : false);
                        const statusLabel = inv.dueDate
                          ? overdueByDueDate! > 0
                            ? `${overdueByDueDate} days overdue`
                            : `Due in ${Math.abs(overdueByDueDate!)} days`
                          : inv.invoiceDate
                          ? `${apDaysAgo(inv.invoiceDate)} days old`
                          : "—";
                        return (
                          <tr
                            key={inv.invoiceId}
                            className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setSelectedInvoiceId(inv.invoiceId)}
                          >
                            <td className="py-1.5">{inv.vendorName}</td>
                            <td className="py-1.5 text-right">{fmtDecimal(inv.amount)}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{apFmtShortDate(inv.invoiceDate)}</td>
                            <td className="py-1.5 text-right">
                              {inv.dueDate ? (
                                <span className="text-muted-foreground">{apFmtShortDate(inv.dueDate)}</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-500" title="No due date set">Not set</span>
                              )}
                            </td>
                            <td className={`py-1.5 text-right whitespace-nowrap ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              {statusLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {apRows.length > 5 && (
                    <button
                      className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
                      onClick={() => setApExpanded((e) => !e)}
                    >
                      {apExpanded ? (
                        <>Show less <ChevronUp className="h-3 w-3" /></>
                      ) : (
                        <>+{apRows.length - 5} more unpaid invoice{apRows.length - 5 === 1 ? "" : "s"} <ChevronDown className="h-3 w-3" /></>
                      )}
                    </button>
                  )}
                </div>
              )}
              {apRows.length === 0 && (
                <p className="text-xs text-muted-foreground border-t pt-3">No approved, unpaid invoices.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={isPartner ? "lg:col-span-2" : "lg:col-span-5"}>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Cost Breakdown
            </h3>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Scheduled</th>
                    <th className="px-3 py-2 text-right">Complete</th>
                    <th className="px-3 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.label} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium">{g.label}</td>
                      <td className="px-3 py-2 text-right">{fmtCompact(g.scheduled)}</td>
                      <td className="px-3 py-2 text-right">{fmtCompact(g.completed)}</td>
                      <td className="px-3 py-2 text-right">{g.pctComplete.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold text-xs">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{fmtCompact(projectCost)}</td>
                    <td className="px-3 py-2 text-right">{fmtCompact(totalCompleted)}</td>
                    <td className="px-3 py-2 text-right">{pctComplete.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {totalRetainage > 0 && (
              <p className="text-xs text-muted-foreground mt-2">Retainage held: {fmtDecimal(totalRetainage)}</p>
            )}
            {totalDeferred > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Deferred fees: {fmtDecimal(totalDeferred)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ProjectRisksCard projectId={projectId} />

      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onChange={refetchAPAging}
      />
    </div>
  );
}
