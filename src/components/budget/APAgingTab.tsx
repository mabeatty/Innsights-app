import { useState } from "react";
import { fmtDecimal } from "./types";
import InvoiceDetailDialog from "../invoices/InvoiceDetailDialog";
import { cn } from "@/lib/utils";
import { useAPAging, daysPastDue, daysAgo, fmtShortDate, AGING_BUCKETS } from "./useAPAging";

interface Props {
  projectId: string;
}

export default function APAgingTab({ projectId }: Props) {
  const { rows, loading, refetch, bucketTotals, grandTotal } = useAPAging(projectId);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const missingDueDateCount = rows.filter((r) => !r.dueDate).length;

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading AP aging…</p>;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AP Aging</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every approved-but-unpaid transaction on this project. Click a row to open the same detail view as the Invoices page.
        </p>
        {missingDueDateCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            {missingDueDateCount} invoice{missingDueDateCount === 1 ? "" : "s"} missing a due date — aging for these is estimated from invoice date only.
          </p>
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
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Invoice #</th>
              <th className="px-3 py-2 text-left">Invoice Date</th>
              <th className="px-3 py-2 text-left">Due Date</th>
              <th className="px-3 py-2 text-left">Aging</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No unpaid approved transactions on this project.</td></tr>
            )}
            {rows.map((r) => {
              const days = r.dueDate ? daysPastDue(r.dueDate) : r.invoiceDate ? daysAgo(r.invoiceDate) : null;
              const overdue = days !== null && days > 0 && !!r.dueDate;
              const agingLabel = days === null ? "—" : r.dueDate ? (days > 0 ? `${days}d overdue` : `Due in ${Math.abs(days)}d`) : `${days}d old`;
              return (
                <tr
                  key={r.invoiceId}
                  className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedInvoiceId(r.invoiceId)}
                >
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
                  <td className={cn("px-3 py-2 whitespace-nowrap", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>{agingLabel}</td>
                  <td className="px-3 py-2 text-right">{fmtDecimal(r.amount)}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/50 font-semibold">
                <td className="px-3 py-2" colSpan={5}>Total</td>
                <td className="px-3 py-2 text-right">{fmtDecimal(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onChange={refetch}
      />
    </div>
  );
}
