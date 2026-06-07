import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Invoice, formatCurrency } from "./types";

interface TeamMember { id: string; user_id: string | null; email: string | null; full_name: string | null }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: Invoice;
  onRouted: () => void;
}

export default function RouteForPaymentModal({ open, onOpenChange, invoice, onRouted }: Props) {
  const { user, organizationId } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    (async () => {
      const { data: rows } = await supabase
        .from("organization_members")
        .select("id, user_id")
        .eq("organization_id", organizationId);
      const userIds = (rows ?? []).map((r) => r.user_id).filter(Boolean) as string[];
      const [{ data: emailRes }, { data: profiles }] = await Promise.all([
        supabase.functions.invoke("get-team-emails", { body: { userIds } }).catch(() => ({ data: null as any })),
        supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      ]);
      const emailMap: Record<string, string> = (emailRes as any)?.emails ?? {};
      const nameMap: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => {
        const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        if (p.user_id && n) nameMap[p.user_id] = n;
      });
      setMembers((rows ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        email: r.user_id ? emailMap[r.user_id] ?? null : null,
        full_name: r.user_id ? nameMap[r.user_id] ?? null : null,
      })));
    })();
    setSelected(""); setNotes("");
  }, [open, organizationId]);


  const handleSend = async () => {
    const member = members.find((m) => m.id === selected);
    if (!member?.email) return toast.error("Select a treasury team member with an email.");
    setSending(true);
    try {
      const amt = invoice.partial_approved_amount ?? invoice.amount;
      const projName = invoice.projects?.name || "Project";
      await supabase.functions.invoke("send-invoice-email", {
        body: {
          to: member.email,
          subject: `Invoice ready for payment: ${invoice.vendor_name} · ${invoice.invoice_number}`,
          html: `<p>The following invoice has been approved and routed to you for payment.</p>
                 <ul>
                   <li>Project: <b>${projName}</b></li>
                   <li>Vendor: ${invoice.vendor_name ?? "—"}</li>
                   <li>Invoice #: ${invoice.invoice_number ?? "—"}</li>
                   <li>Approved Amount: <b>${formatCurrency(amt)}</b></li>
                 </ul>
                 ${notes ? `<p><b>Notes:</b><br>${notes.replace(/\n/g, "<br>")}</p>` : ""}`,
          attachPdfPath: invoice.pdf_path,
        },
      });

      const { error } = await supabase.from("invoices").update({
        status: "Routed for Payment",
        routed_to: member.id,
        routed_to_email: member.email,
        routed_at: new Date().toISOString(),
      }).eq("id", invoice.id);
      if (error) throw error;

      await supabase.from("invoice_audit_trail").insert({
        invoice_id: invoice.id,
        action: "Routed for Payment",
        performed_by: user?.id,
        performed_by_name: user?.email,
        notes: `Sent to ${member.full_name || member.email}${notes ? ` — ${notes}` : ""}`,
      });

      toast.success("Routed for payment.");
      onOpenChange(false);
      onRouted();
    } catch (e: any) {
      toast.error(e?.message || "Failed to route invoice.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Route for Payment</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Treasury team member</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Select recipient" /></SelectTrigger>
              <SelectContent>
                {members.filter(m => m.email).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !selected}>{sending ? "Sending…" : "Send"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
