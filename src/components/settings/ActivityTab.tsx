import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface UserActivity {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  last_sign_in_at: string | null;
}

export default function ActivityTab() {
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase.functions.invoke("get-team-activity", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!error && data?.activity) {
          setActivity(
            data.activity.sort((a: UserActivity, b: UserActivity) => {
              if (!a.last_sign_in_at) return 1;
              if (!b.last_sign_in_at) return -1;
              return new Date(b.last_sign_in_at).getTime() - new Date(a.last_sign_in_at).getTime();
            })
          );
        }
      } finally {
        setLoading(false);
      }
    }
    fetchActivity();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading activity…</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">User Activity</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Last Login</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activity.map((u) => (
            <TableRow key={u.user_id}>
              <TableCell className="font-medium">
                {u.first_name || u.last_name
                  ? `${u.first_name} ${u.last_name}`.trim()
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell className="text-muted-foreground">
                {u.last_sign_in_at
                  ? format(new Date(u.last_sign_in_at), "MMM d, yyyy h:mm a")
                  : "Never"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
