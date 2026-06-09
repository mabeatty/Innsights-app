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
export const TREASURY_DEFAULT_KEY = "default_treasury_approver";

interface Props {
  projectId: string;
}

/**
 * "Invoice Approvers" section for Project Info. Three dropdowns (Project Manager,
 * Treasury, Project Lead), each listing org members. Treasury pre-fills from the
 * org-wide default set in Settings; PM and Project Lead vary per project.
 * Saves to the project_approvers table (one row per project per role).
 */
export function ProjectApprovers({ projectId }: Props) {
  const { organizationId, accessLevel } = useAuth();
  const { members } = useTeamMembers();
  const [assignments, setAssignments] = useState<Record<ApproverRole, string>>({
    project_manager: "",
    treasury: "",
    project_lead: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = accessLevel === "admin" || accessLevel === "edit";

  useEffect(() => {
    (async () => {
      // Existing per-project assignments
      const { data: rows } = await supabase
        .from("project_approvers")
        .select("role, approver_id")
        .eq("project_id", projectId);

      const next: Record<ApproverRole, string> = { project_manager: "", treasury: "", project_lead: "" };
      (rows ?? []).forEach((r) => {
        next[r.role as ApproverRole] = r.approver_id ?? "";
      });

      // Pre-fill Treasury from the org-wide default if not set for this project
      if (!next.treasury && organizationId) {
        const { data: def } = await supabase
          .from("integrations")
          .select("value")
          .eq("org_id", organizationId)
          .eq("integration_key", TREASURY_DEFAULT_KEY)
          .maybeSingle();
        if (def?.value) next.treasury = def.value;
      }

      setAssignments(next);
      setLoaded(true);
    })();
  }, [projectId, organizationId]);

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
        Invoices for this project route to these three approvers. Treasury defaults to your organization-wide
        setting (Settings → Team) and can be overridden here.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
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
