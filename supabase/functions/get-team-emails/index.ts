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

    // Verify the calling user
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const { userIds } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Response(JSON.stringify({ emails: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller belongs to same org as requested users
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    
    // Get caller's org
    const { data: callerOrg } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!callerOrg) {
      return new Response(JSON.stringify({ emails: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only return emails for users in the same org
    const { data: orgMembers } = await adminClient
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", callerOrg.organization_id)
      .in("user_id", userIds);

    const allowedIds = (orgMembers ?? []).map((m) => m.user_id).filter(Boolean) as string[];

    const emails: Record<string, string> = {};
    for (const uid of allowedIds) {
      const { data: { user: u } } = await adminClient.auth.admin.getUserById(uid);
      if (u?.email) emails[uid] = u.email;
    }

    return new Response(JSON.stringify({ emails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
