import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, MessageCircle, Split, Send, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Invoice, statusBadgeClasses, formatCurrency, APPROVER_EMAIL } from "./types";
import RouteForPaymentModal from "./RouteForPaymentModal";

interface Audit { id: string; action: string; performed_by_name: string | null; notes: string | null; created_at: string }
interface Comment { id: string; author_name: string | null; body: string; created_at: string; author_id: string | null }

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  onChange: () => void;
}

export default function InvoiceDetailDialog({ invoiceId, onClose, onChange }: Props) {
  const { user, accessLevel } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [pendingAction, setPendingAction] = useState<null | "approve" | "reject" | "more_info" | "partial">(null);
  const [actionInput, setActionInput] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

  const canApprove = accessLevel === "admin"; // designated approver = admin

  const load = useCallback(async () => {
    if (!invoiceId) return;
    const [{ data: inv }, { data: a }, { data: c }] = await Promise.all([
      supabase.from("invoices").select("*, projects(id, name)").eq("id", invoiceId).single(),
      supabase.from("invoice_audit_trail").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
      supabase.from("invoice_comments").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ]);
    setInvoice(inv as Invoice);
    setAudit((a as Audit[]) ?? []);
    setComments((c as Comment[]) ?? []);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!invoiceId) { setPendingAction(null); setActionInput(""); setActionAmount(""); } }, [invoiceId]);

  const recordAudit = async (action: string, notes?: string) => {
    if (!invoiceId) return;
    await supabase.from("invoice_audit_trail").insert({
      invoice_id: invoiceId,
      action,
      performed_by: user?.id,
      performed_by_name: user?.email,
      notes: notes || null,
    });
  };

  const notifySubmitter = async (subject: string, body: string) => {
    if (!invoice?.submitted_by_email) return;
    await supabase.functions.invoke("send-invoice-email", {
      body: { to: invoice.submitted_by_email, subject, html: body },
    }).catch(() => {});
  };

  const commit = async () => {
    if (!invoice || !pendingAction) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      let update: any = { approved_by: user?.id, approved_at: now };
      let auditAction = "";
      let emailSubject = "";
      let emailBody = "";

      if (pendingAction === "approve") {
        update.status = "Approved";
        update.rejection_reason = null;
        update.more_info_request = null;
        auditAction = "Approved";
        emailSubject = `Invoice approved: ${invoice.vendor_name} · ${invoice.invoice_number}`;
        emailBody = `<p>Your invoice has been <b>approved</b>.</p>`;
      } else if (pendingAction === "reject") {
        if (!actionInput.trim()) { toast.error("Rejection reason required."); setSaving(false); return; }
        update.status = "Rejected";
        update.rejection_reason = actionInput.trim();
        auditAction = "Rejected";
        emailSubject = `Invoice rejected: ${invoice.vendor_name} · ${invoice.invoice_number}`;
        emailBody = `<p>Your invoice has been <b>rejected</b>.</p><p><b>Reason:</b> ${actionInput.trim()}</p>`;
      } else if (pendingAction === "more_info") {
        if (!actionInput.trim()) { toast.error("Describe what's needed."); setSaving(false); return; }
        update.status = "More Info Requested";
        update.more_info_request = actionInput.trim();
        auditAction = "More Info Requested";
        emailSubject = `More info needed: ${invoice.vendor_name} · ${invoice.invoice_number}`;
        emailBody = `<p>The approver requested more information:</p><p>${actionInput.trim()}</p>`;
      } else if (pendingAction === "partial") {
        const amt = Number(actionAmount);
        if (!amt || amt <= 0) { toast.error("Enter the approved amount."); setSaving(false); return; }
        update.status = "Partially Approved";
        update.partial_approved_amount = amt;
        auditAction = `Partially Approved (${formatCurrency(amt)})`;
        emailSubject = `Invoice partially approved: ${invoice.vendor_name} · ${invoice.invoice_number}`;
        emailBody = `<p>Your invoice has been <b>partially approved</b> for ${formatCurrency(amt)}.</p>`;
      }

      const { error } = await supabase.from("invoices").update(update).eq("id", invoice.id);
      if (error) throw error;
      await recordAudit(auditAction, actionInput || (actionAmount ? `Amount: ${formatCurrency(Number(actionAmount))}` : undefined));
      notifySubmitter(emailSubject, emailBody);
      toast.success(auditAction);
      setPendingAction(null); setActionInput(""); setActionAmount("");
      await load(); onChange();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || !invoiceId) return;
    const { error } = await supabase.from("invoice_comments").insert({
      invoice_id: invoiceId,
      author_id: user?.id,
      author_name: user?.email,
      body: newComment.trim(),
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    load();
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

            {/* Right: details + actions */}
            <div className="overflow-y-auto p-5 space-y-5">
              {/* Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Project:</span><br/>{invoice.projects?.name || "—"}</div>
                <div><span className="text-muted-foreground">Type:</span><br/>{invoice.type || "—"}</div>
                <div><span className="text-muted-foreground">Invoice #:</span><br/>{invoice.invoice_number || "—"}</div>
                <div><span className="text-muted-foreground">Invoice date:</span><br/>{invoice.invoice_date ? format(new Date(invoice.invoice_date), "MMM d, yyyy") : "—"}</div>
                <div><span className="text-muted-foreground">Amount:</span><br/>{formatCurrency(invoice.amount)}</div>
                <div><span className="text-muted-foreground">Approved amount:</span><br/>{formatCurrency(invoice.partial_approved_amount)}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Budget line:</span><br/>{invoice.budget_line_item || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Submitted by:</span><br/>{invoice.submitted_by_email || "—"} · {format(new Date(invoice.submitted_at), "MMM d, yyyy")}</div>
                {invoice.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span><br/>{invoice.notes}</div>}
                {invoice.rejection_reason && <div className="col-span-2"><span className="text-muted-foreground">Rejection reason:</span><br/>{invoice.rejection_reason}</div>}
                {invoice.more_info_request && <div className="col-span-2"><span className="text-muted-foreground">More info requested:</span><br/>{invoice.more_info_request}</div>}
              </div>

              <Separator />

              {/* Actions */}
              {canApprove && invoice.status !== "Routed for Payment" && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Approval actions</div>
                  {!pendingAction && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => setPendingAction("approve")} className="bg-green-600 hover:bg-green-700 text-white gap-1.5"><CheckCircle2 className="h-4 w-4" />Approve</Button>
                      <Button onClick={() => setPendingAction("reject")} variant="destructive" className="gap-1.5"><XCircle className="h-4 w-4" />Reject</Button>
                      <Button onClick={() => setPendingAction("more_info")} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"><MessageCircle className="h-4 w-4" />Request More Info</Button>
                      <Button onClick={() => setPendingAction("partial")} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"><Split className="h-4 w-4" />Partial Approve</Button>
                    </div>
                  )}
                  {pendingAction === "reject" && (
                    <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                      <div className="text-xs font-medium">Reject — reason required</div>
                      <Textarea rows={3} value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="Why is this invoice being rejected?" />
                      <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>Cancel</Button><Button variant="destructive" size="sm" onClick={commit} disabled={saving}>Confirm reject</Button></div>
                    </div>
                  )}
                  {pendingAction === "more_info" && (
                    <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                      <div className="text-xs font-medium">Request more info</div>
                      <Textarea rows={3} value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="What additional info is needed?" />
                      <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>Cancel</Button><Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={commit} disabled={saving}>Send request</Button></div>
                    </div>
                  )}
                  {pendingAction === "partial" && (
                    <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                      <div className="text-xs font-medium">Partial approve — enter approved amount</div>
                      <Input type="number" step="0.01" value={actionAmount} onChange={(e) => setActionAmount(e.target.value)} placeholder="Amount to approve" />
                      <Textarea rows={2} value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="Notes (optional)" />
                      <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>Cancel</Button><Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={commit} disabled={saving}>Confirm partial approve</Button></div>
                    </div>
                  )}
                  {pendingAction === "approve" && (
                    <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                      <div className="text-xs font-medium">Confirm approval for {formatCurrency(invoice.amount)}?</div>
                      <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>Cancel</Button><Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={commit} disabled={saving}>Confirm approve</Button></div>
                    </div>
                  )}
                </div>
              )}

              {/* Post-approval routing */}
              {(invoice.status === "Approved" || invoice.status === "Partially Approved") && canApprove && (
                <Button onClick={() => setRouteOpen(true)} className="gap-1.5 w-full"><Send className="h-4 w-4" />Route for Payment</Button>
              )}

              {invoice.status === "Routed for Payment" && invoice.routed_to_email && (
                <div className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
                  Routed to {invoice.routed_to_email} on {invoice.routed_at ? format(new Date(invoice.routed_at), "MMM d, yyyy") : "—"}
                </div>
              )}

              <Separator />

              {/* Audit trail */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Audit trail</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {audit.length === 0 && <div className="text-xs text-muted-foreground">No history yet.</div>}
                  {audit.map((a) => (
                    <div key={a.id} className="text-xs border-l-2 border-muted pl-2 py-0.5">
                      <div className="font-medium">{a.action}</div>
                      <div className="text-muted-foreground">{a.performed_by_name || "—"} · {format(new Date(a.created_at), "MMM d, yyyy p")}</div>
                      {a.notes && <div className="text-muted-foreground">{a.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Comments */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Internal comments</div>
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

        {invoice && (
          <RouteForPaymentModal
            open={routeOpen}
            onOpenChange={setRouteOpen}
            invoice={invoice}
            onRouted={() => { load(); onChange(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
