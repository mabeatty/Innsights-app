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
      toast.success("Invoice approvers saved.");
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

