import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgingRow {
  invoiceId: string;
  vendorName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number;
  // false = still working through the PM -> Lead approval chain (no
  // budget_transactions row exists yet, since invoices aren't pushed into
  // the schedule of values until approved). true = approved and unpaid.
  isApproved: boolean;
}

// Positive = days overdue (due date has passed), negative = days until due.
export const daysPastDue = (dueDateStr: string) => {
  const d = new Date(dueDateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

export const daysAgo = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
};

export const fmtShortDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Standard AP aging buckets.
export const AGING_BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1-30", min: 1, max: 30 },
  { label: "31-60", min: 31, max: 60 },
  { label: "61-90", min: 61, max: 90 },
  { label: "90+", min: 91, max: Infinity },
] as const;

export function agingBucketFor(days: number): (typeof AGING_BUCKETS)[number]["label"] {
  const b = AGING_BUCKETS.find((b) => days >= b.min && days <= b.max);
  return b?.label ?? "Current";
}

// Every unpaid invoice for a project — both invoices still working through
// approval, and approved invoices not yet paid — grouped so the two can be
// shown as separate batches (unapproved first). Single source of truth
// shared by the Summary tab's Cash & Payables preview and the full AP Aging
// sub-tab, so the two can't drift the way the invoice extraction context
// builders did before being unified.
export function useAPAging(projectId: string) {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Approved-and-unpaid: keyed off budget_transactions, since that's what's
    // actually still owed once retainage/adjustments are applied — an
    // invoice's own .amount can differ if only part of it was approved.
    const [{ data: txns }, { data: unapprovedInvoices }] = await Promise.all([
      supabase
        .from("budget_transactions")
        .select("invoice_id, payee, amount")
        .eq("project_id", projectId)
        .eq("status", "Approved"),
      supabase
        .from("invoices")
        .select("id, vendor_name, invoice_number, invoice_date, due_date, amount")
        .eq("project_id", projectId)
        .neq("status", "Approved"),
    ]);

    const invoiceIds = Array.from(new Set((txns ?? []).map((t: any) => t.invoice_id).filter(Boolean)));
    const amountByInvoice = new Map<string, number>();
    (txns ?? []).forEach((t: any) => {
      if (!t.invoice_id) return;
      amountByInvoice.set(t.invoice_id, (amountByInvoice.get(t.invoice_id) ?? 0) + Number(t.amount));
    });

    const approvedInvoices = invoiceIds.length > 0
      ? (await supabase.from("invoices").select("id, vendor_name, invoice_number, invoice_date, due_date").in("id", invoiceIds)).data
      : [];

    const approvedRows: AgingRow[] = (approvedInvoices ?? []).map((inv: any) => ({
      invoiceId: inv.id,
      vendorName: inv.vendor_name || "—",
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      amount: amountByInvoice.get(inv.id) ?? 0,
      isApproved: true,
    }));

    const unapprovedRows: AgingRow[] = (unapprovedInvoices ?? []).map((inv: any) => ({
      invoiceId: inv.id,
      vendorName: inv.vendor_name || "—",
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      amount: Number(inv.amount ?? 0),
      isApproved: false,
    }));

    const sortByDate = (a: AgingRow, b: AgingRow) => {
      const da = a.dueDate ?? a.invoiceDate ?? "";
      const db = b.dueDate ?? b.invoiceDate ?? "";
      return da.localeCompare(db);
    };
    unapprovedRows.sort(sortByDate);
    approvedRows.sort(sortByDate);

    // Unapproved batch first, per direction given — these need action before
    // they can even become a payable.
    setRows([...unapprovedRows, ...approvedRows]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const bucketTotals = useMemo(() => {
    const totals: Record<string, number> = { "Current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const r of rows) {
      if (!r.isApproved) continue; // aging buckets are for approved-unpaid only; unapproved isn't "aging" yet
      const days = r.dueDate ? daysPastDue(r.dueDate) : r.invoiceDate ? daysAgo(r.invoiceDate) : 0;
      totals[agingBucketFor(days)] += r.amount;
    }
    return totals;
  }, [rows]);

  const approvedRows = useMemo(() => rows.filter((r) => r.isApproved), [rows]);
  const unapprovedRows = useMemo(() => rows.filter((r) => !r.isApproved), [rows]);
  const grandTotal = useMemo(() => approvedRows.reduce((s, r) => s + r.amount, 0), [approvedRows]);
  const unapprovedTotal = useMemo(() => unapprovedRows.reduce((s, r) => s + r.amount, 0), [unapprovedRows]);

  return { rows, approvedRows, unapprovedRows, loading, refetch: load, bucketTotals, grandTotal, unapprovedTotal };
}
