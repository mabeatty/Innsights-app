import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Eye, Send, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PastReport {
  id: string;
  month_year: string;
  user_id: string;
  status: string;
  total_amount: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

interface ReportTransaction {
  id: string;
  merchant_name: string;
  amount: number;
  date: string;
  assignment_type: string | null;
  budget_line_division: string | null;
  chart_of_accounts_id: string | null;
  description: string;
  receipt_url: string | null;
  project_id: string | null;
}

interface Comment {
  id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
}

const fmtCur = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PastReports({ onReportChanged }: { onReportChanged?: () => void } = {}) {
  const { user, organizationId } = useAuth();
  const [reports, setReports] = useState<PastReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewReport, setViewReport] = useState<PastReport | null>(null);
  const [viewTxns, setViewTxns] = useState<ReportTransaction[]>([]);
  const [viewComments, setViewComments] = useState<Comment[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [expenseRole, setExpenseRole] = useState("Employee");
  const [directReportUserIds, setDirectReportUserIds] = useState<string[]>([]);
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});
  const [chartAccountNames, setChartAccountNames] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetReport, setDeleteTargetReport] = useState<PastReport | null>(null);

  // Get role and direct report IDs
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

      if ((role === "Manager" || role === "Partner" || role === "admin") && member) {
        const { data: reports } = await supabase
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", organizationId);
        const ids = (reports ?? []).map((r) => r.user_id).filter(Boolean) as string[];
        setDirectReportUserIds(ids);
      }

      // Load chart account names
      const { data: accts } = await (supabase as any)
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("org_id", organizationId);
      const acctMap: Record<string, string> = {};
      (accts ?? []).forEach((a: any) => { acctMap[a.id] = a.account_name; });
      setChartAccountNames(acctMap);

      // Load project names
      const { data: projs } = await supabase.from("projects").select("id, name");
      const projMap: Record<string, string> = {};
      (projs ?? []).forEach((p: any) => { projMap[p.id] = p.name; });
      setProjectNames(projMap);
    })();
  }, [user, organizationId]);

  const load = useCallback(async () => {
    if (!user || !organizationId) return;

    const isAdmin = expenseRole === "Partner" || expenseRole === "admin";

    let query = (supabase as any)
      .from("expense_reports")
      .select("*")
      .eq("org_id", organizationId)
      .in("status", ["Submitted", "Approved", "Rejected", "Under Review"])
      .order("month_year", { ascending: false });

    if (!isAdmin && expenseRole !== "Manager") {
      query = query.eq("user_id", user.id);
    } else if (expenseRole === "Manager") {
      query = query.or(`user_id.eq.${user.id},user_id.in.(${directReportUserIds.join(",")})`);
    }

    const { data } = await query;
    setReports(data ?? []);

    const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
    if (userIds.length > 0) {
      try {
        const { data: emailData } = await supabase.functions.invoke("get-team-emails", {
          body: { userIds },
        });
        setEmailMap(emailData?.emails ?? {});
      } catch {}
    }

    setLoading(false);
  }, [user, organizationId, expenseRole, directReportUserIds]);

  useEffect(() => { load(); }, [load]);

  const getCategoryDisplay = (t: ReportTransaction) => {
    if (t.assignment_type === "company" && t.chart_of_accounts_id) {
      return chartAccountNames[t.chart_of_accounts_id] || "—";
    }
    if (t.assignment_type === "project") {
      const projName = t.project_id ? projectNames[t.project_id] : "";
      const divLabel = t.budget_line_division || "";
      return [projName, divLabel].filter(Boolean).join(" / ") || "—";
    }
    return "—";
  };

  const openView = async (rpt: PastReport) => {
    setViewReport(rpt);
    setEditMode(false);
    const [txnRes, cmtRes] = await Promise.all([
      (supabase as any).from("plaid_transactions").select("*").eq("expense_report_id", rpt.id).order("date"),
      (supabase as any).from("expense_report_comments").select("*").eq("expense_report_id", rpt.id).order("created_at"),
    ]);
    setViewTxns(txnRes.data ?? []);
    setViewComments(cmtRes.data ?? []);
  };

  // Get or create current month's report
  const getOrCreateCurrentReport = async (): Promise<string | null> => {
    if (!user || !organizationId) return null;
    const currentMonthYear = format(new Date(), "yyyy-MM");
    const { data: existing } = await (supabase as any)
      .from("expense_reports")
      .select("id")
      .eq("user_id", user.id)
      .eq("month_year", currentMonthYear)
      .limit(1);

    if (existing && existing.length > 0) return existing[0].id;

    const { data: newRpt } = await (supabase as any)
      .from("expense_reports")
      .insert({
        org_id: organizationId,
        user_id: user.id,
        month_year: currentMonthYear,
        status: "Draft",
        total_amount: 0,
      })
      .select("id")
      .single();
    return newRpt?.id || null;
  };

  // Remove a single txn from a past report → move to current report
  const handleRemoveTxnFromPastReport = async (txId: string) => {
    const currentReportId = await getOrCreateCurrentReport();
    if (!currentReportId) { toast.error("Could not find current report."); return; }

    await (supabase as any)
      .from("plaid_transactions")
      .update({ expense_report_id: currentReportId, status: "categorized" })
      .eq("id", txId);

    // Update view state
    setViewTxns((prev) => prev.filter((t) => t.id !== txId));

    // Update the past report total
    if (viewReport) {
      const removedTx = viewTxns.find((t) => t.id === txId);
      const newTotal = viewReport.total_amount - Number(removedTx?.amount || 0);
      await (supabase as any).from("expense_reports").update({ total_amount: newTotal }).eq("id", viewReport.id);
      setViewReport({ ...viewReport, total_amount: newTotal });
    }

    toast.success("Transaction moved to current report.");
    onReportChanged?.();
  };

  // Delete entire report → move all txns to current report
  const handleDeleteReport = async (rpt: PastReport) => {
    const currentReportId = await getOrCreateCurrentReport();
    if (!currentReportId) { toast.error("Could not find current report."); return; }

    // Move all transactions to current report
    await (supabase as any)
      .from("plaid_transactions")
      .update({ expense_report_id: currentReportId, status: "categorized" })
      .eq("expense_report_id", rpt.id);

    // Delete comments
    await (supabase as any)
      .from("expense_report_comments")
      .delete()
      .eq("expense_report_id", rpt.id);

    // Delete the report
    await (supabase as any)
      .from("expense_reports")
      .delete()
      .eq("id", rpt.id);

    toast.success("Report deleted. All transactions moved to current report.");
    setViewReport(null);
    setDeleteConfirmOpen(false);
    setDeleteTargetReport(null);
    load();
    onReportChanged?.();
  };

  const handleApprove = async () => {
    if (!viewReport || !user) return;
    await (supabase as any).from("expense_reports")
      .update({ status: "Approved", approved_at: new Date().toISOString(), approved_by: user.id })
      .eq("id", viewReport.id);

    await (supabase as any).from("expense_report_comments").insert({
      expense_report_id: viewReport.id,
      user_id: user.id,
      comment_text: `Approved by ${user.email} on ${format(new Date(), "MMM d, yyyy")}`,
    });

    toast.success("Report approved.");
    setViewReport(null);
    load();
  };

  const handleRequestChanges = async () => {
    if (!viewReport || !user) return;
    const comment = prompt("Enter your feedback:");
    if (!comment) return;

    await (supabase as any).from("expense_reports")
      .update({ status: "Under Review" })
      .eq("id", viewReport.id);

    await (supabase as any).from("expense_report_comments").insert({
      expense_report_id: viewReport.id,
      user_id: user.id,
      comment_text: comment,
    });

    toast.success("Changes requested.");
    setViewReport(null);
    load();
  };

  const generatePDF = (): jsPDF | null => {
    if (!viewReport) return null;
    const doc = new jsPDF();
    const employeeName = emailMap[viewReport.user_id] || viewReport.user_id.slice(0, 8);

    doc.setFontSize(18);
    doc.text("Expense Report", 14, 20);
    doc.setFontSize(11);
    doc.text(`Employee: ${employeeName}`, 14, 30);
    doc.text(`Period: ${viewReport.month_year}`, 14, 37);
    doc.text(`Status: ${viewReport.status}`, 14, 44);
    if (viewReport.approved_at) {
      const approverName = viewReport.approved_by ? (emailMap[viewReport.approved_by] || viewReport.approved_by.slice(0, 8)) : "—";
      doc.text(`Approved by: ${approverName} on ${new Date(viewReport.approved_at).toLocaleDateString()}`, 14, 51);
    }

    // Group by category for subtotals
    const categoryTotals: Record<string, number> = {};
    const rows = viewTxns.map((t) => {
      const cat = getCategoryDisplay(t);
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(t.amount);
      return [t.date, t.merchant_name, cat, t.description || "—", fmtCur(Number(t.amount))];
    });

    autoTable(doc, {
      startY: viewReport.approved_at ? 57 : 50,
      head: [["Date", "Merchant", "Category", "Description", "Amount"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [60, 60, 60] },
      styles: { fontSize: 9 },
    });

    let y = (doc as any).lastAutoTable?.finalY + 10 || 120;

    // Category subtotals
    doc.setFontSize(10);
    doc.text("Category Subtotals:", 14, y);
    y += 6;
    Object.entries(categoryTotals).forEach(([cat, total]) => {
      doc.text(`  ${cat}: ${fmtCur(total)}`, 14, y);
      y += 5;
    });

    y += 4;
    doc.setFontSize(12);
    doc.text(`Grand Total: ${fmtCur(Number(viewReport.total_amount))}`, 14, y);

    // Comments
    if (viewComments.length > 0) {
      y += 10;
      doc.setFontSize(10);
      doc.text("Comments:", 14, y);
      y += 6;
      doc.setFontSize(9);
      viewComments.forEach((c) => {
        const who = c.user_id === user?.id ? "You" : (emailMap[c.user_id] || c.user_id.slice(0, 8));
        const when = format(new Date(c.created_at), "MMM d, h:mm a");
        const line = `${who} (${when}): ${c.comment_text}`;
        const lines = doc.splitTextToSize(line, 180);
        if (y + lines.length * 4 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, 14, y);
        y += lines.length * 4 + 2;
      });
    }

    return doc;
  };

  const handleDownloadPDF = () => {
    const doc = generatePDF();
    if (doc && viewReport) {
      doc.save(`Expense_Report_${viewReport.month_year}_${emailMap[viewReport.user_id] || "report"}.pdf`);
      toast.success("PDF downloaded.");
    }
  };

  const handleSendEmail = async () => {
    if (!sendEmail || !viewReport) return;
    const doc = generatePDF();
    if (!doc) return;

    const pdfBase64 = doc.output("datauristring").split(",")[1];

    try {
      await supabase.functions.invoke("send-document-email", {
        body: {
          to: [sendEmail],
          subject: `Expense Report — ${viewReport.month_year}`,
          message: sendMessage || `Please find the attached expense report for ${viewReport.month_year}.`,
          attachments: [{
            filename: `Expense_Report_${viewReport.month_year}.pdf`,
            content: pdfBase64,
          }],
        },
      });
      toast.success(`Report sent to ${sendEmail}`);
    } catch {
      toast.error("Failed to send email.");
    }

    setSendOpen(false);
    setSendEmail("");
    setSendMessage("");
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      Submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      Approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      Rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      "Under Review": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    return map[s] || "bg-muted text-muted-foreground";
  };

  const canApprove = viewReport && viewReport.user_id !== user?.id &&
    (viewReport.status === "Submitted" || viewReport.status === "Under Review");

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div className="space-y-4 pt-2">
      {reports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No past reports found.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-left">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Approved</th>
                <th className="px-3 py-2 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-medium">{r.month_year}</td>
                  <td className="px-3 py-2 text-sm">{emailMap[r.user_id] || r.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right">{fmtCur(Number(r.total_amount))}</td>
                  <td className="px-3 py-2">
                    <Badge className={cn("text-xs", statusColor(r.status))}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.approved_at ? new Date(r.approved_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openView(r)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { openView(r); setTimeout(() => setEditMode(true), 100); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteTargetReport(r); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Report Modal */}
      <Dialog open={!!viewReport} onOpenChange={() => setViewReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewReport?.month_year} Expense Report</DialogTitle>
          </DialogHeader>
          {viewReport && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm flex-wrap">
                <div><span className="text-muted-foreground">Employee:</span> <span className="ml-1">{emailMap[viewReport.user_id] || viewReport.user_id.slice(0, 8)}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={cn("text-xs ml-1", statusColor(viewReport.status))}>{viewReport.status}</Badge></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-medium ml-1">{fmtCur(Number(viewReport.total_amount))}</span></div>
              </div>

              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-left">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Merchant</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Category / Budget Line</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      {editMode && <th className="px-3 py-2 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {viewTxns.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="px-3 py-2 text-xs">{t.date}</td>
                        <td className="px-3 py-2">{t.merchant_name}</td>
                        <td className="px-3 py-2 text-xs capitalize">{t.assignment_type || "—"}</td>
                        <td className="px-3 py-2 text-xs">{getCategoryDisplay(t)}</td>
                        <td className="px-3 py-2 text-xs">{t.description || "—"}</td>
                        <td className="px-3 py-2 text-right">{fmtCur(Number(t.amount))}</td>
                        {editMode && (
                          <td className="px-3 py-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveTxnFromPastReport(t.id)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/50 font-semibold">
                      <td className="px-3 py-2" colSpan={editMode ? 5 : 5}>Total</td>
                      <td className="px-3 py-2 text-right">{fmtCur(viewTxns.reduce((s, t) => s + Number(t.amount), 0))}</td>
                      {editMode && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Comments */}
              {viewComments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> Comments
                  </h4>
                  {viewComments.map((c) => (
                    <div key={c.id} className="rounded-md border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <span className="font-medium">{c.user_id === user?.id ? "You" : (emailMap[c.user_id] || c.user_id.slice(0, 8))}</span>
                        <span>·</span>
                        <span>{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                      </div>
                      <p className="text-sm">{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2">
                {canApprove && (
                  <>
                    <Button variant="outline" onClick={handleRequestChanges}>Request Changes</Button>
                    <Button onClick={handleApprove}>Approve</Button>
                  </>
                )}
                <Button variant="outline" className="gap-1.5" onClick={() => setEditMode((m) => !m)}>
                  <Pencil className="h-3.5 w-3.5" /> {editMode ? "Done Editing" : "Edit"}
                </Button>
                <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => { setDeleteTargetReport(viewReport); setDeleteConfirmOpen(true); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Report
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={handleDownloadPDF}>
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={() => setSendOpen(true)}>
                  <Send className="h-3.5 w-3.5" /> Send via Email
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Send Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">To *</Label>
              <Input className="h-8" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="recipient@example.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Message (optional)</Label>
              <Input className="h-8" value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} placeholder="Optional note…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={!sendEmail}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Report Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the {deleteTargetReport?.month_year} expense report. All transactions will be moved to your current expense report — no data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTargetReport(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetReport && handleDeleteReport(deleteTargetReport)}>
              Delete Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
