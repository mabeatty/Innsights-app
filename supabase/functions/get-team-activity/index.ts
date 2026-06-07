import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify calling user
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller's org
    const { data: callerOrg } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!callerOrg) {
      return new Response(JSON.stringify({ activity: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all org members
    const { data: orgMembers } = await adminClient
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", callerOrg.organization_id);

    const userIds = (orgMembers ?? []).map((m) => m.user_id).filter(Boolean) as string[];

    // Get profiles for names
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p])
    );

    // Get auth user data for last sign in
    const activity = [];
    for (const uid of userIds) {
      const { data: { user: u } } = await adminClient.auth.admin.getUserById(uid);
      const profile = profileMap.get(uid);
      if (u) {
        activity.push({
          user_id: uid,
          email: u.email ?? "",
          first_name: profile?.first_name ?? "",
          last_name: profile?.last_name ?? "",
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
    }

    return new Response(JSON.stringify({ activity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
