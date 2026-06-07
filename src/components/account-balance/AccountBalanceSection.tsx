import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Landmark } from "lucide-react";
import { toast } from "sonner";

interface PlaidAccount {
  id: string;
  name: string;
  institution_name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
}

interface Transaction {
  id: string;
  date: string;
  merchant_name: string;
  amount: number;
  description: string | null;
}

interface Props {
  projectId: string;
  plaidAccountId: string | null;
  compact?: boolean; // For Executive Summary — balance only, no transactions
}

export default function AccountBalanceSection({ projectId, plaidAccountId, compact = false }: Props) {
  const [account, setAccount] = useState<PlaidAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!plaidAccountId) { setLoading(false); return; }

    // Fetch the linked account details
    const { data: acct } = await supabase
      .from("plaid_accounts")
      .select("id, name, institution_name, mask, type, subtype, connection_id")
      .eq("id", plaidAccountId)
      .single();

    if (!acct) { setLoading(false); return; }
    setAccount(acct as PlaidAccount);

    // Fetch connection last_synced
    const { data: conn } = await supabase
      .from("plaid_connections")
      .select("last_synced")
      .eq("id", (acct as any).connection_id)
      .single();
    setLastSynced(conn?.last_synced ?? null);

    if (!compact) {
      // Fetch last 10 transactions for this account
      const { data: txns } = await supabase
        .from("plaid_transactions")
        .select("id, date, merchant_name, amount, description")
        .eq("account_id", (acct as any).plaid_account_id ?? "")
        .order("date", { ascending: false })
        .limit(10);
      setTransactions((txns as Transaction[]) ?? []);
    }

    // Calculate balance from transactions (sum of all amounts for this account)
    // Positive amounts = debits, negative = credits in Plaid convention
    // We'll show the latest balance approximation from transaction sums
    const { data: balData } = await supabase
      .from("plaid_transactions")
      .select("amount")
      .eq("account_id", (acct as any).plaid_account_id ?? "");

    if (balData) {
      const total = balData.reduce((s, t) => s + Number(t.amount), 0);
      setBalance(total);
    }

    setLoading(false);
  }, [plaidAccountId, compact]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    if (!account) return;
    setRefreshing(true);
    try {
      // Get the connection_id for this account to find the right connection
      const { data: acctFull } = await supabase
        .from("plaid_accounts")
        .select("connection_id")
        .eq("id", plaidAccountId!)
        .single();

      if (acctFull) {
        const { error } = await supabase.functions.invoke("sync-transactions", {
          body: { connection_id: acctFull.connection_id },
        });
        if (error) throw error;
        toast.success("Transactions synced");
        await loadData();
      }
    } catch (err: any) {
      toast.error("Sync failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading account data…</p>;

  if (!plaidAccountId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <Landmark className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Link a bank account in Project Info to track your account balance.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!account) return null;

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const fmtDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const fmtTimestamp = (ts: string) =>
    new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // Compact mode — just a balance card
  if (compact) {
    return (
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {account.institution_name}{account.mask ? ` ••${account.mask}` : ""}
              </p>
              <p className="text-2xl font-bold mt-1">{balance !== null ? fmtCurrency(balance) : "—"}</p>
              {lastSynced && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Updated {fmtTimestamp(lastSynced)}
                </p>
              )}
            </div>
            <Landmark className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full mode — balance + transactions
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {account.institution_name} — {account.name}
                {account.mask ? ` (••${account.mask})` : ""}
              </p>
              <p className="text-3xl font-bold">{balance !== null ? fmtCurrency(balance) : "—"}</p>
              {lastSynced && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last refreshed: {fmtTimestamp(lastSynced)}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const isCredit = Number(t.amount) < 0;
                return (
                  <tr key={t.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2">{t.merchant_name || t.description || "—"}</td>
                    <td className={`px-3 py-2 text-right font-medium ${isCredit ? "text-green-600" : "text-destructive"}`}>
                      {isCredit ? "+" : "-"}{fmtCurrency(Math.abs(Number(t.amount)))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
