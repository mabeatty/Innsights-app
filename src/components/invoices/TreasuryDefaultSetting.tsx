import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { TREASURY_DEFAULT_KEY } from "./ProjectApprovers";

const UNASSIGNED = "__unassigned__";

/**
 * Organization-wide default Treasury approver. Stored in the integrations table
 * (org_id, integration_key='default_treasury_approver'). New/edited projects
 * pre-fill their Treasury approver from this value.
 */
export function TreasuryDefaultSetting() {
  const { organizationId, accessLevel } = useAuth();
  const { members } = useTeamMembers();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const canEdit = accessLevel === "admin";

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("integrations")
      .select("value")
      .eq("org_id", organizationId)
      .eq("integration_key", TREASURY_DEFAULT_KEY)
      .maybeSingle()
      .then(({ data }) => {
        setValue(data?.value ?? "");
        setLoaded(true);
      });
  }, [organizationId]);

  const handleChange = async (v: string) => {
    const newVal = v === UNASSIGNED ? "" : v;
    setValue(newVal);
    if (!organizationId) return;
    const { error } = await supabase
      .from("integrations")
      .upsert(
        { org_id: organizationId, integration_key: TREASURY_DEFAULT_KEY, value: newVal },
        { onConflict: "org_id,integration_key" },
      );
    if (error) toast.error("Failed to save Treasury default.");
    else toast.success("Default Treasury approver saved.");
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Default Treasury Approver</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-w-sm">
        <Label className="text-xs text-muted-foreground">
          Applied as the Treasury approver on every project's invoice approval chain (can be overridden per project).
        </Label>
        <Select value={value || UNASSIGNED} onValueChange={handleChange} disabled={!canEdit}>
          <SelectTrigger><SelectValue placeholder="Select approver" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
