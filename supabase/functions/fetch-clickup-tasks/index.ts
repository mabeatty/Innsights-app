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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { list_id, org_id } = await req.json();
    if (!list_id || typeof list_id !== "string") {
      return json({ ok: false, error: "list_id is required" });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let token = "";
    if (org_id) {
      const { data } = await supabaseAdmin
        .from("integrations")
        .select("value")
        .eq("org_id", org_id)
        .eq("integration_key", "clickup_token")
        .maybeSingle();
      token = sanitizeToken(data?.value);
    }

    if (!token) {
      return json({ ok: false, error: "ClickUp is not connected. Add your ClickUp API token in Settings → Integrations to sync tasks.", diagnostics: { error_stage: "missing_token" } });
    }

    const authHeaders = { Authorization: token, "Content-Type": "application/json" };

    // Fetch tasks, the list's own configured statuses (for the status dropdown —
    // ClickUp lists inherit space/folder statuses, and the set + order + color
    // varies per workspace, so this must come from the API rather than being
    // hardcoded), and workspace members (for the assignee dropdown) in parallel.
    const [tasksResp, listResp, membersResp] = await Promise.all([
      fetch(`https://api.clickup.com/api/v2/list/${list_id}/task?include_closed=true&subtasks=true`, { headers: authHeaders }),
      fetch(`https://api.clickup.com/api/v2/list/${list_id}`, { headers: authHeaders }),
      fetch(`https://api.clickup.com/api/v2/list/${list_id}/member`, { headers: authHeaders }),
    ]);

    if (!tasksResp.ok) {
      const rawBody = await tasksResp.text();
      console.log("[fetch-clickup-tasks] ClickUp response", { status: tasksResp.status, body: rawBody });
      let clickUpError = `ClickUp API error: ${tasksResp.status} ${tasksResp.statusText}`;
      try {
        const errorData = rawBody ? JSON.parse(rawBody) : null;
        if (errorData?.err) clickUpError = `ClickUp API error: ${errorData.err}`;
        else if (errorData?.message) clickUpError = `ClickUp API error: ${errorData.message}`;
      } catch { /* ignore non-JSON */ }
      return json({ ok: false, error: clickUpError, diagnostics: { error_stage: "api_call_failed" } });
    }

    const data = await tasksResp.json();

    const tasks = (data.tasks || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      status: {
        name: t.status?.status || "unknown",
        color: t.status?.color || "#808080",
      },
      due_date: t.due_date ? Number(t.due_date) : null,
      // parent drives the outline/tree rendering — subtasks nest under their
      // parent row regardless of which status group the parent is in, same
      // as ClickUp's own list view. subtasks_count/dependencies_count are
      // cheap indicators shown in the row so a real hierarchy or dependency
      // relationship is visible without opening every task's detail.
      parent: t.parent || null,
      subtasks_count: typeof t.subtasks_count === "number" ? t.subtasks_count : 0,
      dependencies_count: typeof t.dependencies_count === "number" ? t.dependencies_count : 0,
      assignees: (t.assignees || []).map((a: any) => ({
        id: a.id,
        username: a.username,
        initials: a.initials,
        profilePicture: a.profilePicture,
        color: a.color,
      })),
      tags: (t.tags || []).map((tag: any) => ({
        name: tag.name,
        tag_bg: tag.tag_bg,
        tag_fg: tag.tag_fg,
      })),
    }));

    // Statuses: best-effort — if this specific call fails, editing is degraded
    // (no dropdown options) but the task list itself still renders, so this
    // doesn't block the main response.
    let statuses: { status: string; color: string; orderindex: number; type: string }[] = [];
    if (listResp.ok) {
      const listData = await listResp.json();
      statuses = (listData.statuses || []).sort((a: any, b: any) => a.orderindex - b.orderindex);
    } else {
      console.log("[fetch-clickup-tasks] list statuses fetch failed", listResp.status, await listResp.text());
    }

    let members: { id: number; username: string; email: string; initials: string; color: string; profilePicture: string | null }[] = [];
    if (membersResp.ok) {
      const memberData = await membersResp.json();
      members = (memberData.members || []).map((m: any) => ({
        id: m.id, username: m.username, email: m.email, initials: m.initials, color: m.color, profilePicture: m.profilePicture,
      }));
    } else {
      console.log("[fetch-clickup-tasks] list members fetch failed", membersResp.status, await membersResp.text());
    }

    return json({ ok: true, tasks, statuses, members });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
