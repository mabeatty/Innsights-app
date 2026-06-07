import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const { data: callerMember } = await adminClient
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!callerMember) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, firstName, lastName, expenseRole, supervisorId, investmentAccess, accessLevel } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newUserId: string | undefined;

    // Try to invite first
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName },
    });

    if (inviteError) {
      // If user already exists, look them up and add to org
      if (inviteError.message?.includes("already been registered")) {
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const existingUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (!existingUser) {
          return new Response(JSON.stringify({ error: "User exists but could not be found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        newUserId = existingUser.id;

        // Check if already a member of this org
        const { data: existing } = await adminClient
          .from("organization_members")
          .select("id")
          .eq("user_id", newUserId)
          .eq("organization_id", callerMember.organization_id)
          .limit(1);

        if (existing && existing.length > 0) {
          return new Response(JSON.stringify({ error: "This user is already a member of your organization" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      newUserId = inviteData.user?.id;
    }

    if (!newUserId) {
      return new Response(JSON.stringify({ error: "Failed to resolve user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: memberRow, error: memberError } = await adminClient
      .from("organization_members")
      .insert({
        user_id: newUserId,
        organization_id: callerMember.organization_id,
        role: "member",
        expense_role: expenseRole || "Employee",
        supervisor_id: supervisorId || null,
        investment_access: investmentAccess ?? false,
        access_level: accessLevel || "edit",
      })
      .select("id")
      .single();

    if (memberError) {
      return new Response(JSON.stringify({ error: memberError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, userId: newUserId, memberId: memberRow?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
