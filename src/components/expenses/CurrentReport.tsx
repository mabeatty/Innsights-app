import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import CategorizationModal from "./CategorizationModal";
import type { PlaidTransaction } from "./ExpenseInbox";

const fmtCur = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface ExpenseReport {
  id: string;
  month_year: string;
  status: string;
  total_amount: number;
}

interface Comment {
  id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
}

interface CurrentReportProps {
  refreshKey?: number;
}

export default function CurrentReport({ refreshKey }: CurrentReportProps = {}) {
  const { user, organizationId } = useAuth();
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [editTx, setEditTx] = useState<PlaidTransaction | null>(null);
  const [supervisorName, setSupervisorName] = useState<string>("");
  const [chartAccountNames, setChartAccountNames] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});

  const currentMonthYear = format(new Date(), "yyyy-MM");

  const load = useCallback(async () => {
    if (!user || !organizationId) return;

    // Find or create current month's report
    let { data: reports } = await (supabase as any)
      .from("expense_reports")
      .select("*")
      .eq("user_id", user.id)
      .eq("month_year", currentMonthYear)
      .limit(1);

    let rpt = reports?.[0];
    if (!rpt) {
      const { data: newRpt } = await (supabase as any)
        .from("expense_reports")
        .insert({
          org_id: organizationId,
          user_id: user.id,
          month_year: currentMonthYear,
          status: "Draft",
          total_amount: 0,
        })
        .select()
        .single();
      rpt = newRpt;
    }
    setReport(rpt);

    if (rpt) {
      // Get transactions for this report
      const { data: finalTxns } = await (supabase as any)
        .from("plaid_transactions")
        .select("*")
        .eq("expense_report_id", rpt.id)
        .order("date", { ascending: false });

      setTransactions(finalTxns ?? []);

      // Update total
      const total = (finalTxns ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      if (Math.abs(total - rpt.total_amount) > 0.01) {
        await (supabase as any).from("expense_reports").update({ total_amount: total }).eq("id", rpt.id);
        setReport({ ...rpt, total_amount: total });
      }

      // Load comments
      const { data: cmts } = await (supabase as any)
        .from("expense_report_comments")
        .select("*")
        .eq("expense_report_id", rpt.id)
        .order("created_at");
      setComments(cmts ?? []);

      // Load chart account names for display
      const { data: accts } = await (supabase as any)
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("org_id", organizationId);
      const acctMap: Record<string, string> = {};
      (accts ?? []).forEach((a: any) => { acctMap[a.id] = `${a.account_code} — ${a.account_name}`; });
      setChartAccountNames(acctMap);

      // Load project names
      const { data: projs } = await supabase.from("projects").select("id, name");
      const projMap: Record<string, string> = {};
      (projs ?? []).forEach((p: any) => { projMap[p.id] = p.name; });
      setProjectNames(projMap);
    }

    // Get supervisor name
    const { data: member } = await supabase
      .from("organization_members")
      .select("supervisor_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .limit(1)
      .single();

    if (member?.supervisor_id) {
      const { data: supMember } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("id", member.supervisor_id)
        .single();
      if (supMember?.user_id) {
        try {
          const { data: emailData } = await supabase.functions.invoke("get-team-emails", {
            body: { userIds: [supMember.user_id] },
          });
          setSupervisorName(emailData?.emails?.[supMember.user_id] || "your supervisor");
        } catch { setSupervisorName("your supervisor"); }
      }
    }

    setLoading(false);
  }, [user, organizationId, currentMonthYear]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when refreshKey changes (e.g. after Inbox categorization)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      load();
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveFromReport = async (txId: string) => {
    await (supabase as any)
      .from("plaid_transactions")
      .update({ expense_report_id: null, status: "unassigned", assignment_type: null, chart_of_accounts_id: null, project_id: null, budget_line_division: null })
      .eq("id", txId);
    toast.success("Removed from report.");
    load();
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !report || !user) return;
    const { error } = await (supabase as any).from("expense_report_comments").insert({
      expense_report_id: report.id,
      user_id: user.id,
      comment_text: newComment.trim(),
    });
    if (error) toast.error("Failed to add comment.");
    else { setNewComment(""); load(); }
  };

  const handleSubmit = async () => {
    if (!report) return;
    await (supabase as any)
      .from("expense_reports")
      .update({ status: "Submitted", submitted_at: new Date().toISOString() })
      .eq("id", report.id);

    await (supabase as any)
      .from("plaid_transactions")
      .update({ status: "posted" })
      .eq("expense_report_id", report.id);

    // Add system comment
    if (user) {
      await (supabase as any).from("expense_report_comments").insert({
        expense_report_id: report.id,
        user_id: user.id,
        comment_text: `Report submitted for approval on ${format(new Date(), "MMM d, yyyy")}`,
      });
    }

    // Push to QuickBooks if connected
    try {
      const { data: qbConn } = await (supabase as any)
        .from("quickbooks_connections")
        .select("id")
        .eq("org_id", organizationId)
        .limit(1);
      if (qbConn && qbConn.length > 0) {
        const { data: pushResult, error: pushErr } = await supabase.functions.invoke("quickbooks-push-expense", {
          body: { report_id: report.id },
        });
        if (pushErr) {
          console.error("QB push error:", pushErr);
          toast.info("Report submitted. QuickBooks sync failed — you can retry later.");
        } else {
          toast.success(`Pushed ${pushResult?.pushed || 0} expenses to QuickBooks.`);
        }
      }
    } catch (e) {
      console.error("QB push check error:", e);
    }

    toast.success("Report submitted for approval.");
    setSubmitOpen(false);
    load();
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      Draft: "bg-muted text-muted-foreground",
      Submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      "Under Review": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      Approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      Rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
    return map[s] || "bg-muted text-muted-foreground";
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  const companyTxns = transactions.filter((t) => t.assignment_type === "company");
  const projectTxns = transactions.filter((t) => t.assignment_type === "project");
  const grandTotal = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const isDraft = report?.status === "Draft";

  // Group project txns by project
  const projectGroups: Record<string, PlaidTransaction[]> = {};
  projectTxns.forEach((t) => {
    const key = t.project_id || "unknown";
    if (!projectGroups[key]) projectGroups[key] = [];
    projectGroups[key].push(t);
  });

  const TxRow = ({ t }: { t: PlaidTransaction }) => (
    <tr key={t.id} className="border-t hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2 text-xs">{t.date}</td>
      <td className="px-3 py-2 font-medium">{t.merchant_name}</td>
      <td className="px-3 py-2 text-xs capitalize">{t.assignment_type || "—"}</td>
      <td className="px-3 py-2 text-xs">
        {t.assignment_type === "company"
          ? (t.chart_of_accounts_id ? chartAccountNames[t.chart_of_accounts_id] || "—" : "—")
          : (t.budget_line_division || "—")}
      </td>
      <td className="px-3 py-2 text-xs max-w-[150px] truncate">{t.description || "—"}</td>
      <td className="px-3 py-2">
        {t.receipt_url && <a href={t.receipt_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></a>}
      </td>
      <td className="px-3 py-2 text-right">{fmtCur(Number(t.amount))}</td>
      {isDraft && (
        <td className="px-3 py-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTx(t)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveFromReport(t.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      )}
    </tr>
  );

  return (
    <div className="space-y-6 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-foreground">
            {format(new Date(), "MMMM yyyy")} Expense Report
          </h2>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={cn("text-xs", statusColor(report?.status ?? "Draft"))}>
            {report?.status ?? "Draft"}
          </Badge>
          {isDraft && transactions.length > 0 && (
            <Button size="sm" className="gap-1.5" onClick={() => setSubmitOpen(true)}>
              <Send className="h-3.5 w-3.5" /> Finalize Report
            </Button>
          )}
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No categorized expenses for this month yet.</p>
          <p className="text-xs mt-1">Categorize transactions in the Inbox tab to add them here.</p>
        </div>
      ) : (
        <>
          {/* Company Expenses */}
          {companyTxns.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Company Expenses</h3>
              <div className="rounded-lg border overflow-auto bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-left">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Merchant</th>
                      <th className="px-3 py-2">Assignment</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 w-8">Rcpt</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      {isDraft && <th className="px-3 py-2 w-20"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {companyTxns.map((t) => <TxRow key={t.id} t={t} />)}
                    <tr className="border-t bg-muted/50 font-semibold">
                      <td className="px-3 py-2" colSpan={6}>Subtotal</td>
                      <td className="px-3 py-2 text-right">{fmtCur(companyTxns.reduce((s, t) => s + Number(t.amount), 0))}</td>
                      {isDraft && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Project Expenses grouped by project */}
          {Object.entries(projectGroups).map(([projId, txns]) => (
            <div key={projId} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Project: {projectNames[projId] || "Unknown Project"}
              </h3>
              <div className="rounded-lg border overflow-auto bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-left">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Merchant</th>
                      <th className="px-3 py-2">Assignment</th>
                      <th className="px-3 py-2">Budget Line</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 w-8">Rcpt</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      {isDraft && <th className="px-3 py-2 w-20"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t) => <TxRow key={t.id} t={t} />)}
                    <tr className="border-t bg-muted/50 font-semibold">
                      <td className="px-3 py-2" colSpan={6}>Subtotal</td>
                      <td className="px-3 py-2 text-right">{fmtCur(txns.reduce((s, t) => s + Number(t.amount), 0))}</td>
                      {isDraft && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Grand Total */}
          <div className="flex justify-end">
            <div className="rounded-lg border bg-card px-6 py-3">
              <span className="text-sm text-muted-foreground mr-4">Grand Total</span>
              <span className="text-lg font-semibold">{fmtCur(grandTotal)}</span>
            </div>
          </div>
        </>
      )}

      {/* Comments */}
      {report && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Comments</h3>
          {comments.length > 0 && (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="rounded-md border bg-card p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium">{c.user_id === user?.id ? "You" : c.user_id.slice(0, 8)}</span>
                    <span>·</span>
                    <span>{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                  </div>
                  <p className="text-sm">{c.comment_text}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              className="h-8 flex-1"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
            />
            <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()}>Send</Button>
          </div>
        </div>
      )}

      {/* Submit confirmation */}
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Expense Report</AlertDialogTitle>
            <AlertDialogDescription>
              Submit {format(new Date(), "MMMM yyyy")} expense report ({fmtCur(grandTotal)}) for review?
              {supervisorName
                ? ` This will send the report to ${supervisorName} for approval.`
                : " This will submit the report for approval."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Submit Report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit modal */}
      {editTx && (
        <CategorizationModal
          transaction={editTx}
          open={!!editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load(); }}
        />
      )}
    </div>
  );
}
