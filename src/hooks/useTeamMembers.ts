import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
}

/**
 * Loads all members of the caller's organization (user_id, display name, email)
 * via the get-team-activity edge function. Used to populate approver dropdowns.
 */
export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("get-team-activity");
        const rows = (data?.activity ?? []) as Array<{
          user_id: string;
          email?: string;
          first_name?: string;
          last_name?: string;
        }>;
        const mapped: TeamMember[] = rows.map((r) => {
          const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
          return {
            user_id: r.user_id,
            email: r.email ?? "",
            name: name || r.email || "Unknown member",
          };
        });
        if (!cancelled) setMembers(mapped);
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { members, loading };
}
