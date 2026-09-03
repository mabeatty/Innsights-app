import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { APPROVER_ROLES, ApproverRole } from "./types";

const UNASSIGNED = "__unassigned__";

interface Props {
  projectId: string;
}

/**
 * "Invoice Approvers" section for Project Info. Two dropdowns (Project Manager,
 * Project Lead), each listing org members, saved to project_approvers. These
 * are the only two approvers in the chain — a transaction/invoice needs both
 * to sign off before it becomes a formal AIA transaction.
 */
export function ProjectApprovers({ projectId }: Props) {
  const { accessLevel } = useAuth();
  const { members } = useTeamMembers();
  const [assignments, setAssignments] = useState<Record<ApproverRole, string>>({
    project_manager: "",
    project_lead: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = accessLevel === "admin" || accessLevel === "edit";

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("project_approvers")
        .select("role, approver_id")
        .eq("project_id", projectId);

      const next: Record<ApproverRole, string> = { project_manager: "", project_lead: "" };
      (rows ?? []).forEach((r) => {
        if (r.role === "project_manager" || r.role === "project_lead") {
          next[r.role as ApproverRole] = r.approver_id ?? "";
        }
      });

      setAssignments(next);
      setLoaded(true);
    })();
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = APPROVER_ROLES.map((r) => ({
        project_id: projectId,
        role: r.key,
        approver_id: assignments[r.key] || null,
      }));
      const { error } = await supabase
        .from("project_approvers")
        .upsert(rows, { onConflict: "project_id,role" });
      if (error) throw error;
      // Clear out any legacy Treasury row for this project so it can't
      // silently keep gating an approval — Treasury is no longer part of
      // the chain.
      await supabase.from("project_approvers").delete().eq("project_id", projectId).eq("role", "treasury");

      // Backfill: any invoice on this project that already exists with a
      // still-pending approval row for a role that had no one assigned yet
      // (approver_id null) needs to pick up the person just assigned —
      // otherwise an invoice uploaded before a PM/Lead was assigned stays
      // permanently unapprovable by anyone but an admin, since the
      // approval-eligibility check compares against approver_id directly,
      // not against project_approvers. Only touches rows still "Pending" —
      // never overwrites a decision that's already been made.
      const { data: projectInvoices, error: invErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("project_id", projectId);
      if (invErr) console.error("[ProjectApprovers backfill] failed to fetch project invoices:", invErr);
      const invoiceIds = (projectInvoices ?? []).map((i) => i.id);
      let backfilledCount = 0;
      const invoicesToPromote = new Set<string>();
      if (invoiceIds.length > 0) {
        for (const r of rows) {
          const newApproverId = r.approver_id;
          if (!newApproverId) continue;
          const { data: updated, error: backfillErr } = await supabase
            .from("invoice_approvals")
            .update({ approver_id: newApproverId })
            .in("invoice_id", invoiceIds)
            .eq("approver_role", r.role)
            .eq("status", "Pending")
            .is("approver_id", null)
            .select("id, invoice_id");
          if (backfillErr) {
            console.error(`[ProjectApprovers backfill] failed for role ${r.role}:`, backfillErr);
            toast.error(`Approvers saved, but backfilling existing invoices failed: ${backfillErr.message}`);
            continue;
          }
          console.log(`[ProjectApprovers backfill] role ${r.role}: matched ${updated?.length ?? 0} row(s)`, updated);
          backfilledCount += updated?.length ?? 0;
          (updated ?? []).forEach((row: any) => invoicesToPromote.add(row.invoice_id));
        }
      }
      // An invoice created before any approver was assigned is stamped
      // "Pending Review" at upload and nothing else ever moves it forward —
      // now that it has a real approver, promote it to "In Approval" so its
      // status reflects reality instead of staying stuck.
      if (invoicesToPromote.size > 0) {
        await supabase
          .from("invoices")
          .update({ status: "In Approval" })
          .in("id", Array.from(invoicesToPromote))
          .eq("status", "Pending Review");
      }

      toast.success(
        backfilledCount > 0
          ? `Invoice approvers saved — ${backfilledCount} existing pending invoice${backfilledCount === 1 ? "" : "s"} updated to reflect the new assignment.`
          : "Invoice approvers saved."
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to save approvers.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Invoice Approvers</h3>
      <p className="text-xs text-muted-foreground -mt-2">
        Invoices for this project route to the Project Manager and Project Lead below — both review and
        approve before a transaction becomes formal for the AIA.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {APPROVER_ROLES.map((role) => (
          <div key={role.key} className="space-y-1.5">
            <Label>{role.label}</Label>
            <Select
              value={assignments[role.key] || UNASSIGNED}
              onValueChange={(v) =>
                setAssignments((prev) => ({ ...prev, [role.key]: v === UNASSIGNED ? "" : v }))
              }
              disabled={!canEdit}
            >
              <SelectTrigger><SelectValue placeholder="Select approver" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {canEdit && (
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save Approvers"}
        </Button>
      )}
    </section>
  );
}

