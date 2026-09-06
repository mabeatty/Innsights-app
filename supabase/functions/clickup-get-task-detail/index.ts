import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sanitizeToken = (value: unknown) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

// Fetches a single task's full detail — description, subtasks, and
// dependencies — for the task detail panel. The bulk list-fetch
// (fetch-clickup-tasks) intentionally stays lean (name/status/due/assignees
// only) since a list can have 50+ tasks; this is called on-demand only when
// a person actually opens one task, so the per-task cost of the fuller
// ClickUp response is paid once, not multiplied across the whole list.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { task_id, org_id } = await req.json();
    if (!task_id || typeof task_id !== "string") return json({ ok: false, error: "task_id is required" });
    if (!org_id) return json({ ok: false, error: "org_id is required" });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await supabaseAdmin
      .from("integrations")
      .select("value")
      .eq("org_id", org_id)
      .eq("integration_key", "clickup_token")
      .maybeSingle();
    const token = sanitizeToken(data?.value);

    if (!token) {
      return json({ ok: false, error: "ClickUp is not connected. Add your ClickUp API token in Settings → Integrations to sync tasks." });
    }

    // include_subtasks=true is required for the subtasks array to be
    // populated on this endpoint (unlike `parent`, which is always present).
    const resp = await fetch(`https://api.clickup.com/api/v2/task/${task_id}?include_subtasks=true`, {
      headers: { Authorization: token, "Content-Type": "application/json" },
    });

    const rawBody = await resp.text();
    if (!resp.ok) {
      console.log("[clickup-get-task-detail] ClickUp response", { status: resp.status, body: rawBody });
      let clickUpError = `ClickUp API error: ${resp.status} ${resp.statusText}`;
      try {
        const errorData = rawBody ? JSON.parse(rawBody) : null;
        if (errorData?.err) clickUpError = `ClickUp API error: ${errorData.err}`;
        else if (errorData?.message) clickUpError = `ClickUp API error: ${errorData.message}`;
      } catch { /* ignore non-JSON */ }
      return json({ ok: false, error: clickUpError });
    }

    const t = JSON.parse(rawBody);

    // Dependencies come back as {task_id, depends_on, type} link records,
    // not full task objects — resolve each into a name/status by fetching
    // the linked task. Best-effort: if one lookup fails, that dependency is
    // dropped from the list rather than failing the whole detail load.
    const dependencyLinks: { task_id: string; depends_on: string; type: number }[] = t.dependencies || [];
    const dependencies = (
      await Promise.all(
        dependencyLinks.map(async (dep) => {
          // type 1 = waiting on (this task depends on the other); type 0 = blocking (this task blocks the other)
          const otherId = dep.task_id === t.id ? dep.depends_on : dep.task_id;
          const relation = dep.task_id === t.id ? "waiting_on" : "blocking";
          try {
            const depResp = await fetch(`https://api.clickup.com/api/v2/task/${otherId}`, {
              headers: { Authorization: token, "Content-Type": "application/json" },
            });
            if (!depResp.ok) return null;
            const depTask = await depResp.json();
            return {
              id: depTask.id,
              name: depTask.name,
              status: { name: depTask.status?.status || "unknown", color: depTask.status?.color || "#808080" },
              relation,
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);

    return json({
      ok: true,
      task: {
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        status: { name: t.status?.status || "unknown", color: t.status?.color || "#808080" },
        due_date: t.due_date ? Number(t.due_date) : null,
        parent: t.parent || null,
        url: t.url,
        assignees: (t.assignees || []).map((a: any) => ({
          id: a.id, username: a.username, initials: a.initials, profilePicture: a.profilePicture, color: a.color,
        })),
        subtasks: (t.subtasks || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          status: { name: s.status?.status || "unknown", color: s.status?.color || "#808080" },
          due_date: s.due_date ? Number(s.due_date) : null,
        })),
        dependencies,
      },
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
