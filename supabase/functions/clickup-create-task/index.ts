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

// Creates a new task directly in a ClickUp list — the "+ New Task" action in
// the Tasks tab, so a task can originate in Innsights without opening ClickUp.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { list_id, org_id, name, status, due_date, assignees } = await req.json();
    if (!list_id || typeof list_id !== "string") return json({ ok: false, error: "list_id is required" });
    if (!org_id) return json({ ok: false, error: "org_id is required" });
    if (!name || typeof name !== "string" || !name.trim()) return json({ ok: false, error: "Task name is required" });

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

    const body: Record<string, unknown> = { name: name.trim() };
    if (typeof status === "string" && status) body.status = status;
    if (due_date) body.due_date = Number(due_date);
    if (Array.isArray(assignees) && assignees.length > 0) body.assignees = assignees;

    const resp = await fetch(`https://api.clickup.com/api/v2/list/${list_id}/task`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawBody = await resp.text();
    if (!resp.ok) {
      console.log("[clickup-create-task] ClickUp response", { status: resp.status, body: rawBody });
      let clickUpError = `ClickUp API error: ${resp.status} ${resp.statusText}`;
      try {
        const errorData = rawBody ? JSON.parse(rawBody) : null;
        if (errorData?.err) clickUpError = `ClickUp API error: ${errorData.err}`;
        else if (errorData?.message) clickUpError = `ClickUp API error: ${errorData.message}`;
      } catch { /* ignore non-JSON */ }
      return json({ ok: false, error: clickUpError });
    }

    const created = JSON.parse(rawBody);
    return json({
      ok: true,
      task: {
        id: created.id,
        name: created.name,
        status: { name: created.status?.status || "unknown", color: created.status?.color || "#808080" },
        due_date: created.due_date ? Number(created.due_date) : null,
        assignees: (created.assignees || []).map((a: any) => ({
          id: a.id, username: a.username, initials: a.initials, profilePicture: a.profilePicture, color: a.color,
        })),
        tags: (created.tags || []).map((t: any) => ({ name: t.name, tag_bg: t.tag_bg, tag_fg: t.tag_fg })),
      },
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
