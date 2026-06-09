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

// Treasury is a global per-user profile flag (profiles.is_treasury). Only
// Project Manager and Project Lead are assigned per project here.
const PROJECT_ROLES = APPROVER_ROLES.filter((r) => r.key !== "treasury");

interface Props {
  projectId: string;
}

/**
 * "Invoice Approvers" section for Project Info. Two dropdowns (Project Manager,
 * Project Lead), each listing org members, saved to project_approvers. The
 * Treasury approver is set globally via the user-profile checkbox.
 */
export function ProjectApprovers({ projectId }: Props) {
  const { accessLevel } = useAuth();
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
      const { data: rows } = await supabase
        .from("project_approvers")
        .select("role, approver_id")
        .eq("project_id", projectId);

      const next: Record<ApproverRole, string> = { project_manager: "", treasury: "", project_lead: "" };
      (rows ?? []).forEach((r) => {
        next[r.role as ApproverRole] = r.approver_id ?? "";
      });

      setAssignments(next);
      setLoaded(true);
    })();
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = PROJECT_ROLES.map((r) => ({
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
        Invoices for this project route to the Project Manager and Project Lead below, plus the global
        Treasury approver (set via each user's profile).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {PROJECT_ROLES.map((role) => (
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
