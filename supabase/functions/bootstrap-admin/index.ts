import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Designated first/super admins. On their first login (when they have no
// organization membership yet) they are auto-provisioned as an org admin with
// Partner access, so a fresh database never needs manual SQL to get started.
const BOOTSTRAP_EMAILS = ["marc.alex.beatty@gmail.com", "alex@witnessinv.com"];
const DEFAULT_ORG_NAME = "Witness Investments";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify the caller from their JWT.
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Only designated bootstrap emails may self-provision as admin.
    if (!BOOTSTRAP_EMAILS.includes((user.email ?? "").toLowerCase())) {
      return json({ ok: false, reason: "not_bootstrap_user" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Idempotent: if they already have a membership, do nothing.
    const { data: existing } = await admin
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", user.id)
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, alreadyMember: true, organizationId: existing[0].organization_id });
    }

    // Ensure an organization exists (reuse the first one, else create it).
    let organizationId: string;
    const { data: orgs } = await admin.from("organizations").select("id").limit(1);
    if (orgs && orgs.length > 0) {
      organizationId = orgs[0].id;
    } else {
      const { data: newOrg, error: orgErr } = await admin
        .from("organizations")
        .insert({ name: DEFAULT_ORG_NAME })
        .select("id")
        .single();
      if (orgErr || !newOrg) {
        return json({ error: `Failed to create organization: ${orgErr?.message}` }, 500);
      }
      organizationId = newOrg.id;
    }

    // Grant admin + Partner access.
    const { error: memberErr } = await admin.from("organization_members").insert({
      user_id: user.id,
      organization_id: organizationId,
      role: "admin",
      access_level: "admin",
      expense_role: "Partner",
      investment_access: true,
    });
    if (memberErr) {
      return json({ error: `Failed to create membership: ${memberErr.message}` }, 500);
    }

    // Ensure a profile row exists (harmless if one already does).
    await admin.from("profiles").upsert({ user_id: user.id }, { onConflict: "user_id" });

    return json({ ok: true, bootstrapped: true, organizationId });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
