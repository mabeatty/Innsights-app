import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Clock, MessageCircle, Mail, ExternalLink, FolderOpen, Pencil, Plus, Trash2, Stamp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { createNotifications } from "@/lib/notify";
import {
  Invoice, InvoiceApproval, InvoiceLineItem, ApproverRole, APPROVER_ROLES,
  statusBadgeClasses, formatCurrency, COST_TYPES,
} from "./types";
import { naturalDivisionSort } from "@/components/budget/types";
import { formatProjectLabel } from "@/lib/projectLabel";
import LienWaiverPanel from "./LienWaiverPanel";
import PdfPreview from "./PdfPreview";

interface Comment { id: string; author_name: string | null; body: string; created_at: string; author_id: string | null }

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  onChange: () => void;
}

const roleLabel = (r: ApproverRole) => APPROVER_ROLES.find((x) => x.key === r)?.label ?? r;

export default function InvoiceDetailDialog({ invoiceId, onClose, onChange }: Props) {
  const { user, accessLevel } = useAuth();
  const { members } = useTeamMembers();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [approvals, setApprovals] = useState<InvoiceApproval[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [pending, setPending] = useState<null | { role: ApproverRole; kind: "reject" | "approve" }>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit invoice details (top-level fields only — line items/division
  // allocations are tied to budget sync and intentionally out of scope
  // here, since re-slicing those touches budget_transactions elsewhere).
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    vendor_name: "", invoice_number: "", invoice_date: "", due_date: "",
    amount: "", retainage_amount: "", cost_type: "", budget_line_item: "", notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingTaxExempt, setTogglingTaxExempt] = useState(false);
  // Editable division line items (invoice_line_items) — a pay app can span
  // multiple budget divisions, and until now the Edit button only touched
  // top-level invoice fields, with no way to fix a wrong division/amount
  // split after the fact.
  interface EditLineItem { id: string | null; category: string; amount: string; retainage_amount: string }
  const [editLineItems, setEditLineItems] = useState<EditLineItem[]>([]);
  const [projectDivisions, setProjectDivisions] = useState<{ label: string }[]>([]);

  const isAdmin = accessLevel === "admin";
  const canEdit = accessLevel !== "view";
  const nameFor = (id: string | null) =>
    !id ? "Unassigned" : members.find((m) => m.user_id === id)?.name ?? "Unknown member";
  const myName = members.find((m) => m.user_id === user?.id)?.name ?? user?.email ?? "A teammate";

  const load = useCallback(async () => {
    if (!invoiceId) return;
    const [{ data: inv }, { data: appr }, { data: c }, { data: li }] = await Promise.all([
      supabase.from("invoices").select("*, projects(id, name, hotel_name)").eq("id", invoiceId).single(),
      supabase.from("invoice_approvals").select("*").eq("invoice_id", invoiceId),
      supabase.from("invoice_comments").select("*").eq("invoice_id", invoiceId).order("created_at"),
      supabase.from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("category"),
    ]);
    setInvoice(inv as Invoice);
    setLineItems((((li as InvoiceLineItem[]) ?? [])).sort((a, b) => naturalDivisionSort(a.category ?? "", b.category ?? "")));
    setApprovals((appr as InvoiceApproval[]) ?? []);
    setComments((c as Comment[]) ?? []);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!invoiceId) { setPending(null); setMoreInfoOpen(false); setActionNotes(""); setIsEditing(false); } }, [invoiceId]);

  const approvalFor = (role: ApproverRole) => approvals.find((a) => a.approver_role === role);
  const canActOn = (a: InvoiceApproval | undefined) =>
    !!a && a.status === "Pending" && invoice?.status !== "Approved" && invoice?.status !== "Rejected" &&
    (a.approver_id === user?.id || isAdmin);

  const recordAudit = async (action: string, notes?: string) => {
    if (!invoiceId) return;
    await supabase.from("invoice_audit_trail").insert({
      invoice_id: invoiceId, action, performed_by: user?.id, performed_by_name: myName, notes: notes || null,
    });
  };

  // Approve or Reject a single role's step.
  const decide = async (role: ApproverRole, decision: "Approved" | "Rejected", notes: string) => {
    if (!invoice) return;
    if (decision === "Rejected" && !notes.trim()) { toast.error("A rejection reason is required."); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("invoice_approvals")
        .update({ status: decision, notes: notes.trim() || null, decided_at: now })
        .eq("invoice_id", invoice.id)
        .eq("approver_role", role);
      if (upErr) throw upErr;

      // Recompute overall status from the full set.
      const updated = approvals.map((a) => (a.approver_role === role ? { ...a, status: decision } : a));
      const anyRejected = updated.some((a) => a.status === "Rejected");
      const allApproved = updated.length > 0 && updated.every((a) => a.status === "Approved");
      const overall = anyRejected ? "Rejected" : allApproved ? "Approved" : "In Approval";

      const invUpdate: Record<string, unknown> = { status: overall };
      if (overall === "Approved") { invUpdate.approved_by = user?.id; invUpdate.approved_at = now; }
      if (decision === "Rejected") invUpdate.rejection_reason = notes.trim();
      const { error: invErr } = await supabase.from("invoices").update(invUpdate).eq("id", invoice.id);
      if (invErr) throw invErr;

      // Sync the linked transaction lines so only approved invoices are draw-eligible.
      if (overall === "Approved") {
        await supabase.from("budget_transactions").update({ status: "Approved" }).eq("invoice_id", invoice.id);
      } else if (overall === "Rejected") {
        await supabase.from("budget_transactions").update({ status: "Pending" }).eq("invoice_id", invoice.id);
      }

      await recordAudit(`${roleLabel(role)} ${decision.toLowerCase()}`, notes.trim() || undefined);

      // Notify the other two approvers + the submitter of this decision.
      const others = updated.filter((a) => a.approver_role !== role).map((a) => a.approver_id);
      const label = `${invoice.vendor_name ?? "Invoice"} · ${formatCurrency(invoice.amount)}`;
      await createNotifications([
        ...others.map((uid) => ({
          user_id: uid, invoice_id: invoice.id,
          title: `Invoice ${decision.toLowerCase()} — ${roleLabel(role)}`,
          body: `${myName} ${decision.toLowerCase()} the ${roleLabel(role)} step for ${label}.`,
        })),
        {
          user_id: invoice.submitted_by, invoice_id: invoice.id,
          title: `Invoice ${decision.toLowerCase()} — ${roleLabel(role)}`,
          body: `${myName} ${decision.toLowerCase()} the ${roleLabel(role)} step for ${label}.`,
        },
      ]);

      // Final-state notifications to the submitter.
      if (overall === "Approved") {
        await createNotifications([{
          user_id: invoice.submitted_by, invoice_id: invoice.id,
          title: "Invoice fully approved",
          body: `${label} has been approved by all three approvers.`,
        }]);
      } else if (overall === "Rejected") {
        await createNotifications([{
          user_id: invoice.submitted_by, invoice_id: invoice.id,
          title: "Invoice rejected",
          body: `${label} was rejected at the ${roleLabel(role)} step.`,
        }]);
      }

      toast.success(`${roleLabel(role)}: ${decision}`);
      setPending(null); setActionNotes("");
      await load(); onChange();
    } catch (e: any) {
      toast.error(e?.message || "Failed to record decision.");
    } finally {
      setSaving(false);
    }
  };

  // Request more info → comment + notification to submitter (does not change approval).
  const requestMoreInfo = async () => {
    if (!invoice || !actionNotes.trim()) { toast.error("Describe what's needed."); return; }
    setSaving(true);
    try {
      await supabase.from("invoice_comments").insert({
        invoice_id: invoice.id, author_id: user?.id, author_name: myName,
        body: `More info requested: ${actionNotes.trim()}`,
      });
      await recordAudit("More info requested", actionNotes.trim());
      await createNotifications([{
        user_id: invoice.submitted_by, invoice_id: invoice.id,
        title: "More info requested",
        body: `${myName} requested more info on ${invoice.vendor_name ?? "an invoice"}: ${actionNotes.trim()}`,
      }]);
      toast.success("Request sent to submitter.");
      setMoreInfoOpen(false); setActionNotes("");
      await load(); onChange();
    } catch (e: any) {
      toast.error(e?.message || "Failed.");
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || !invoiceId) return;
    const { error } = await supabase.from("invoice_comments").insert({
      invoice_id: invoiceId, author_id: user?.id, author_name: myName, body: newComment.trim(),
    });
    if (error) return toast.error(error.message);
    setNewComment(""); load();
  };

  const toggleTaxExempt = async () => {
    if (!invoice) return;
    setTogglingTaxExempt(true);
    try {
      const next = !invoice.tax_exempt;
      const { error } = await supabase.from("invoices").update({
        tax_exempt: next,
        tax_exempt_by: next ? user?.id ?? null : null,
        tax_exempt_at: next ? new Date().toISOString() : null,
      }).eq("id", invoice.id);
      if (error) throw error;
      await recordAudit(next ? "Marked tax exempt" : "Removed tax exempt mark");
      toast.success(next ? "Marked as tax exempt." : "Tax exempt mark removed.");
      await load(); onChange();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update.");
    } finally {
      setTogglingTaxExempt(false);
    }
  };

  const startEditing = async () => {
    if (!invoice) return;
    setEditForm({
      vendor_name: invoice.vendor_name ?? "",
      invoice_number: invoice.invoice_number ?? "",
      invoice_date: invoice.invoice_date ?? "",
      due_date: invoice.due_date ?? "",
      amount: invoice.amount != null ? String(invoice.amount) : "",
      retainage_amount: invoice.retainage_amount != null ? String(invoice.retainage_amount) : "",
      cost_type: (invoice as any).cost_type ?? "",
      budget_line_item: invoice.budget_line_item ?? "",
      notes: invoice.notes ?? "",
    });
    setEditLineItems(lineItems.map((li) => ({
      id: li.id, category: li.category ?? "",
      amount: li.amount != null ? String(li.amount) : "",
      retainage_amount: li.retainage_amount != null ? String(li.retainage_amount) : "0",
    })));
    if (invoice.project_id) {
      const { data } = await supabase
        .from("project_budget")
        .select("division_number, division_name")
        .eq("project_id", invoice.project_id)
        .order("division_number");
      const sorted = ((data ?? []) as { division_number: string; division_name: string }[])
        .sort((a, b) => naturalDivisionSort(a.division_number, b.division_number));
      setProjectDivisions(sorted.map((d) => ({ label: `${d.division_number} — ${d.division_name}` })));
    }
    setIsEditing(true);
  };

  const addEditLineItem = () => {
    setEditLineItems((rows) => [...rows, { id: null, category: projectDivisions[0]?.label ?? "", amount: "", retainage_amount: "0" }]);
  };
  const removeEditLineItem = (idx: number) => {
    setEditLineItems((rows) => rows.filter((_, i) => i !== idx));
  };
  const updateEditLineItem = (idx: number, patch: Partial<EditLineItem>) => {
    setEditLineItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const editLineItemsTotal = editLineItems.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const editLineItemsRetainageTotal = editLineItems.reduce((s, r) => s + (Number(r.retainage_amount) || 0), 0);

  const saveInvoiceEdit = async () => {
    if (!invoice) return;
    const hasLineItems = editLineItems.length > 0;
    // With line items present, they're the source of truth for amount and
    // retainage — the top-level fields just mirror the sum, so the two can
    // never silently disagree. Without line items, the top-level fields
    // stay directly editable (a simple single-division invoice).
    const amount = hasLineItems ? editLineItemsTotal : (editForm.amount.trim() ? Number(editForm.amount) : null);
    const retainage = hasLineItems ? editLineItemsRetainageTotal : (editForm.retainage_amount.trim() ? Number(editForm.retainage_amount) : null);
    if (!hasLineItems && editForm.amount.trim() && Number.isNaN(amount)) { toast.error("Amount must be a number."); return; }
    if (!hasLineItems && editForm.retainage_amount.trim() && Number.isNaN(retainage)) { toast.error("Retainage must be a number."); return; }
    for (const li of editLineItems) {
      if (li.amount.trim() && Number.isNaN(Number(li.amount))) { toast.error(`Line item amount for "${li.category}" must be a number.`); return; }
      if (li.retainage_amount.trim() && Number.isNaN(Number(li.retainage_amount))) { toast.error(`Line item retainage for "${li.category}" must be a number.`); return; }
      if (!li.category) { toast.error("Every line item needs a division."); return; }
    }
    setSavingEdit(true);
    try {
      const netAmount = amount != null ? amount - (retainage ?? 0) : null;
      const { error } = await supabase.from("invoices").update({
        vendor_name: editForm.vendor_name.trim() || null,
        invoice_number: editForm.invoice_number.trim() || null,
        invoice_date: editForm.invoice_date || null,
        due_date: editForm.due_date || null,
        amount, retainage_amount: retainage, net_amount: netAmount,
        cost_type: editForm.cost_type || null,
        budget_line_item: editForm.budget_line_item.trim() || null,
        notes: editForm.notes.trim() || null,
      }).eq("id", invoice.id);
      if (error) throw error;

      if (hasLineItems) {
        const originalIds = new Set(lineItems.map((li) => li.id));
        const keptIds = new Set(editLineItems.filter((r) => r.id).map((r) => r.id as string));
        const deletedIds = [...originalIds].filter((id) => !keptIds.has(id));
        if (deletedIds.length > 0) {
          const { error: delErr } = await supabase.from("invoice_line_items").delete().in("id", deletedIds);
          if (delErr) throw delErr;
        }
        for (const r of editLineItems) {
          const rAmount = r.amount.trim() ? Number(r.amount) : 0;
          const rRetainage = r.retainage_amount.trim() ? Number(r.retainage_amount) : 0;
          const rNet = rAmount - rRetainage;
          if (r.id) {
            const { error: updErr } = await supabase.from("invoice_line_items").update({
              category: r.category, amount: rAmount, retainage_amount: rRetainage, net_amount: rNet,
            }).eq("id", r.id);
            if (updErr) throw updErr;
          } else {
            const { error: insErr } = await supabase.from("invoice_line_items").insert({
              invoice_id: invoice.id, category: r.category, amount: rAmount, retainage_amount: rRetainage, net_amount: rNet,
            });
            if (insErr) throw insErr;
          }
        }
      }

      await recordAudit(hasLineItems ? "Edited invoice details and line items" : "Edited invoice details");
      toast.success("Invoice updated.");
      setIsEditing(false);
      await load(); onChange();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  };

  if (!invoiceId) return null;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-7xl w-[97vw] max-h-[92vh] h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-4 pb-2 border-b shrink-0">
          <DialogTitle className="flex items-center gap-3 pr-8">
            <span>{invoice?.vendor_name || "Invoice"}</span>
            {invoice && <Badge className={statusBadgeClasses(invoice.status)} variant="outline">{invoice.status}</Badge>}
            {invoice?.source === "email" && <Badge variant="outline" className="gap-1 text-[10px]"><Mail className="h-2.5 w-2.5" />Via Email</Badge>}
            {invoice?.tax_exempt && (
              <Badge variant="outline" className="gap-1 text-[10px] border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wide -rotate-3">
                <Stamp className="h-2.5 w-2.5" /> Tax Exempt
              </Badge>
            )}
            {invoice && canEdit && !isEditing && (
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleTaxExempt} disabled={togglingTaxExempt}>
                  <Stamp className="h-3.5 w-3.5" /> {invoice.tax_exempt ? "Remove Tax Exempt" : "Mark Tax Exempt"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0 overflow-hidden">
            {/* Left: PDF preview */}
            <div className="bg-muted/30 border-r flex flex-col min-h-0">
              {invoice.pdf_url ? (
                <PdfPreview url={invoice.pdf_url} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No PDF</div>
              )}
              {invoice.pdf_url && (
                <a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary p-2 border-t inline-flex items-center gap-1">
                  Open PDF <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Right: details + approval panel + comments */}
            <div className="overflow-y-auto min-h-0 p-5 space-y-5">
              {/* Details */}
              {isEditing ? (
                <div className="space-y-3 rounded-md border p-4 bg-muted/20">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Vendor</Label>
                      <Input value={editForm.vendor_name} onChange={(e) => setEditForm((f) => ({ ...f, vendor_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cost type</Label>
                      <Select value={editForm.cost_type} onValueChange={(v) => setEditForm((f) => ({ ...f, cost_type: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {COST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Invoice #</Label>
                      <Input value={editForm.invoice_number} onChange={(e) => setEditForm((f) => ({ ...f, invoice_number: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Invoice date</Label>
                      <Input type="date" value={editForm.invoice_date} onChange={(e) => setEditForm((f) => ({ ...f, invoice_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Due date</Label>
                      <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))} />
                    </div>
                    {editLineItems.length === 0 ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Amount</Label>
                          <Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Retainage amount</Label>
                          <Input type="number" step="0.01" value={editForm.retainage_amount} onChange={(e) => setEditForm((f) => ({ ...f, retainage_amount: e.target.value }))} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Amount</Label>
                          <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm">{formatCurrency(editLineItemsTotal)}</div>
                          <p className="text-[10px] text-muted-foreground">Sum of line items below</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Retainage amount</Label>
                          <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm">{formatCurrency(editLineItemsRetainageTotal)}</div>
                          <p className="text-[10px] text-muted-foreground">Sum of line items below</p>
                        </div>
                      </>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Budget line</Label>
                      <Input value={editForm.budget_line_item} onChange={(e) => setEditForm((f) => ({ ...f, budget_line_item: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      rows={2}
                      value={editForm.notes}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      className="bg-yellow-100 dark:bg-yellow-300/20 border-yellow-300 dark:border-yellow-300/40 focus-visible:ring-yellow-400"
                    />
                  </div>

                  {/* Division line items — a pay app can span multiple
                      budget divisions; this is the actual editing surface
                      for that, not the top-level fields above. */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Division line items</Label>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addEditLineItem}>
                        <Plus className="h-3 w-3 mr-1" /> Add line item
                      </Button>
                    </div>
                    {editLineItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                        No division breakdown — this invoice's Amount above applies to a single division/category.
                      </p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50 text-muted-foreground text-left">
                              <th className="px-2 py-1.5">Division</th>
                              <th className="px-2 py-1.5 text-right">Amount</th>
                              <th className="px-2 py-1.5 text-right">Retainage</th>
                              <th className="px-2 py-1.5 text-right">Net</th>
                              <th className="px-2 py-1.5 w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {editLineItems.map((li, idx) => {
                              const net = (Number(li.amount) || 0) - (Number(li.retainage_amount) || 0);
                              return (
                                <tr key={idx} className="border-t">
                                  <td className="px-2 py-1.5">
                                    <Select value={li.category} onValueChange={(v) => updateEditLineItem(idx, { category: v })}>
                                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select division" /></SelectTrigger>
                                      <SelectContent>
                                        {projectDivisions.map((d) => <SelectItem key={d.label} value={d.label}>{d.label}</SelectItem>)}
                                        {/* keep a stale/custom category selectable even if it's not in the current division list */}
                                        {li.category && !projectDivisions.some((d) => d.label === li.category) && (
                                          <SelectItem value={li.category}>{li.category}</SelectItem>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Input type="number" step="0.01" className="h-7 text-xs text-right" value={li.amount}
                                      onChange={(e) => updateEditLineItem(idx, { amount: e.target.value })} />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <Input type="number" step="0.01" className="h-7 text-xs text-right" value={li.retainage_amount}
                                      onChange={(e) => updateEditLineItem(idx, { retainage_amount: e.target.value })} />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">{formatCurrency(net)}</td>
                                  <td className="px-2 py-1.5">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeEditLineItem(idx)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-muted/50 font-semibold">
                              <td className="px-2 py-1.5">Totals</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(editLineItemsTotal)}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(editLineItemsRetainageTotal)}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(editLineItemsTotal - editLineItemsRetainageTotal)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                  {(invoice.status === "Approved" || invoice.status === "Routed for Payment") && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      This invoice is already {invoice.status.toLowerCase()}. Editing it here won't automatically update
                      any budget/draw data that was already synced from it — double-check those separately if the
                      amount changes.
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={savingEdit}>Cancel</Button>
                    <Button size="sm" onClick={saveInvoiceEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Project:</span><br/>{invoice.projects ? formatProjectLabel(invoice.projects.name, invoice.projects.hotel_name) : "—"}</div>
                  <div><span className="text-muted-foreground">Cost type:</span><br/>{(invoice as any).cost_type || "—"}</div>
                  <div><span className="text-muted-foreground">Invoice #:</span><br/>{invoice.invoice_number || "—"}</div>
                  <div><span className="text-muted-foreground">Invoice date:</span><br/>{invoice.invoice_date ? format(new Date(invoice.invoice_date), "MMM d, yyyy") : "—"}</div>
                  <div><span className="text-muted-foreground">Amount:</span><br/>{formatCurrency(invoice.amount)}</div>
                  <div><span className="text-muted-foreground">Budget line:</span><br/>{invoice.budget_line_item || "—"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Submitted by:</span><br/>{invoice.submitted_by_email || "—"} · {format(new Date(invoice.submitted_at), "MMM d, yyyy")}</div>
                  {invoice.notes && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Notes:</span><br/>
                      <mark className="bg-yellow-200 dark:bg-yellow-300/80 text-foreground px-0.5 rounded-sm">{invoice.notes}</mark>
                    </div>
                  )}
                </div>
              )}

              {/* Line items */}
              {lineItems.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Line items</div>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 text-muted-foreground text-left">
                            <th className="px-2 py-1.5">Category</th>
                            <th className="px-2 py-1.5 text-right">Amount</th>
                            <th className="px-2 py-1.5 text-right">Retainage</th>
                            <th className="px-2 py-1.5 text-right">Net Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((li) => (
                            <tr key={li.id} className="border-t">
                              <td className="px-2 py-1.5">{li.category || "—"}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(li.amount)}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(li.retainage_amount)}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(li.net_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/50 font-semibold">
                            <td className="px-2 py-1.5">Totals</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(lineItems.reduce((s, li) => s + Number(li.amount ?? 0), 0))}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(lineItems.reduce((s, li) => s + Number(li.retainage_amount ?? 0), 0))}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(lineItems.reduce((s, li) => s + Number(li.net_amount ?? 0), 0))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Supporting Documents (Google Drive) */}
              <Separator />
              <div className="space-y-2">
                <div className="text-sm font-medium">Supporting Documents</div>
                {(invoice as any).drive_url ? (
                  <Button
                    variant="outline"
                    className="w-full justify-center gap-2 border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => window.open((invoice as any).drive_url, "_blank", "noopener,noreferrer")}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Open Supporting Documents
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <div className="text-xs text-muted-foreground">No supporting documents link provided.</div>
                )}
              </div>

              {/* AIA Detail rows (audit/backup of the source Detail tab) */}
              {Array.isArray(invoice.aia_detail_rows) && invoice.aia_detail_rows.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-sm font-medium">AIA Detail (source transactions)</div>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 text-muted-foreground text-left">
                            <th className="px-2 py-1.5">Vendor</th>
                            <th className="px-2 py-1.5">Invoice</th>
                            <th className="px-2 py-1.5">Item</th>
                            <th className="px-2 py-1.5">Cost Type</th>
                            <th className="px-2 py-1.5 text-right">Cost</th>
                            <th className="px-2 py-1.5 text-right">Retainage</th>
                            <th className="px-2 py-1.5">Check #</th>
                            <th className="px-2 py-1.5">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.aia_detail_rows.map((d, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1.5">{d.vendor || "—"}</td>
                              <td className="px-2 py-1.5">{d.invoice || "—"}</td>
                              <td className="px-2 py-1.5">{d.aia_item || "—"}</td>
                              <td className="px-2 py-1.5">{d.cost_type || "—"}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(d.cost)}</td>
                              <td className="px-2 py-1.5 text-right">{formatCurrency(d.retainage)}</td>
                              <td className="px-2 py-1.5">{d.check || "—"}</td>
                              <td className="px-2 py-1.5">{d.date || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Approval panel */}
              <div className="space-y-3">
                <div className="text-sm font-medium">Approval chain</div>
                {APPROVER_ROLES.map((role) => {
                  const a = approvalFor(role.key);
                  const status = a?.status ?? "Pending";
                  const Icon = status === "Approved" ? CheckCircle2 : status === "Rejected" ? XCircle : Clock;
                  const color = status === "Approved" ? "text-green-600" : status === "Rejected" ? "text-red-600" : "text-muted-foreground";
                  return (
                    <div key={role.key} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{role.label}</div>
                          <div className="text-xs text-muted-foreground">{nameFor(a?.approver_id ?? null)}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClasses(status === "Pending" ? "Pending Review" : status)}`}>{status}</Badge>
                      </div>
                      {a?.decided_at && (
                        <div className="text-xs text-muted-foreground">
                          {status} {format(new Date(a.decided_at), "MMM d, yyyy p")}{a.notes ? ` — ${a.notes}` : ""}
                        </div>
                      )}

                      {canActOn(a) && pending?.role !== role.key && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5 h-8"
                            onClick={() => decide(role.key, "Approved", "")} disabled={saving}>
                            <CheckCircle2 className="h-3.5 w-3.5" />Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1.5 h-8"
                            onClick={() => { setPending({ role: role.key, kind: "reject" }); setActionNotes(""); }} disabled={saving}>
                            <XCircle className="h-3.5 w-3.5" />Reject
                          </Button>
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8"
                            onClick={() => { setMoreInfoOpen(true); setActionNotes(""); }} disabled={saving}>
                            <MessageCircle className="h-3.5 w-3.5" />Request More Info
                          </Button>
                        </div>
                      )}

                      {pending?.role === role.key && pending.kind === "reject" && (
                        <div className="space-y-2 pt-1">
                          <Textarea rows={2} value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="Reason for rejection (required)" />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPending(null)}>Cancel</Button>
                            <Button variant="destructive" size="sm" onClick={() => decide(role.key, "Rejected", actionNotes)} disabled={saving}>Confirm reject</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {moreInfoOpen && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <div className="text-xs font-medium">Request more info from the submitter</div>
                    <Textarea rows={2} value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="What additional info is needed?" />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setMoreInfoOpen(false)}>Cancel</Button>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={requestMoreInfo} disabled={saving}>Send request</Button>
                    </div>
                  </div>
                )}

                {approvals.length === 0 && (
                  <div className="text-xs text-muted-foreground">No approval chain on this invoice. Assign approvers in Project Info and re-upload.</div>
                )}
              </div>

              {invoice.type === "Hard Cost — GC Draw" && (
                <LienWaiverPanel
                  invoiceId={invoice.id}
                  invoiceLabel={invoice.invoice_number || format(new Date(invoice.invoice_date ?? invoice.submitted_at), "MM/dd/yyyy")}
                  vendorName={invoice.vendor_name ?? ""}
                  projectId={invoice.project_id ?? ""}
                  lienableAmount={invoice.lienable_amount}
                  onLienableAmountChange={async (amount) => {
                    const { error } = await supabase.from("invoices").update({ lienable_amount: amount }).eq("id", invoice.id);
                    if (error) { toast.error(error.message); return; }
                    setInvoice({ ...invoice, lienable_amount: amount });
                  }}
                />
              )}

              <Separator />

              {/* Comments */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Comments</div>
                <div className="space-y-1.5">
                  {comments.length === 0 && <div className="text-xs text-muted-foreground">No comments yet.</div>}
                  {comments.map((c) => (
                    <div key={c.id} className="text-xs border rounded p-2 bg-muted/30">
                      <div className="font-medium">{c.author_name || "—"} <span className="text-muted-foreground font-normal">· {format(new Date(c.created_at), "MMM d, p")}</span></div>
                      <div className="whitespace-pre-wrap">{c.body}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea rows={2} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" className="text-xs" />
                  <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>Post</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
