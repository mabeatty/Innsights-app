import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BudgetRow, BudgetTransaction, fmtDecimal } from "./types";

/* ── Stable sub-components defined OUTSIDE the main component ── */

const EditableField = React.memo(({ label, value, type = "text", className = "", onChange }: {
  label: string; value: string; type?: string; className?: string;
  onChange: (value: string) => void;
}) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
    <Input
      type={type}
      className={`h-8 text-sm border-primary/20 bg-background focus:border-primary ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
));
EditableField.displayName = "EditableField";

const ReadOnlyField = React.memo(({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
    <div className="h-8 flex items-center px-3 text-sm bg-muted/50 rounded-md border border-transparent">
      {value}
    </div>
  </div>
));
ReadOnlyField.displayName = "ReadOnlyField";

const SummaryLine = React.memo(({ number, label, value, bold, indent }: {
  number: string; label: string; value: string; bold?: boolean; indent?: boolean;
}) => (
  <div className={`flex items-center justify-between py-2.5 border-b border-border/50 ${indent ? "pl-6" : ""}`}>
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted-foreground w-6">{number}</span>
      <span className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
    <span className={`text-sm tabular-nums ${bold ? "font-bold text-foreground" : "font-medium text-foreground"}`}>{value}</span>
  </div>
));
SummaryLine.displayName = "SummaryLine";

export interface G702FormData {
  ownerName: string;
  projectName: string;
  applicationNo: string;
  periodTo: string;
  contractorName: string;
  architectName: string;
  contractDate: string;
  projectNumber: string;
  previousCertificates: string;
  retainagePctWork: string;
  retainagePctMaterials: string;
}

interface Props {
  budgetRows: BudgetRow[];
  transactions: BudgetTransaction[];
  materialsStored: Record<string, number>;
  formData: G702FormData;
  onFormChange: (field: keyof G702FormData, value: string) => void;
}

const APPROVED_STATUSES = new Set(["Approved", "Paid", "Deferred"]);

export default function G702Tab({ budgetRows, transactions, materialsStored, formData, onFormChange }: Props) {
  const approvedTxns = useMemo(
    () => transactions.filter((t) => APPROVED_STATUSES.has(t.status)),
    [transactions]
  );

  const changeOrders = useMemo(
    () => transactions.filter((t) => t.transaction_type === "Change Order"),
    [transactions]
  );

  // ── Calculations ──
  const originalContractSum = budgetRows.reduce((s, r) => s + Number(r.scheduled_value), 0);
  const netChangeOrders = changeOrders
    .filter((t) => t.status === "Approved" || t.status === "Paid")
    .reduce((s, t) => s + Number(t.amount), 0);
  const contractSumToDate = originalContractSum + netChangeOrders;

  const totalMaterials = Object.values(materialsStored).reduce((s, v) => s + v, 0);

  // Work completed from prior draws
  const totalPreviousWork = approvedTxns
    .filter((t) => t.draw_id != null)
    .reduce((s, t) => s + Number(t.amount), 0);

  // Work completed this period (unassigned)
  const totalThisPeriod = approvedTxns
    .filter((t) => t.draw_id == null)
    .reduce((s, t) => s + Number(t.amount), 0);

  const totalCompletedStored = totalPreviousWork + totalThisPeriod + totalMaterials;

  const prevCertificates = Number(formData.previousCertificates) || 0;
  const currentPaymentDue = totalCompletedStored - prevCertificates;
  const balanceToFinish = contractSumToDate - totalCompletedStored;
  const pctComplete = contractSumToDate > 0 ? (totalCompletedStored / contractSumToDate) * 100 : 0;

  return (
    <div className="space-y-5 pt-2">
      {/* ── Header Section ── */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Application for Payment
          </h3>

          {/* Row 1: Owner, Project, Application No */}
          <div className="grid grid-cols-3 gap-4 mb-3">
            <EditableField label="TO OWNER" value={formData.ownerName} onChange={(v) => onFormChange("ownerName", v)} />
            <ReadOnlyField label="PROJECT" value={formData.projectName} />
            <EditableField label="APPLICATION NO." value={formData.applicationNo} onChange={(v) => onFormChange("applicationNo", v)} />
          </div>

          {/* Row 2: Period To, Contractor, Via Architect */}
          <div className="grid grid-cols-3 gap-4 mb-3">
            <EditableField label="PERIOD TO" value={formData.periodTo} type="date" onChange={(v) => onFormChange("periodTo", v)} />
            <EditableField label="FROM CONTRACTOR" value={formData.contractorName} onChange={(v) => onFormChange("contractorName", v)} />
            <EditableField label="VIA ARCHITECT" value={formData.architectName} onChange={(v) => onFormChange("architectName", v)} />
          </div>

          {/* Row 3: Contract Date, Project No, Previous Certificates */}
          <div className="grid grid-cols-3 gap-4">
            <EditableField label="CONTRACT DATE" value={formData.contractDate} type="date" onChange={(v) => onFormChange("contractDate", v)} />
            <EditableField label="PROJECT NO." value={formData.projectNumber} onChange={(v) => onFormChange("projectNumber", v)} />
            <ReadOnlyField label="PREVIOUS CERTIFICATES ($)" value={fmtDecimal(Number(formData.previousCertificates) || 0)} />
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Calculations ── */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Contractor's Application for Payment
          </h3>
          <div className="space-y-0">
            <SummaryLine number="1." label="Original Contract Sum" value={fmtDecimal(originalContractSum)} />
            <SummaryLine number="2." label="Net Change by Change Orders" value={fmtDecimal(netChangeOrders)} />
            <SummaryLine number="3." label="Contract Sum to Date (Line 1 ± 2)" value={fmtDecimal(contractSumToDate)} bold />
            <SummaryLine number="4." label="Total Completed & Stored to Date" value={fmtDecimal(totalCompletedStored)} />

            <Separator className="my-1" />

            <SummaryLine number="5." label="Less Previous Certificates for Payment" value={fmtDecimal(prevCertificates)} />
            <SummaryLine number="6." label="Current Payment Due" value={fmtDecimal(currentPaymentDue)} bold />
            <SummaryLine number="7." label="Balance to Finish" value={fmtDecimal(balanceToFinish)} />
          </div>

          {/* Progress bar */}
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Completed — {pctComplete.toFixed(1)}%</span>
              <span>Remaining — {(100 - pctComplete).toFixed(1)}%</span>
            </div>
            <div className="relative h-2.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(pctComplete, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
