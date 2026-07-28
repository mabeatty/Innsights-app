import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Pencil, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";

const db = supabase as any;

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function amountToWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const chunk = (n: number): string => {
    let s = "";
    if (n >= 100) { s += ones[Math.floor(n / 100)] + " Hundred "; n %= 100; }
    if (n >= 20) { s += tens[Math.floor(n / 10)] + " "; n %= 10; }
    if (n > 0) s += ones[n] + " ";
    return s;
  };
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);
  if (dollars === 0) return `Zero and ${String(cents).padStart(2, "0")}/100`;
  let words = "";
  const scales = [["Million", 1e6], ["Thousand", 1e3], ["", 1]] as [string, number][];
  let remaining = dollars;
  for (const [name, value] of scales) {
    const part = Math.floor(remaining / value);
    if (part > 0) words += chunk(part) + (name ? name + " " : "");
    remaining %= value;
  }
  return `${words.trim()} and ${String(cents).padStart(2, "0")}/100`;
}

interface BankAccount {
  id: string; name: string; institution_name: string | null; mask: string | null;
  account_type: string; next_check_number: number; is_active: boolean; notes: string | null;
}
interface Invoice {
  id: string; vendor_name: string; invoice_number: string | null; invoice_date: string | null;
  amount: number | null; net_amount: number | null; status: string; project_id: string | null;
}
interface Payment {
  id: string; bank_account_id: string | null; payee_name: string; payment_method: string;
  check_number: number | null; payment_date: string | null; amount: number; memo: string | null;
  status: string; reference: string | null;
}
interface Allocation { id: string; payment_id: string; invoice_id: string; amount: number; }

const paymentStatusPill = (s: string) => cn(
  "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
  s === "pending" && "bg-amber-100 text-amber-800",
  s === "issued" && "bg-blue-100 text-blue-800",
  s === "sent" && "bg-blue-100 text-blue-800",
  s === "cleared" && "bg-green-100 text-green-800",
  s === "voided" && "bg-slate-200 text-slate-600 line-through",
);

export default function Payments() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Bank account dialog
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctEditId, setAcctEditId] = useState<string | null>(null);
  const [acctName, setAcctName] = useState("");
  const [acctInstitution, setAcctInstitution] = useState("");
  const [acctMask, setAcctMask] = useState("");
  const [acctType, setAcctType] = useState("checking");
  const [acctNextCheck, setAcctNextCheck] = useState(1);

  // Pay dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payBankId, setPayBankId] = useState("");
  const [payMethod, setPayMethod] = useState("check");
  const [payAmount, setPayAmount] = useState(0);
  const [payMemo, setPayMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const org = await db.from("organizations").select("id").limit(1).single();
    const oid = org.data?.id ?? null;
    setOrgId(oid);
    const [aRes, iRes, pRes, alRes] = await Promise.all([
      db.from("bank_accounts").select("*").order("name"),
      db.from("invoices").select("id, vendor_name, invoice_number, invoice_date, amount, net_amount, status, project_id").eq("status", "Approved"),
      db.from("payments").select("*").order("created_at", { ascending: false }),
      db.from("payment_allocations").select("*"),
    ]);
    setAccounts((aRes.data ?? []) as BankAccount[]);
    setInvoices((iRes.data ?? []) as Invoice[]);
    setPayments((pRes.data ?? []) as Payment[]);
    setAllocations((alRes.data ?? []) as Allocation[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const paidInvoiceIds = useMemo(() => new Set(allocations.map(a => a.invoice_id)), [allocations]);
  const payableInvoices = useMemo(
    () => invoices.filter(i => !paidInvoiceIds.has(i.id)),
    [invoices, paidInvoiceIds]
  );
  const acctName2 = (id: string | null) => accounts.find(a => a.id === id)?.name ?? "—";
  const invoiceForPayment = (pid: string) => {
    const alloc = allocations.find(a => a.payment_id === pid);
    if (!alloc) return null;
    return invoices.find(i => i.id === alloc.invoice_id) ?? null;
  };

  // ---- Bank accounts ----
  const openAcct = (a?: BankAccount) => {
    if (a) {
      setAcctEditId(a.id); setAcctName(a.name); setAcctInstitution(a.institution_name ?? "");
      setAcctMask(a.mask ?? ""); setAcctType(a.account_type); setAcctNextCheck(a.next_check_number);
    } else {
      setAcctEditId(null); setAcctName(""); setAcctInstitution(""); setAcctMask(""); setAcctType("checking"); setAcctNextCheck(1);
    }
    setAcctOpen(true);
  };
  const saveAcct = async () => {
    if (!acctName.trim()) { toast.error("Account name is required."); return; }
    const payload = {
      name: acctName, institution_name: acctInstitution || null, mask: acctMask || null,
      account_type: acctType, next_check_number: acctNextCheck,
    };
    try {
      if (acctEditId) {
        const { error } = await db.from("bank_accounts").update(payload).eq("id", acctEditId);
        if (error) throw error;
      } else {
        if (!orgId) { toast.error("Missing organization."); return; }
        const { error } = await db.from("bank_accounts").insert({ ...payload, org_id: orgId });
        if (error) throw error;
      }
      toast.success("Bank account saved.");
      setAcctOpen(false);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed to save account."); }
  };

  // ---- Payments ----
  const openPay = (inv: Invoice) => {
    setPayInvoice(inv);
    setPayBankId(accounts.find(a => a.is_active)?.id ?? accounts[0]?.id ?? "");
    setPayMethod("check");
    setPayAmount(Number(inv.net_amount ?? inv.amount ?? 0));
    setPayMemo(inv.invoice_number ? `Invoice ${inv.invoice_number}` : "");
    setPayOpen(true);
  };
  const createPayment = async () => {
    if (!payInvoice) return;
    if (!payBankId) { toast.error("Select a bank account."); return; }
    setSaving(true);
    try {
      const { data: pay, error } = await db.from("payments").insert({
        org_id: orgId, bank_account_id: payBankId, payee_name: payInvoice.vendor_name,
        payment_method: payMethod, amount: payAmount, memo: payMemo || null, status: "pending",
      }).select("id").single();
      if (error) throw error;
      const { error: aErr } = await db.from("payment_allocations").insert({
        org_id: orgId, payment_id: pay.id, invoice_id: payInvoice.id, amount: payAmount,
      });
      if (aErr) throw aErr;
      toast.success("Payment created (pending).");
      setPayOpen(false);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed to create payment."); }
    setSaving(false);
  };

  const issuePayment = async (p: Payment) => {
    try {
      if (p.payment_method === "check") {
        const acct = accounts.find(a => a.id === p.bank_account_id);
        if (!acct) { toast.error("Payment has no bank account."); return; }
        const checkNo = acct.next_check_number;
        const { error } = await db.from("payments").update({
          status: "issued", check_number: checkNo, payment_date: format(new Date(), "yyyy-MM-dd"),
        }).eq("id", p.id);
        if (error) throw error;
        await db.from("bank_accounts").update({ next_check_number: checkNo + 1 }).eq("id", acct.id);
        toast.success(`Check #${checkNo} issued.`);
      } else {
        const { error } = await db.from("payments").update({
          status: "sent", payment_date: format(new Date(), "yyyy-MM-dd"),
        }).eq("id", p.id);
        if (error) throw error;
        toast.success("ACH marked sent.");
      }
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed to issue payment."); }
  };
  const setStatus = async (p: Payment, status: string) => {
    try {
      const { error } = await db.from("payments").update({ status }).eq("id", p.id);
      if (error) throw error;
      toast.success(`Payment ${status}.`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed to update payment."); }
  };

  const printCheck = (p: Payment) => {
    const acct = accounts.find(a => a.id === p.bank_account_id);
    const inv = invoiceForPayment(p.id);
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = 612, M = 36, right = W - M;
    const dateStr = p.payment_date ? format(new Date(p.payment_date), "MM/dd/yyyy") : format(new Date(), "MM/dd/yyyy");

    // --- Check face (top 3.5in / 252pt) ---
    doc.setDrawColor(180); doc.rect(M, M, W - 2 * M, 216);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(acct?.name ?? "Bank Account", M + 12, M + 24);
    if (acct?.institution_name) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(acct.institution_name, M + 12, M + 37); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(`Check #${p.check_number ?? ""}`, right - 12, M + 20, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Date: ${dateStr}`, right - 12, M + 36, { align: "right" });

    // Amount box
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.rect(right - 120, M + 70, 108, 26);
    doc.text(`$ ${Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, right - 16, M + 88, { align: "right" });

    // Pay to the order of
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("PAY TO THE ORDER OF", M + 12, M + 78);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(p.payee_name, M + 12, M + 92);
    doc.setDrawColor(120); doc.line(M + 12, M + 96, right - 130, M + 96);

    // Amount in words
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`${amountToWords(Number(p.amount))} `.toUpperCase(), M + 12, M + 118);
    doc.line(M + 12, M + 122, right - 12, M + 122);
    doc.setFontSize(8); doc.text("DOLLARS", right - 12, M + 118, { align: "right" });

    // Memo + signature
    doc.setFontSize(9);
    doc.text(`MEMO: ${p.memo ?? (inv?.invoice_number ? "Invoice " + inv.invoice_number : "")}`, M + 12, M + 170);
    doc.line(right - 200, M + 176, right - 12, M + 176);
    doc.setFontSize(8); doc.text("AUTHORIZED SIGNATURE", right - 12, M + 188, { align: "right" });

    // MICR placeholder (NOT encoded magnetic ink)
    doc.setFont("courier", "normal"); doc.setFontSize(11);
    doc.text(`C${String(p.check_number ?? "").padStart(4, "0")}C   :ROUTING:   ACCOUNT ••${acct?.mask ?? ""}`, M + 12, M + 206);

    // --- Stub ---
    let y = M + 260;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("Payment Detail", M, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const line = (k: string, v: string) => { doc.text(k, M, y); doc.text(v, M + 120, y); y += 15; };
    line("Payee:", p.payee_name);
    line("Check #:", String(p.check_number ?? ""));
    line("Date:", dateStr);
    line("Account:", acct?.name ?? "—");
    if (inv) { line("Invoice #:", inv.invoice_number ?? "—"); }
    line("Amount:", fmt(p.amount));
    if (p.memo) line("Memo:", p.memo);

    doc.setFontSize(7); doc.setTextColor(150);
    doc.text("Note: the MICR line above is a visual placeholder and is not encoded for magnetic-ink processing. Use bank-approved check stock/encoding for deposit.", M, 756, { maxWidth: W - 2 * M });

    doc.save(`check-${p.check_number ?? "draft"}-${p.payee_name.replace(/[^a-z0-9]/gi, "_")}.pdf`);
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading payments…</div>;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-primary">Payments</h1>
      <p className="mb-5 text-sm text-muted-foreground">Pay approved invoices by check or ACH, and track each payment through its lifecycle.</p>

      <Tabs defaultValue="register">
        <TabsList className="bg-blue-100 text-blue-900">
          <TabsTrigger value="register">Payment Register</TabsTrigger>
          <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
        </TabsList>

        {/* REGISTER */}
        <TabsContent value="register" className="mt-4 space-y-6">
          <div>
            <div className="mb-2 text-sm font-semibold text-primary">Approved &amp; unpaid ({payableInvoices.length})</div>
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="bg-muted/50 text-left text-muted-foreground">
                  <th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {payableInvoices.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No approved invoices awaiting payment.</td></tr>
                  ) : payableInvoices.map(inv => (
                    <tr key={inv.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{inv.vendor_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{inv.invoice_number ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{inv.invoice_date ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(inv.net_amount ?? inv.amount)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" className="gap-1.5" onClick={() => openPay(inv)}><Banknote className="h-3.5 w-3.5" /> Pay</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-primary">Payments ({payments.length})</div>
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead><tr className="bg-muted/50 text-left text-muted-foreground">
                  <th className="px-3 py-2">Payee</th><th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Check #</th><th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No payments yet.</td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{p.payee_name}</td>
                      <td className="px-3 py-2 text-xs uppercase text-muted-foreground">{p.payment_method}</td>
                      <td className="px-3 py-2 text-xs">{p.check_number ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{acctName2(p.bank_account_id)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(p.amount)}</td>
                      <td className="px-3 py-2"><span className={paymentStatusPill(p.status)}>{p.status}</span></td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {p.status === "pending" && <Button size="sm" variant="outline" onClick={() => issuePayment(p)}>Issue</Button>}
                          {p.payment_method === "check" && p.check_number != null && p.status !== "voided" && <Button size="sm" variant="outline" onClick={() => printCheck(p)}>Print</Button>}
                          {(p.status === "issued" || p.status === "sent") && <Button size="sm" variant="outline" onClick={() => setStatus(p, "cleared")}>Cleared</Button>}
                          {p.status !== "voided" && p.status !== "cleared" && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setStatus(p, "voided")}>Void</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* BANK ACCOUNTS */}
        <TabsContent value="accounts" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => openAcct()}><Plus className="h-3.5 w-3.5" /> Add Account</Button>
          </div>
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-3 py-2">Name</th><th className="px-3 py-2">Institution</th>
                <th className="px-3 py-2">Mask</th><th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Next Check #</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No bank accounts yet.</td></tr>
                ) : accounts.map(a => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.institution_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{a.mask ? `••${a.mask}` : "—"}</td>
                    <td className="px-3 py-2 text-xs capitalize">{a.account_type}</td>
                    <td className="px-3 py-2 text-right">{a.next_check_number}</td>
                    <td className="px-3 py-2 text-right"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAcct(a)}><Pencil className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pay Invoice</DialogTitle></DialogHeader>
          {payInvoice && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium">{payInvoice.vendor_name}</div>
                <div className="text-xs text-muted-foreground">Invoice {payInvoice.invoice_number ?? "—"} · {fmt(payInvoice.net_amount ?? payInvoice.amount)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bank Account</Label>
                <Select value={payBankId} onValueChange={setPayBankId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.mask ? ` ••${a.mask}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="check">Check</SelectItem><SelectItem value="ach">ACH</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" step="0.01" className="h-9" value={payAmount || ""} onChange={e => setPayAmount(Number(e.target.value) || 0)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Memo</Label>
                <Input className="h-9" value={payMemo} onChange={e => setPayMemo(e.target.value)} />
              </div>
              {accounts.length === 0 && <p className="text-xs text-amber-700">Add a bank account first (Bank Accounts tab).</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={createPayment} disabled={saving || accounts.length === 0}>{saving ? "Saving…" : "Create Payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank account dialog */}
      <Dialog open={acctOpen} onOpenChange={setAcctOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{acctEditId ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Account Name *</Label><Input className="h-9" value={acctName} onChange={e => setAcctName(e.target.value)} placeholder="e.g. Operating - Chase" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Institution</Label><Input className="h-9" value={acctInstitution} onChange={e => setAcctInstitution(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Last 4</Label><Input className="h-9" maxLength={4} value={acctMask} onChange={e => setAcctMask(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={acctType} onValueChange={setAcctType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="checking">Checking</SelectItem><SelectItem value="savings">Savings</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Next Check #</Label><Input type="number" className="h-9" value={acctNextCheck || ""} onChange={e => setAcctNextCheck(Number(e.target.value) || 1)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcctOpen(false)}>Cancel</Button>
            <Button onClick={saveAcct}>{acctEditId ? "Save Changes" : "Add Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
