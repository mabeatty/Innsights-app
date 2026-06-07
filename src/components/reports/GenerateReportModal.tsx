import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Download, Send, Loader2, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { generateMonthlyPDF, MonthlyReportData } from "./generateMonthlyPDF";

interface GenerateReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  entityName: string;
  brandName: string;
  projectType: string;
  onGenerated: () => void;
}

export default function GenerateReportModal({
  open, onOpenChange, projectId, projectName, entityName, brandName, projectType, onGenerated,
}: GenerateReportModalProps) {
  const { user } = useAuth();
  const prevMonth = subMonths(new Date(), 1);
  const [startDate, setStartDate] = useState(format(startOfMonth(prevMonth), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(prevMonth), "yyyy-MM-dd"));
  const [downloadPDF, setDownloadPDF] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [generating, setGenerating] = useState(false);

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!recipients.includes(email)) {
      setRecipients([...recipients, email]);
    }
    setNewEmail("");
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  const handleGenerate = async () => {
    if (!downloadPDF && !sendEmail) {
      toast.error("Please select at least one delivery method.");
      return;
    }
    if (sendEmail && recipients.length === 0) {
      toast.error("Please add at least one recipient for email delivery.");
      return;
    }

    setGenerating(true);
    try {
      // Fetch content config + all data in parallel
      const { data: contentConfig } = await supabase
        .from("report_content_config")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();

      const includeSnapshot = contentConfig?.include_project_overview ?? true;
      const includeFinancial = contentConfig?.include_budget_vs_actual ?? true;
      const includeDraw = contentConfig?.include_draw_status ?? true;
      const includeCapital = contentConfig?.include_cash_planning ?? true;
      const includeActivity = contentConfig?.include_weekly_summaries ?? true;

      // Fetch all data in parallel
      const [
        { data: budgetRows },
        { data: transactions },
        { data: draws },
        { data: weeklyReports },
        { data: projectInfo },
        { data: phases },
        { data: equitySources },
        { data: debtTranches },
      ] = await Promise.all([
        supabase.from("project_budget").select("division_number, division_name, scheduled_value, cost_type").eq("project_id", projectId).order("division_number"),
        supabase.from("budget_transactions").select("division_number, amount, retainage_amount, status").eq("project_id", projectId),
        supabase.from("draw_history").select("draw_number, draw_month, total_amount, status").eq("project_id", projectId).order("draw_number"),
        supabase.from("weekly_reports").select("date_range_start, date_range_end, content").eq("project_id", projectId).gte("date_range_start", startDate).lte("date_range_end", endDate).order("date_range_start"),
        supabase.from("project_info").select("*").eq("project_id", projectId).maybeSingle(),
        supabase.from("schedule_phases").select("start_date, end_date, phase_name").eq("project_id", projectId).order("phase_number"),
        supabase.from("capital_equity_sources").select("source_name, equity_type, total_commitment, equity_called").eq("project_id", projectId).order("created_at"),
        supabase.from("capital_debt_tranches").select("lender_name, loan_type, loan_amount, interest_rate, rate_type, maturity_date").eq("project_id", projectId).order("created_at"),
      ]);

      // Compute budget lines
      const approvedTxns = (transactions ?? []).filter(
        (t) => t.status === "Approved" || t.status === "Paid" || t.status === "Deferred"
      );
      const budgetLines = (budgetRows ?? []).map((row) => {
        const divTxns = approvedTxns.filter((t) => t.division_number === row.division_number);
        const actual_spent = divTxns.reduce((s, t) => s + Number(t.amount), 0);
        const scheduled = Number(row.scheduled_value);
        return {
          division_number: row.division_number,
          division_name: row.division_name,
          cost_type: row.cost_type || "Other",
          scheduled_value: scheduled,
          actual_spent,
          variance: scheduled - actual_spent,
          pct_complete: scheduled > 0 ? (actual_spent / scheduled) * 100 : 0,
        };
      });

      // Compute cumulative draws
      let cumulative = 0;
      const drawItems = (draws ?? []).map((d) => {
        cumulative += Number(d.total_amount);
        return { draw_number: d.draw_number, draw_month: d.draw_month, total_amount: Number(d.total_amount), cumulative, status: d.status };
      });

      // Find construction start / projected completion
      const constructionPhases = (phases ?? []).filter((p) => p.phase_name === "Construction");
      const constructionStart = constructionPhases.length > 0
        ? constructionPhases.reduce((earliest: string | null, p) => {
            if (!p.start_date) return earliest;
            return !earliest || p.start_date < earliest ? p.start_date : earliest;
          }, null)
        : null;
      const projectedCompletion = constructionPhases.length > 0
        ? constructionPhases.reduce((latest: string | null, p) => {
            if (!p.end_date) return latest;
            return !latest || p.end_date > latest ? p.end_date : latest;
          }, null)
        : null;

      // AI summarization of weekly reports
      let activityBullets: string[] = [];
      let activityDateRanges: string[] = [];

      const reportsForAI = (weeklyReports ?? []).filter(r => r.content && r.content.trim());
      if (reportsForAI.length > 0) {
        try {
          const { data: aiResult, error: aiError } = await supabase.functions.invoke(
            "summarize-weekly-reports",
            { body: { weeklyReports: reportsForAI } }
          );
          if (aiError) {
            console.error("AI summarization error:", aiError);
          } else {
            activityBullets = aiResult?.bullets ?? [];
            activityDateRanges = aiResult?.dateRanges ?? [];
          }
        } catch (err) {
          console.error("Failed to call AI summarization:", err);
        }
      }

      const reportData: MonthlyReportData = {
        project: {
          projectName,
          entityName: projectInfo?.entity_name || entityName || "",
          brandName: brandName || "",
          status: projectInfo?.project_status || "Active",
          projectType: projectInfo?.project_type || projectType,
        },
        periodStart: startDate,
        periodEnd: endDate,
        budgetLines: includeFinancial ? budgetLines : [],
        draws: includeDraw ? drawItems : [],
        constructionStart: includeSnapshot ? constructionStart : null,
        projectedCompletion: includeSnapshot ? projectedCompletion : null,
        includeProjectSnapshot: includeSnapshot,
        equitySources: includeCapital ? (equitySources ?? []).map(e => ({
          source_name: e.source_name,
          equity_type: e.equity_type,
          total_commitment: Number(e.total_commitment),
          equity_called: Number(e.equity_called),
        })) : [],
        debtTranches: includeCapital ? (debtTranches ?? []).map(d => ({
          lender_name: d.lender_name,
          loan_type: d.loan_type,
          loan_amount: Number(d.loan_amount),
          interest_rate: Number(d.interest_rate),
          rate_type: d.rate_type,
          maturity_date: d.maturity_date,
        })) : [],
        activityBullets: includeActivity ? activityBullets : [],
        activityDateRanges: includeActivity ? activityDateRanges : [],
      };

      const doc = generateMonthlyPDF(reportData);
      const pdfBlob = doc.output("blob");

      // Upload to storage
      const fileName = `${projectId}/${format(new Date(), "yyyy-MM-dd_HHmmss")}_monthly_report.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("generated-reports")
        .upload(fileName, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
      }

      // Log to generated_reports
      await supabase.from("generated_reports").insert({
        project_id: projectId,
        generated_by: user!.id,
        report_period_start: startDate,
        report_period_end: endDate,
        delivery_method: downloadPDF && sendEmail ? "both" : downloadPDF ? "download" : "email",
        recipients: sendEmail ? recipients : [],
        storage_path: fileName,
      });

      // Download
      if (downloadPDF) {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${projectName.replace(/\s+/g, "_")}_Monthly_Report_${format(new Date(startDate), "MMM_yyyy")}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }

      if (sendEmail) {
        toast.info("Email delivery will be available once email infrastructure is configured.");
      }

      toast.success("Report generated successfully!");
      onGenerated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Monthly Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Delivery Method</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={downloadPDF} onCheckedChange={(v) => setDownloadPDF(!!v)} />
                <Download className="h-3.5 w-3.5" /> Download PDF
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
                <Send className="h-3.5 w-3.5" /> Send via Email
              </label>
            </div>
          </div>

          {sendEmail && (
            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add email address..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                />
                <Button variant="outline" size="sm" onClick={addEmail}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {recipients.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button onClick={() => removeRecipient(email)} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Generating...</> : "Generate Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
