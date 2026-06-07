import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("Intuit_ID");
    const clientSecret = Deno.env.get("Intuit_Secret");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "QuickBooks credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, realm_id } = await req.json();
    if (!code || !realm_id) {
      return new Response(JSON.stringify({ error: "Missing code or realm_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectUri = "https://innsights.vercel.app/quickbooks-callback";

    // Exchange authorization code for tokens
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange error:", tokenData);
      return new Response(JSON.stringify({ error: "Failed to exchange token" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company info
    let companyName = "";
    try {
      const companyRes = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realm_id}/companyinfo/${realm_id}?minorversion=65`,
        {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "Accept": "application/json",
          },
        }
      );
      const companyData = await companyRes.json();
      companyName = companyData?.CompanyInfo?.CompanyName || "";
    } catch (e) {
      console.error("Failed to fetch company name:", e);
    }

    // Get org_id
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: orgMember } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!orgMember?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Upsert connection (one per org)
    const { data: existing } = await adminClient
      .from("quickbooks_connections")
      .select("id")
      .eq("org_id", orgMember.organization_id)
      .limit(1);

    if (existing && existing.length > 0) {
      await adminClient.from("quickbooks_connections").update({
        realm_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        company_name: companyName,
        updated_at: new Date().toISOString(),
      }).eq("id", existing[0].id);
    } else {
      await adminClient.from("quickbooks_connections").insert({
        org_id: orgMember.organization_id,
        realm_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        company_name: companyName,
      });
    }

    return new Response(JSON.stringify({ success: true, company_name: companyName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
