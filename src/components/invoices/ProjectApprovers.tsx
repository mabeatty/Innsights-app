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

      // Remove any project_approvers row for a role that no longer exists
      // in APPROVER_ROLES at all (e.g. Treasury, retired when the approval
      // chain was simplified to PM + Lead) — not just roles left unassigned
      // on this project. A role can only be "stale" at the schema level,
      // not per-project, so this checks against the full APPROVER_ROLES
      // list rather than anything project-specific.
      const currentRoleKeys = APPROVER_ROLES.map((r) => r.key);
      const { data: allApproverRows } = await supabase
        .from("project_approvers")
        .select("role")
        .eq("project_id", projectId);
      const staleRoles = Array.from(new Set((allApproverRows ?? []).map((r: any) => r.role))).filter(
        (role) => !currentRoleKeys.includes(role as ApproverRole)
      );
      if (staleRoles.length > 0) {
        await supabase.from("project_approvers").delete().eq("project_id", projectId).in("role", staleRoles);
      }

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

      // Stale-role cleanup on existing invoices: a role removed from
      // APPROVER_ROLES (like Treasury) can leave orphaned Pending steps on
      // invoices that were submitted while that role was still part of the
      // chain — that step can never be actioned by anyone since nobody is
      // assigned to a role that no longer exists anywhere in the system,
      // so the invoice sits stuck on "In Approval" forever even after every
      // real (current) role has approved it. Delete those orphaned steps,
      // then recalculate status for any invoice where that was blocking it.
      let staleStepsCleared = 0;
      if (staleRoles.length > 0 && invoiceIds.length > 0) {
        const { data: deletedSteps, error: staleErr } = await supabase
          .from("invoice_approvals")
          .delete()
          .in("invoice_id", invoiceIds)
          .in("approver_role", staleRoles)
          .select("id, invoice_id");
        if (staleErr) {
          console.error("[ProjectApprovers stale-role cleanup] failed:", staleErr);
        } else if (deletedSteps && deletedSteps.length > 0) {
          staleStepsCleared = deletedSteps.length;
          const affectedInvoiceIds = Array.from(new Set(deletedSteps.map((s: any) => s.invoice_id)));
          // For each affected invoice, check whether every remaining step is
          // Approved — if so, the invoice itself should now read Approved
          // instead of being stuck on "In Approval" behind a role that no
          // longer exists.
          const { data: remainingSteps } = await supabase
            .from("invoice_approvals")
            .select("invoice_id, status")
            .in("invoice_id", affectedInvoiceIds);
          const stepsByInvoice = new Map<string, string[]>();
          (remainingSteps ?? []).forEach((s: any) => {
            if (!stepsByInvoice.has(s.invoice_id)) stepsByInvoice.set(s.invoice_id, []);
            stepsByInvoice.get(s.invoice_id)!.push(s.status);
          });
          const invoicesToApprove = affectedInvoiceIds.filter((id) => {
            const steps = stepsByInvoice.get(id) ?? [];
            return steps.length > 0 && steps.every((s) => s === "Approved");
          });
          if (invoicesToApprove.length > 0) {
            await supabase
              .from("invoices")
              .update({ status: "Approved" })
              .in("id", invoicesToApprove)
              .eq("status", "In Approval");
          }
        }
      }

      const messages = [
        backfilledCount > 0 ? `${backfilledCount} existing pending invoice${backfilledCount === 1 ? "" : "s"} updated to reflect the new assignment` : null,
        staleStepsCleared > 0 ? `${staleStepsCleared} stale approval step${staleStepsCleared === 1 ? "" : "s"} cleared from retired role${staleRoles.length === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      toast.success(messages.length > 0 ? `Invoice approvers saved — ${messages.join("; ")}.` : "Invoice approvers saved.");
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

