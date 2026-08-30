import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDecimal } from "./types";
import InvoiceDetailDialog from "../invoices/InvoiceDetailDialog";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

interface AgingRow {
  invoiceId: string;
  vendorName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number;
}

const fmtShortDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Positive = days overdue (due date has passed), negative = days until due.
const daysPastDue = (dueDateStr: string) => {
  const d = new Date(dueDateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

const daysAgo = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
};

// Standard AP aging buckets.
const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1-30", min: 1, max: 30 },
  { label: "31-60", min: 31, max: 60 },
  { label: "61-90", min: 61, max: 90 },
  { label: "90+", min: 91, max: Infinity },
] as const;

function bucketFor(days: number): (typeof BUCKETS)[number]["label"] {
  const b = BUCKETS.find((b) => days >= b.min && days <= b.max);
  return b?.label ?? "Current";
}

export default function APAgingTab({ projectId }: Props) {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: txns, error } = await supabase
      .from("budget_transactions")
      .select("invoice_id, payee, amount")
      .eq("project_id", projectId)
      .eq("status", "Approved");
    if (error || !txns) { setLoading(false); return; }

    const invoiceIds = Array.from(new Set(txns.map((t: any) => t.invoice_id).filter(Boolean)));
    const amountByInvoice = new Map<string, number>();
    txns.forEach((t: any) => {
      if (!t.invoice_id) return;
      amountByInvoice.set(t.invoice_id, (amountByInvoice.get(t.invoice_id) ?? 0) + Number(t.amount));
    });

    if (invoiceIds.length === 0) { setRows([]); setLoading(false); return; }

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, vendor_name, invoice_number, invoice_date, due_date")
      .in("id", invoiceIds);

    const built: AgingRow[] = (invoices ?? []).map((inv: any) => ({
      invoiceId: inv.id,
      vendorName: inv.vendor_name || "—",
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      // Use the linked-transaction total (matches what's actually still owed
      // in the schedule of values), not invoices.amount, since the two can
      // differ if only part of an invoice was approved.
      amount: amountByInvoice.get(inv.id) ?? Number(inv.amount ?? 0),
    }));

    built.sort((a, b) => {
      const da = a.dueDate ?? a.invoiceDate ?? "";
      const db = b.dueDate ?? b.invoiceDate ?? "";
      return da.localeCompare(db);
    });

    setRows(built);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const bucketTotals = useMemo(() => {
    const totals: Record<string, number> = { "Current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const r of rows) {
      const days = r.dueDate ? daysPastDue(r.dueDate) : r.invoiceDate ? daysAgo(r.invoiceDate) : 0;
      totals[bucketFor(days)] += r.amount;
    }
    return totals;
  }, [rows]);

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading AP aging…</p>;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AP Aging</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every approved-but-unpaid transaction on this project. Click a row to open the same detail view as the Invoices page.
        </p>
      </div>

      {/* Bucket summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {BUCKETS.map((b) => (
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
                  <td className="px-3 py-2 text-muted-foreground">{fmtShortDate(r.dueDate)}</td>
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
        onChange={load}
      />
    </div>
  );
}
