import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import type { PlaidTransaction } from "./ExpenseInbox";
import { ALL_DIVISIONS } from "@/components/budget/types";

interface Props {
  transaction: PlaidTransaction;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface ChartAccount { id: string; account_code: string; account_name: string; }
interface Project { id: string; name: string; }
interface BudgetDivision { division_number: string; division_name: string; }

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function CategorizationModal({ transaction, open, onClose, onSaved }: Props) {
  const { user, organizationId } = useAuth();
  const [assignmentType, setAssignmentType] = useState<string>(transaction.assignment_type || "");
  const [chartAccountId, setChartAccountId] = useState<string>(transaction.chart_of_accounts_id || "");
  const [projectId, setProjectId] = useState<string>(transaction.project_id || "");
  const [budgetLine, setBudgetLine] = useState<string>(transaction.budget_line_division || "");
  const [description, setDescription] = useState(transaction.description || "");
  const [receiptUrl, setReceiptUrl] = useState(transaction.receipt_url || "");
  const [merchantName, setMerchantName] = useState(transaction.merchant_name || "");
  const [saving, setSaving] = useState(false);

  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDivisions, setProjectDivisions] = useState<BudgetDivision[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    (supabase as any).from("chart_of_accounts").select("id, account_code, account_name")
      .eq("org_id", organizationId).order("account_code")
      .then(({ data }: any) => setChartAccounts(data ?? []));

    supabase.from("projects").select("id, name").order("name")
      .then(({ data }) => setProjects(data ?? []));
  }, [organizationId]);

  useEffect(() => {
    if (!projectId) { setProjectDivisions([]); return; }
    supabase.from("project_budget")
      .select("division_number, division_name")
      .eq("project_id", projectId)
      .order("division_number")
      .then(({ data }) => setProjectDivisions(data ?? []));
  }, [projectId]);

  const getOrCreateReport = async (): Promise<string | null> => {
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

    return newRpt?.id ?? null;
  };

  const handleSave = async () => {
    if (!assignmentType) { toast.error("Please select an assignment."); return; }
    if (assignmentType === "company" && !chartAccountId) { toast.error("Please select a category."); return; }
    if (assignmentType === "project" && (!projectId || !budgetLine)) { toast.error("Please select a project and budget line."); return; }

    setSaving(true);

    // Get or create current month's expense report
    const reportId = await getOrCreateReport();

    const updateData: any = {
      assignment_type: assignmentType,
      merchant_name: merchantName,
      description,
      receipt_url: receiptUrl || null,
      status: "categorized",
      expense_report_id: reportId,
      chart_of_accounts_id: assignmentType === "company" ? chartAccountId : null,
      project_id: assignmentType === "project" ? projectId : null,
      budget_line_division: assignmentType === "project" ? budgetLine : null,
    };

    const { error } = await (supabase as any)
      .from("plaid_transactions")
      .update(updateData)
      .eq("id", transaction.id);

    if (error) {
      toast.error("Failed to save.");
      setSaving(false);
      return;
    }

    // If project expense, also create a budget_transaction entry
    if (assignmentType === "project" && projectId && budgetLine) {
      const div = ALL_DIVISIONS.find((d) => d.number === budgetLine) ||
        projectDivisions.find((d) => d.division_number === budgetLine);

      const { count } = await supabase
        .from("budget_transactions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      await supabase.from("budget_transactions").insert({
        project_id: projectId,
        transaction_type: "Expense Report",
        transaction_number: (count ?? 0) + 1,
        date: transaction.date,
        payee: merchantName,
        division_number: budgetLine,
        division_name: (div as any)?.name || (div as any)?.division_name || budgetLine,
        description: description || `Expense: ${merchantName}`,
        amount: Number(transaction.amount),
        retainage_percent: 0,
        retainage_amount: 0,
        net_amount: Number(transaction.amount),
        status: "Pending",
        notes: `From Expense Report - ${transaction.date}`,
      });
    }

    // Update report total
    if (reportId) {
      const { data: reportTxns } = await (supabase as any)
        .from("plaid_transactions")
        .select("amount")
        .eq("expense_report_id", reportId);
      const total = (reportTxns ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      await (supabase as any).from("expense_reports").update({ total_amount: total }).eq("id", reportId);
    }

    toast.success("Transaction categorized.");
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Categorize Transaction</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <p className="text-sm py-1.5 px-3 rounded-md bg-muted">{transaction.date}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount</Label>
              <p className="text-sm py-1.5 px-3 rounded-md bg-muted font-medium">{fmt(Number(transaction.amount))}</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Merchant</Label>
            <Input className="h-8" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Account</Label>
            <p className="text-sm py-1.5 px-3 rounded-md bg-muted">…{transaction.account_id?.slice(-4) ?? "—"}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Assignment *</Label>
            <Select value={assignmentType} onValueChange={(v) => { setAssignmentType(v); setChartAccountId(""); setProjectId(""); setBudgetLine(""); }}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select assignment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {assignmentType === "company" && (
            <div className="space-y-1">
              <Label className="text-xs">Chart of Accounts Category *</Label>
              <Select value={chartAccountId} onValueChange={setChartAccountId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {chartAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chartAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">No chart of accounts found. Load defaults in Settings.</p>
              )}
            </div>
          )}

          {assignmentType === "project" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Select Project *</Label>
                <Select value={projectId} onValueChange={(v) => { setProjectId(v); setBudgetLine(""); }}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {projectId && (
                <div className="space-y-1">
                  <Label className="text-xs">Budget Line (G703 Division) *</Label>
                  <Select value={budgetLine} onValueChange={setBudgetLine}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select budget line" /></SelectTrigger>
                    <SelectContent>
                      {projectDivisions.length > 0 ? (
                        projectDivisions.map((d) => (
                          <SelectItem key={d.division_number} value={d.division_number}>
                            {d.division_number} — {d.division_name}
                          </SelectItem>
                        ))
                      ) : (
                        ALL_DIVISIONS.map((d) => (
                          <SelectItem key={d.number} value={d.number}>
                            {d.number} — {d.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea className="min-h-[50px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Receipt (Google Drive URL)</Label>
            <Input className="h-8" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://drive.google.com/..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
