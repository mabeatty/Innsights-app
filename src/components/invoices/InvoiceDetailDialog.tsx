import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, Clock, MessageCircle, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { createNotifications } from "@/lib/notify";
import {
  Invoice, InvoiceApproval, ApproverRole, APPROVER_ROLES,
  statusBadgeClasses, formatCurrency,
} from "./types";

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
  const [approvals, setApprovals] = useState<InvoiceApproval[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [pending, setPending] = useState<null | { role: ApproverRole; kind: "reject" | "approve" }>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = accessLevel === "admin";
  const nameFor = (id: string | null) =>
    !id ? "Unassigned" : members.find((m) => m.user_id === id)?.name ?? "Unknown member";
  const myName = members.find((m) => m.user_id === user?.id)?.name ?? user?.email ?? "A teammate";

  const load = useCallback(async () => {
    if (!invoiceId) return;
    const [{ data: inv }, { data: appr }, { data: c }] = await Promise.all([
      supabase.from("invoices").select("*, projects(id, name)").eq("id", invoiceId).single(),
      supabase.from("invoice_approvals").select("*").eq("invoice_id", invoiceId),
      supabase.from("invoice_comments").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ]);
    setInvoice(inv as Invoice);
    setApprovals((appr as InvoiceApproval[]) ?? []);
    setComments((c as Comment[]) ?? []);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!invoiceId) { setPending(null); setMoreInfoOpen(false); setActionNotes(""); } }, [invoiceId]);

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

  if (!invoiceId) return null;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-3">
            <span>{invoice?.vendor_name || "Invoice"}</span>
            {invoice && <Badge className={statusBadgeClasses(invoice.status)} variant="outline">{invoice.status}</Badge>}
            {invoice?.source === "email" && <Badge variant="outline" className="gap-1 text-[10px]"><Mail className="h-2.5 w-2.5" />Via Email</Badge>}
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="grid grid-cols-1 md:grid-cols-2 h-[80vh] overflow-hidden">
            {/* Left: PDF preview */}
            <div className="bg-muted/30 border-r flex flex-col">
              {invoice.pdf_url ? (
                <iframe src={invoice.pdf_url} className="w-full h-full" title="Invoice PDF" />
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
            <div className="overflow-y-auto p-5 space-y-5">
              {/* Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Project:</span><br/>{invoice.projects?.name || "—"}</div>
                <div><span className="text-muted-foreground">Cost type:</span><br/>{(invoice as any).cost_type || "—"}</div>
                <div><span className="text-muted-foreground">Invoice #:</span><br/>{invoice.invoice_number || "—"}</div>
                <div><span className="text-muted-foreground">Invoice date:</span><br/>{invoice.invoice_date ? format(new Date(invoice.invoice_date), "MMM d, yyyy") : "—"}</div>
                <div><span className="text-muted-foreground">Amount:</span><br/>{formatCurrency(invoice.amount)}</div>
                <div><span className="text-muted-foreground">Budget line:</span><br/>{invoice.budget_line_item || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Submitted by:</span><br/>{invoice.submitted_by_email || "—"} · {format(new Date(invoice.submitted_at), "MMM d, yyyy")}</div>
                {invoice.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span><br/>{invoice.notes}</div>}
              </div>

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

              <Separator />

              {/* Comments */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Comments</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
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
