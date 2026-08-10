import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Same designated super-admin list as bootstrap-admin. Only these accounts
// may delete a team member's account entirely.
const SUPER_ADMIN_EMAILS = ["marc.alex.beatty@gmail.com", "alex@witnessinv.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    if (!SUPER_ADMIN_EMAILS.includes((caller.email ?? "").toLowerCase())) {
      return json({ error: "Only super admins can delete accounts." }, 403);
    }

    const { userId } = await req.json();
    if (!userId) return json({ error: "Missing userId." }, 400);

    if (userId === caller.id) {
      return json({ error: "You can't delete your own account." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    await admin.from("organization_members").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
