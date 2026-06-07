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

  try {
    const { list_id, org_id } = await req.json();
    if (!list_id || typeof list_id !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "list_id is required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read token from integrations table
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
      return new Response(JSON.stringify({ ok: false, error: "ClickUp is not connected. Add your ClickUp API token in Settings → Integrations to sync tasks.", diagnostics: { error_stage: "missing_token" } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.clickup.com/api/v2/list/${list_id}/task?include_closed=true&subtasks=true`;
    const resp = await fetch(url, {
      headers: { Authorization: token, "Content-Type": "application/json" },
    });

    if (!resp.ok) {
      let clickUpError = `ClickUp API error: ${resp.status} ${resp.statusText}`;
      const rawBody = await resp.text();
      console.log("[fetch-clickup-tasks] ClickUp response", {
        status: resp.status,
        body: rawBody,
      });
      try {
        const errorData = rawBody ? JSON.parse(rawBody) : null;
        if (errorData?.err) clickUpError = `ClickUp API error: ${errorData.err}`;
        else if (errorData?.message) clickUpError = `ClickUp API error: ${errorData.message}`;
      } catch { /* ignore non-JSON */ }
      return new Response(JSON.stringify({ ok: false, error: clickUpError, diagnostics: { error_stage: "api_call_failed" } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();

    const tasks = (data.tasks || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      status: {
        name: t.status?.status || "unknown",
        color: t.status?.color || "#808080",
      },
      due_date: t.due_date ? Number(t.due_date) : null,
      assignees: (t.assignees || []).map((a: any) => ({
        id: a.id,
        username: a.username,
        initials: a.initials,
        profilePicture: a.profilePicture,
      })),
      tags: (t.tags || []).map((tag: any) => ({
        name: tag.name,
        tag_bg: tag.tag_bg,
        tag_fg: tag.tag_fg,
      })),
    }));

    return new Response(JSON.stringify({ ok: true, tasks }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "Unexpected error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
