import { useState } from "react";
import { fmtDecimal } from "./types";
import InvoiceDetailDialog from "../invoices/InvoiceDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAPAging, daysPastDue, daysAgo, fmtShortDate, AGING_BUCKETS, type AgingRow } from "./useAPAging";

interface Props {
  projectId: string;
}

function AgingRowLine({ r, onClick, onMarkPaid }: { r: AgingRow; onClick: () => void; onMarkPaid?: (r: AgingRow) => void }) {
  const days = r.dueDate ? daysPastDue(r.dueDate) : r.invoiceDate ? daysAgo(r.invoiceDate) : null;
  const overdue = days !== null && days > 0 && !!r.dueDate;
  const agingLabel = days === null ? "—" : r.dueDate ? (days > 0 ? `${days}d overdue` : `Due in ${Math.abs(days)}d`) : `${days}d old`;
  return (
    <tr className="border-t cursor-pointer hover:bg-muted/30 transition-colors" onClick={onClick}>
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
      {onMarkPaid && (
        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onMarkPaid(r)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
          </Button>
        </td>
      )}
    </tr>
  );
}

export default function APAgingTab({ projectId }: Props) {
  const { approvedRows, unapprovedRows, loading, refetch, bucketTotals, grandTotal, unapprovedTotal, markPaid } = useAPAging(projectId);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [markPaidRow, setMarkPaidRow] = useState<AgingRow | null>(null);
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [markingPaid, setMarkingPaid] = useState(false);
  const missingDueDateCount = approvedRows.filter((r) => !r.dueDate).length;

  const openMarkPaid = (r: AgingRow) => {
    setMarkPaidRow(r);
    setPaidDate(new Date().toISOString().slice(0, 10));
  };

  const confirmMarkPaid = async () => {
    if (!markPaidRow) return;
    setMarkingPaid(true);
    try {
      await markPaid(markPaidRow.invoiceId, paidDate);
      toast.success(`${markPaidRow.vendorName} marked paid.`);
      setMarkPaidRow(null);
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
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approved, Unpaid</h3>

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
                <th className="px-3 py-2 text-left">Vendor</th>
                <th className="px-3 py-2 text-left">Invoice #</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-left">Due Date</th>
                <th className="px-3 py-2 text-left">Aging</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Payment</th>
              </tr>
            </thead>
            <tbody>
              {approvedRows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No unpaid approved invoices on this project.</td></tr>
              )}
              {approvedRows.map((r) => (
                <AgingRowLine key={r.invoiceId} r={r} onClick={() => setSelectedInvoiceId(r.invoiceId)} onMarkPaid={openMarkPaid} />
              ))}
            </tbody>
            {approvedRows.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/50 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>Total</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(grandTotal)}</td>
                  <td className="px-3 py-2" />
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

      <Dialog open={!!markPaidRow} onOpenChange={(o) => !o && setMarkPaidRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {markPaidRow?.vendorName} — {markPaidRow ? fmtDecimal(markPaidRow.amount) : ""}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Payment date</label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidRow(null)}>Cancel</Button>
            <Button onClick={confirmMarkPaid} disabled={markingPaid}>{markingPaid ? "Saving…" : "Confirm Paid"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
