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

// Updates an existing ClickUp task's status, due date, and/or assignees —
// the write-side counterpart to fetch-clickup-tasks, letting the Tasks tab
// actually manage the board instead of just displaying it.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { task_id, org_id, status, due_date, add_assignees, remove_assignees, name } = await req.json();
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

    // ClickUp's PUT /task/{id} takes a flat body of only the fields being
    // changed. due_date is epoch milliseconds; assignees change via an
    // { add, rem } object (never a plain replacement array, to avoid
    // accidentally dropping assignees the caller doesn't know about).
    const body: Record<string, unknown> = {};
    if (typeof name === "string") body.name = name;
    if (typeof status === "string") body.status = status;
    if (due_date !== undefined) body.due_date = due_date === null ? null : Number(due_date);
    if (add_assignees || remove_assignees) {
      body.assignees = { add: add_assignees ?? [], rem: remove_assignees ?? [] };
    }

    if (Object.keys(body).length === 0) {
      return json({ ok: false, error: "No fields to update." });
    }

    const resp = await fetch(`https://api.clickup.com/api/v2/task/${task_id}`, {
      method: "PUT",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawBody = await resp.text();
    if (!resp.ok) {
      console.log("[clickup-update-task] ClickUp response", { status: resp.status, body: rawBody });
      let clickUpError = `ClickUp API error: ${resp.status} ${resp.statusText}`;
      try {
        const errorData = rawBody ? JSON.parse(rawBody) : null;
        if (errorData?.err) clickUpError = `ClickUp API error: ${errorData.err}`;
        else if (errorData?.message) clickUpError = `ClickUp API error: ${errorData.message}`;
      } catch { /* ignore non-JSON */ }
      return json({ ok: false, error: clickUpError });
    }

    const updated = JSON.parse(rawBody);
    return json({
      ok: true,
      task: {
        id: updated.id,
        name: updated.name,
        status: { name: updated.status?.status || "unknown", color: updated.status?.color || "#808080" },
        due_date: updated.due_date ? Number(updated.due_date) : null,
        assignees: (updated.assignees || []).map((a: any) => ({
          id: a.id, username: a.username, initials: a.initials, profilePicture: a.profilePicture, color: a.color,
        })),
        tags: (updated.tags || []).map((t: any) => ({ name: t.name, tag_bg: t.tag_bg, tag_fg: t.tag_fg })),
      },
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
