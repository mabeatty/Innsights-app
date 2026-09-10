import { useState } from "react";
import { fmtDecimal } from "./types";
import InvoiceDetailDialog from "../invoices/InvoiceDetailDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAPAging, daysPastDue, daysAgo, fmtShortDate, AGING_BUCKETS, type AgingRow } from "./useAPAging";

interface Props {
  projectId: string;
}

function AgingRowLine({
  r, onClick, selectable, checked, onToggle,
}: {
  r: AgingRow;
  onClick: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: (id: string) => void;
}) {
  const days = r.dueDate ? daysPastDue(r.dueDate) : r.invoiceDate ? daysAgo(r.invoiceDate) : null;
  const overdue = days !== null && days > 0 && !!r.dueDate;
  const agingLabel = days === null ? "—" : r.dueDate ? (days > 0 ? `${days}d overdue` : `Due in ${Math.abs(days)}d`) : `${days}d old`;
  return (
    <tr className="border-t cursor-pointer hover:bg-muted/30 transition-colors" onClick={onClick}>
      {selectable && (
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={!!checked} onCheckedChange={() => onToggle?.(r.invoiceId)} />
        </td>
      )}
      <td className="px-3 py-2 font-medium">{r.vendorName}</td>
      <td className="px-3 py-2 text-muted-foreground">{r.invoiceNumber || "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{fmtShortDate(r.invoiceDate)}</td>
      <td className="px-3 py-2">
        {r.dueDate ? (
          <span className="text-muted-foreground">{fmtShortDate(r.dueDate)}</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-500" title="No due date set — aging is estimated from invoice date">Not set</span>
        )}
      </td>
      <td className={cn("px-3 py-2 whitespace-nowrap", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
        {r.isApproved ? agingLabel : "—"}
      </td>
      <td className="px-3 py-2 text-right">{fmtDecimal(r.amount)}</td>
    </tr>
  );
}

export default function APAgingTab({ projectId }: Props) {
  const { approvedRows, unapprovedRows, loading, refetch, bucketTotals, grandTotal, unapprovedTotal, markPaidBulk } = useAPAging(projectId);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [markingPaid, setMarkingPaid] = useState(false);
  const missingDueDateCount = approvedRows.filter((r) => !r.dueDate).length;

  const allChecked = approvedRows.length > 0 && approvedRows.every((r) => checkedIds.has(r.invoiceId));
  const someChecked = approvedRows.some((r) => checkedIds.has(r.invoiceId));

  const toggleOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setCheckedIds(allChecked ? new Set() : new Set(approvedRows.map((r) => r.invoiceId)));
  };

  const markSelectedPaid = async () => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    setMarkingPaid(true);
    try {
      await markPaidBulk(ids);
      toast.success(`${ids.length} invoice${ids.length === 1 ? "" : "s"} marked paid.`);
      setCheckedIds(new Set());
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark as paid.");
    } finally {
      setMarkingPaid(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading AP aging…</p>;

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AP Aging</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Invoices awaiting approval, and approved invoices not yet paid. Click a row to open the same detail view as the Invoices page.
        </p>
        {missingDueDateCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            {missingDueDateCount} approved invoice{missingDueDateCount === 1 ? "" : "s"} missing a due date — aging for these is estimated from invoice date only.
          </p>
        )}
      </div>

      {/* ── Unapproved batch, listed first ── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wide flex items-center gap-1.5">
          Awaiting Approval
          {unapprovedRows.length > 0 && <span className="font-normal text-muted-foreground">({unapprovedRows.length}, {fmtDecimal(unapprovedTotal)})</span>}
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-amber-50 dark:bg-amber-900/10 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Vendor</th>
                <th className="px-3 py-2 text-left">Invoice #</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-left">Due Date</th>
                <th className="px-3 py-2 text-left">Aging</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {unapprovedRows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No invoices currently awaiting approval.</td></tr>
              )}
              {unapprovedRows.map((r) => (
                <AgingRowLine key={r.invoiceId} r={r} onClick={() => setSelectedInvoiceId(r.invoiceId)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Approved-and-unpaid batch ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approved, Unpaid</h3>
          {someChecked && (
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={markSelectedPaid} disabled={markingPaid}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {markingPaid ? "Marking…" : `Mark ${checkedIds.size} Paid`}
            </Button>
          )}
        </div>

        {/* Bucket summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {AGING_BUCKETS.map((b) => (
            <div key={b.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{b.label}</p>
              <p className={cn("text-lg font-bold mt-1", (b.label === "61-90" || b.label === "90+") && bucketTotals[b.label] > 0 && "text-destructive")}>
                {fmtDecimal(bucketTotals[b.label])}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-8">
                  {approvedRows.length > 0 && <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />}
                </th>
                <th className="px-3 py-2 text-left">Vendor</th>
                <th className="px-3 py-2 text-left">Invoice #</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-left">Due Date</th>
                <th className="px-3 py-2 text-left">Aging</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {approvedRows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No unpaid approved invoices on this project.</td></tr>
              )}
              {approvedRows.map((r) => (
                <AgingRowLine
                  key={r.invoiceId}
                  r={r}
                  onClick={() => setSelectedInvoiceId(r.invoiceId)}
                  selectable
                  checked={checkedIds.has(r.invoiceId)}
                  onToggle={toggleOne}
                />
              ))}
            </tbody>
            {approvedRows.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/50 font-semibold">
                  <td className="px-3 py-2" colSpan={6}>Total</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onChange={refetch}
      />
    </div>
  );
}
