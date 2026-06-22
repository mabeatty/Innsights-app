import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Lock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BudgetRow, BudgetTransaction } from "@/components/budget/types";
import G702Tab, { type G702FormData } from "@/components/budget/G702Tab";
import G703Tab from "@/components/budget/G703Tab";
import TransactionsTab from "@/components/budget/TransactionsTab";
import DrawHistoryTab, { DrawRecord } from "@/components/budget/DrawHistoryTab";
import ChangeOrdersTab from "@/components/budget/ChangeOrdersTab";
import { exportBudgetPDF } from "@/components/budget/exportPDF";
import { useAIAExport } from "@/components/budget/useAIAExport";

interface Props {
  projectId: string;
  projectName: string;
  projectInfo?: any;
  budgetRows: BudgetRow[];
  transactions: BudgetTransaction[];
  materialsStored: Record<string, number>;
  periodStart: Date;
  periodEnd: Date;
  onPeriodChange: (start: Date, end: Date) => void;
  onMaterialsChange: (divNum: string, value: number) => void;
  onScheduledValueChange: (id: string, value: number) => void;
  onScheduledValueBlur: (id: string, value: number) => void;
  onTransactionsChange: (txns: BudgetTransaction[]) => void;
  onBudgetReload: () => void;
}

export default function ProjectAccountingModule({
  projectId, projectName, projectInfo,
  budgetRows, transactions, materialsStored,
  periodStart, periodEnd, onPeriodChange,
  onMaterialsChange, onScheduledValueChange, onScheduledValueBlur,
  onTransactionsChange, onBudgetReload,
}: Props) {
  const [draws, setDraws] = useState<DrawRecord[]>([]);
  const [closeDrawOpen, setCloseDrawOpen] = useState(false);
  const [drawMonth, setDrawMonth] = useState("");
  const [drawBackupUrl, setDrawBackupUrl] = useState("");
  const [drawNotes, setDrawNotes] = useState("");
  const [closingDraw, setClosingDraw] = useState(false);

  /* ── G702 Form State ── */
  const [g702Form, setG702Form] = useState<G702FormData>({
    ownerName: "",
    projectName: projectName,
    applicationNo: "1",
    periodTo: format(new Date(), "yyyy-MM-dd"),
    contractorName: "",
    architectName: "",
    contractDate: "",
    projectNumber: "",
    previousCertificates: "0",
    retainagePctWork: "10",
    retainagePctMaterials: "10",
  });

  // Keep the project name in sync with the currently selected project at ALL
  // times (used for both the export filename and the in-file G702 Project field).
  // The owner/architect/contractor fields are only filled when project_info is
  // available — previously projectName was gated behind that too, which left a
  // stale name (e.g. a prior project's) when a project had no project_info row.
  useEffect(() => {
    setG702Form(prev => ({
      ...prev,
      projectName,
      ...(projectInfo ? {
        ownerName: projectInfo.owner_name || projectInfo.entity_name || prev.ownerName,
        architectName: projectInfo.architect ?? prev.architectName,
        contractorName: projectInfo.general_contractor ?? prev.contractorName,
      } : {}),
    }));
  }, [projectInfo, projectName]);

  // Sync draws into form
  useEffect(() => {
    const appNo = String((draws?.length ?? 0) + 1);
    let prevCerts = "0";
    if (draws && draws.length > 0) {
      const sorted = [...draws].sort((a, b) => b.draw_number - a.draw_number);
      const lastDraw = sorted[0];
      if (lastDraw?.snapshot_json) {
        const snapshot = typeof lastDraw.snapshot_json === "string"
          ? JSON.parse(lastDraw.snapshot_json)
          : lastDraw.snapshot_json;
        const line6 = snapshot?.g702?.["6. Total Earned Less Retainage"];
        if (typeof line6 === "number") prevCerts = String(Math.round(line6 * 100) / 100);
      }
    }
    setG702Form(prev => ({ ...prev, applicationNo: appNo, previousCertificates: prevCerts }));
  }, [draws]);

  const handleG702FormChange = useCallback((field: keyof G702FormData, value: string) => {
    setG702Form(prev => ({ ...prev, [field]: value }));
  }, []);

  /* ── AIA Export ── */
  const { exporting, handleExportAIA } = useAIAExport(budgetRows, transactions, g702Form);

  /* ── Draw History ── */
  const loadDraws = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("draw_history")
      .select("*")
      .eq("project_id", projectId)
      .order("draw_number", { ascending: false });
    setDraws((data as DrawRecord[]) ?? []);
  }, [projectId]);

  useEffect(() => { loadDraws(); }, [loadDraws]);

  const nextDrawNumber = draws.length > 0 ? Math.max(...draws.map((d) => d.draw_number)) + 1 : 1;

  const approvedTxns = useMemo(
    () => transactions.filter((t) => t.status === "Approved" || t.status === "Paid" || t.status === "Deferred"),
    [transactions]
  );

  const handleCloseDraw = async () => {
    if (!drawMonth) {
      toast.error("Please select a month for this draw.");
      return;
    }
    const existingDraw = draws.find(d => d.draw_month.substring(0, 7) === drawMonth);
    if (existingDraw) {
      toast.error(`A draw already exists for ${drawMonth}. Only one draw per month is allowed.`);
      return;
    }
    setClosingDraw(true);
    try {
      const drawMonthDate = drawMonth + "-01";
      const snapshotRows = budgetRows.map((div) => {
        const divTxns = approvedTxns.filter((t) => t.division_number === div.division_number);
        const previous = divTxns.filter((t) => t.draw_id != null).reduce((s, t) => s + Number(t.amount), 0);
        const thisPeriod = divTxns.filter((t) => t.draw_id == null).reduce((s, t) => s + Number(t.amount), 0);
        const materials = materialsStored[div.division_number] ?? 0;
        const scheduled = Number(div.scheduled_value);
        const totalCompleted = previous + thisPeriod + materials;
        const pctComplete = scheduled > 0 ? (totalCompleted / scheduled) * 100 : 0;
        const balance = scheduled - totalCompleted;
        const retainage = divTxns.reduce((s, t) => s + Number(t.retainage_amount), 0);
        return { division_number: div.division_number, division_name: div.division_name, cost_type: div.cost_type, scheduled, previous, thisPeriod, materials, totalCompleted, pctComplete, balance, retainage };
      });

      const totalScheduled = snapshotRows.reduce((s, r) => s + r.scheduled, 0);
      const totalCompleted = snapshotRows.reduce((s, r) => s + r.totalCompleted, 0);
      const totalRetainage = snapshotRows.reduce((s, r) => s + r.retainage, 0);
      const totalThisPeriod = snapshotRows.reduce((s, r) => s + r.thisPeriod, 0);
      const retainageThisPeriod = approvedTxns.filter((t) => t.draw_id == null).reduce((s, t) => s + Number(t.retainage_amount), 0);
      const currentPaymentDue = totalThisPeriod - retainageThisPeriod;

      const g702Snapshot = {
        "1. Project Cost": totalScheduled,
        "4. Total Completed & Stored to Date": totalCompleted,
        "5. Retainage": totalRetainage,
        "6. Total Earned Less Retainage": totalCompleted - totalRetainage,
        "8. Current Payment Due": currentPaymentDue,
        "10. Percent Complete": totalScheduled > 0 ? `${((totalCompleted / totalScheduled) * 100).toFixed(1)}%` : "0%",
      };

      const { data: insertedDraw, error } = await (supabase as any).from("draw_history").insert({
        project_id: projectId, draw_number: nextDrawNumber, draw_month: drawMonthDate,
        submission_date: format(new Date(), "yyyy-MM-dd"), total_amount: currentPaymentDue,
        status: "Submitted", backup_url: drawBackupUrl || null, notes: drawNotes || null,
        snapshot_json: { budgetRows: snapshotRows, g702: g702Snapshot },
      }).select().single();

      if (error) throw error;

      if (insertedDraw) {
        // Only approved (non-Pending) transactions go on the draw; unapproved
        // invoices' lines stay current until their invoice is approved.
        await (supabase as any).from("budget_transactions").update({ draw_id: insertedDraw.id }).eq("project_id", projectId).is("draw_id", null).neq("status", "Pending");
      }

      const monthYear = drawMonth;
      const { data: existingCF } = await (supabase as any).from("capital_cash_flow").select("id").eq("project_id", projectId).eq("month_year", monthYear).maybeSingle();
      if (existingCF) {
        await (supabase as any).from("capital_cash_flow").update({ draw_amount: currentPaymentDue }).eq("id", existingCF.id);
      } else {
        await (supabase as any).from("capital_cash_flow").insert({ project_id: projectId, month_year: monthYear, projected_spend: 0, draw_amount: currentPaymentDue });
      }

      toast.success(`Draw #${nextDrawNumber} closed successfully.`);
      setCloseDrawOpen(false);
      setDrawBackupUrl("");
      setDrawNotes("");
      setDrawMonth("");
      await loadDraws();
    } catch (err: any) {
      toast.error(err.message || "Failed to close draw.");
    }
    setClosingDraw(false);
  };

  return (
    <div className="pt-2">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3">
        <Button size="sm" className="gap-1.5" onClick={() => {
          const now = new Date();
          setDrawMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
          setCloseDrawOpen(true);
        }}>
          <Lock className="h-3.5 w-3.5" /> Close Draw #{nextDrawNumber}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={exporting}
          onClick={() => handleExportAIA()}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export AIA"}
        </Button>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="g702">
        <TabsList>
          <TabsTrigger value="g702">G702</TabsTrigger>
          <TabsTrigger value="g703">G703</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="change-orders">Change Orders</TabsTrigger>
          <TabsTrigger value="draw-history">Draw History</TabsTrigger>
        </TabsList>

        <TabsContent value="g702">
          <G702Tab
            budgetRows={budgetRows}
            transactions={transactions}
            materialsStored={materialsStored}
            formData={g702Form}
            onFormChange={handleG702FormChange}
          />
        </TabsContent>

        <TabsContent value="g703">
          <G703Tab
            budgetRows={budgetRows}
            transactions={transactions}
            projectName={projectName}
            periodStart={periodStart}
            periodEnd={periodEnd}
            onPeriodChange={onPeriodChange}
            onMaterialsChange={onMaterialsChange}
            onScheduledValueChange={onScheduledValueChange}
            onScheduledValueBlur={onScheduledValueBlur}
            materialsStored={materialsStored}
          />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab projectId={projectId} onTransactionsChange={onTransactionsChange} draws={draws} onDrawsRefresh={loadDraws} />
        </TabsContent>

        <TabsContent value="change-orders">
          <ChangeOrdersTab projectId={projectId} budgetRows={budgetRows} onBudgetReload={onBudgetReload} />
        </TabsContent>

        <TabsContent value="draw-history">
          <DrawHistoryTab projectId={projectId} draws={draws} onRefresh={loadDraws} />
        </TabsContent>
      </Tabs>

      {/* Close Draw Dialog */}
      <Dialog open={closeDrawOpen} onOpenChange={setCloseDrawOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close Draw #{nextDrawNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will lock the current period and create a permanent record of the G702 and G703 values.
          </p>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Draw Month</Label>
              <Input type="month" className="h-8 text-sm w-48" value={drawMonth} onChange={(e) => setDrawMonth(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Backup Documents URL</Label>
              <Input className="h-8" placeholder="Google Drive link" value={drawBackupUrl} onChange={(e) => setDrawBackupUrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="min-h-[60px]" value={drawNotes} onChange={(e) => setDrawNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDrawOpen(false)}>Cancel</Button>
            <Button onClick={handleCloseDraw} disabled={closingDraw || !drawMonth}>
              {closingDraw ? "Closing…" : `Close Draw #${nextDrawNumber}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
