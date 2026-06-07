import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DatePickerInput from "@/components/ui/date-picker-input";
import CategorizationModal from "./CategorizationModal";

export interface PlaidTransaction {
  id: string;
  merchant_name: string;
  amount: number;
  date: string;
  account_id: string;
  status: string;
  plaid_category: string | null;
  description: string;
  receipt_url: string | null;
  assignment_type: string | null;
  chart_of_accounts_id: string | null;
  project_id: string | null;
  budget_line_division: string | null;
  expense_report_id: string | null;
  notes: string | null;
  cardholder_user_id: string | null;
}

interface PlaidAccount {
  id: string;
  plaid_account_id: string;
  name: string;
  mask: string | null;
  institution_name: string;
}

interface PlaidConnection {
  id: string;
  institution_name: string;
  item_id: string;
}

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function getDefaultStartDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

interface ExpenseInboxProps {
  onTransactionSaved?: () => void;
}

export default function ExpenseInbox({ onTransactionSaved }: ExpenseInboxProps = {}) {
  const { user, organizationId } = useAuth();
  const [myTransactions, setMyTransactions] = useState<PlaidTransaction[]>([]);
  const [teamTransactions, setTeamTransactions] = useState<PlaidTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlaidTransaction | null>(null);
  const [expenseRole, setExpenseRole] = useState<string>("Employee");
  const [directReportIds, setDirectReportIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New state for filters & sync
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [syncing, setSyncing] = useState(false);

  // Load connections
  useEffect(() => {
    if (!organizationId) return;
    (supabase as any).from("plaid_connections").select("id, institution_name, item_id")
      .eq("org_id", organizationId).eq("status", "Active").order("created_at")
      .then(({ data }: any) => setConnections(data ?? []));
    (supabase as any).from("plaid_accounts").select("id, plaid_account_id, name, mask, institution_name")
      .eq("org_id", organizationId).order("institution_name")
      .then(({ data }: any) => setAccounts(data ?? []));
  }, [organizationId]);

  useEffect(() => {
    if (!user || !organizationId) return;
    (async () => {
      const { data: member } = await supabase
        .from("organization_members")
        .select("id, expense_role")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .limit(1)
        .single();

      const role = member?.expense_role || "Employee";
      setExpenseRole(role);

      if (role === "Manager" && member) {
        const { data: reports } = await supabase
          .from("organization_members")
          .select("user_id")
          .eq("supervisor_id", member.id);
        setDirectReportIds((reports ?? []).map((r) => r.user_id).filter(Boolean) as string[]);
      }
    })();
  }, [user, organizationId]);

  const load = useCallback(async () => {
    if (!organizationId || !user) return;

    const isAdmin = expenseRole === "Partner" || expenseRole === "admin";

    let query = (supabase as any)
      .from("plaid_transactions")
      .select("*")
      .eq("org_id", organizationId)
      .in("status", ["unassigned", "assigned", "categorized"])
      .is("expense_report_id", null)
      .order("date", { ascending: false });

    // Filter by account
    if (selectedAccount !== "all") {
      const acct = accounts.find((a) => a.id === selectedAccount);
      if (acct) {
        query = query.eq("account_id", acct.plaid_account_id);
      } else {
        // Fallback: selectedAccount is a connection id
        const conn = connections.find((c) => c.id === selectedAccount);
        if (conn) query = query.eq("plaid_item_id", conn.item_id);
      }
    }

    // Filter by date range
    if (startDate) {
      query = query.gte("date", startDate.toISOString().split("T")[0]);
    }
    if (endDate) {
      query = query.lte("date", endDate.toISOString().split("T")[0]);
    }

    if (!isAdmin) {
      query = query.or(`cardholder_user_id.eq.${user.id},cardholder_user_id.is.null`);
    }

    const { data, error } = await query;
    if (error) toast.error("Failed to load transactions.");

    if (isAdmin) {
      setMyTransactions(data ?? []);
      setTeamTransactions([]);
    } else {
      setMyTransactions(data ?? []);
    }

    if (expenseRole === "Manager" && directReportIds.length > 0) {
      let teamQuery = (supabase as any)
        .from("plaid_transactions")
        .select("*")
        .eq("org_id", organizationId)
        .in("status", ["unassigned", "assigned"])
        .is("expense_report_id", null)
        .in("cardholder_user_id", directReportIds)
        .order("date", { ascending: false });

      if (selectedAccount !== "all") {
        const acct = accounts.find((a) => a.id === selectedAccount);
        if (acct) {
          teamQuery = teamQuery.eq("account_id", acct.plaid_account_id);
        } else {
          const conn = connections.find((c) => c.id === selectedAccount);
          if (conn) teamQuery = teamQuery.eq("plaid_item_id", conn.item_id);
        }
      }
      if (startDate) teamQuery = teamQuery.gte("date", startDate.toISOString().split("T")[0]);
      if (endDate) teamQuery = teamQuery.lte("date", endDate.toISOString().split("T")[0]);

      const { data: teamData } = await teamQuery;
      setTeamTransactions(teamData ?? []);
    }

    setLoading(false);
  }, [organizationId, user, expenseRole, directReportIds, selectedAccount, startDate, endDate, accounts, connections]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setSelectedIds(new Set()); }, [myTransactions, teamTransactions]);

  const handleSync = async () => {
    setSyncing(true);
    toast.info("Syncing transactions…");
    const body: any = {};
    if (startDate) body.start_date = startDate.toISOString().split("T")[0];
    if (endDate) body.end_date = endDate.toISOString().split("T")[0];
    if (selectedAccount !== "all") body.connection_id = selectedAccount;

    const { error } = await supabase.functions.invoke("sync-transactions", { body });
    if (error) toast.error("Sync failed.");
    else {
      toast.success("Sync complete.");
      // Reload accounts (newly populated from Plaid)
      (supabase as any).from("plaid_accounts").select("id, plaid_account_id, name, mask, institution_name")
        .eq("org_id", organizationId).order("institution_name")
        .then(({ data }: any) => setAccounts(data ?? []));
      load();
      onTransactionSaved?.();
    }
    setSyncing(false);
  };

  const allTransactions = [...myTransactions, ...teamTransactions];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === allTransactions.length && allTransactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allTransactions.map((t) => t.id)));
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleting(true);
    const { error } = await supabase.from("plaid_transactions").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      toast.error("Failed to delete transactions.");
    } else {
      toast.success(`Deleted ${ids.length} transaction${ids.length > 1 ? "s" : ""}.`);
      setSelectedIds(new Set());
      setSingleDeleteId(null);
      load();
      onTransactionSaved?.();
    }
  };

  const confirmBulkDelete = () => { setSingleDeleteId(null); setDeleteConfirmOpen(true); };
  const confirmSingleDelete = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setSingleDeleteId(id); setDeleteConfirmOpen(true); };
  const handleConfirmDelete = () => { const ids = singleDeleteId ? [singleDeleteId] : Array.from(selectedIds); setDeleteConfirmOpen(false); handleDelete(ids); };

  const statusColor = (s: string) => {
    if (s === "categorized") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    if (s === "assigned") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  };

  const TransactionTable = ({ transactions, title }: { transactions: PlaidTransaction[]; title?: string }) => (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>}
      {transactions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No transactions.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto bg-card">
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-left">
                <th className="px-3 py-2 w-10">
                  <Checkbox
                    checked={allTransactions.length > 0 && selectedIds.size === allTransactions.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Merchant</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} aria-label={`Select ${t.merchant_name}`} />
                  </td>
                  <td className="px-3 py-2 text-xs">{t.date}</td>
                  <td className="px-3 py-2 font-medium">{t.merchant_name}</td>
                  <td className="px-3 py-2 text-right">{fmt(Number(t.amount))}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{t.account_id?.slice(-4) ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", statusColor(t.status))}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" onClick={(e) => confirmSingleDelete(t.id, e)} aria-label="Delete transaction">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div className="space-y-4 pt-2">
      {/* Toolbar: Account dropdown, Date range, Sync button */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          {/* Account filter */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Account</label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="h-8 text-xs w-[180px]">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.length > 0
                  ? accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.institution_name} xxxx{a.mask || '????'}
                      </SelectItem>
                    ))
                  : connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.institution_name}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <DatePickerInput value={startDate} onChange={setStartDate} placeholder="Start date" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <DatePickerInput value={endDate} onChange={setEndDate} placeholder="End date" />
          </div>
        </div>

        {/* Sync button */}
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync"}
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
          <Button variant="destructive" size="sm" onClick={confirmBulkDelete} disabled={deleting}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected
          </Button>
        </div>
      )}

      <TransactionTable transactions={myTransactions} title={teamTransactions.length > 0 ? "My Inbox" : undefined} />

      {teamTransactions.length > 0 && (
        <TransactionTable transactions={teamTransactions} title="Team Inbox" />
      )}

      {myTransactions.length === 0 && teamTransactions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No transactions in your inbox.</p>
          <p className="text-xs mt-1">Connect a bank account in Settings to start syncing.</p>
        </div>
      )}

      {selected && (
        <CategorizationModal
          transaction={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); onTransactionSaved?.(); }}
        />
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction{singleDeleteId ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {singleDeleteId ? "this transaction" : `${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""}`}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
