import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshTokenIfNeeded(adminClient: any, connection: any) {
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);
  
  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return connection.access_token;
  }

  const clientId = Deno.env.get("Intuit_ID");
  const clientSecret = Deno.env.get("Intuit_Secret");
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error("Failed to refresh QuickBooks token");
  }

  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  await adminClient.from("quickbooks_connections").update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);

  return tokenData.access_token;
}

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

    const { data: connection } = await adminClient
      .from("quickbooks_connections")
      .select("*")
      .eq("org_id", orgMember.organization_id)
      .limit(1)
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ error: "QuickBooks not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await refreshTokenIfNeeded(adminClient, connection);

    // Fetch Chart of Accounts from QuickBooks using direct REST endpoint
    console.log("Fetching accounts for realm:", connection.realm_id);
    const qbRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}/query?query=${encodeURIComponent("SELECT * FROM Account MAXRESULTS 1000")}&minorversion=65`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
          "Content-Type": "application/text",
        },
      }
    );

    const qbText = await qbRes.text();
    if (!qbRes.ok) {
      console.error("QB API status:", qbRes.status, "response:", qbText);
      return new Response(JSON.stringify({ error: "Failed to fetch accounts from QuickBooks", detail: qbText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qbData = JSON.parse(qbText);
    const qbAccounts = qbData?.QueryResponse?.Account || [];

    // Delete existing CoA for this org and replace with QB accounts
    await adminClient
      .from("chart_of_accounts")
      .delete()
      .eq("org_id", orgMember.organization_id);

    if (qbAccounts.length > 0) {
      const rows = qbAccounts.map((acct: any) => ({
        org_id: orgMember.organization_id,
        account_code: acct.AcctNum || acct.Id || "",
        account_name: acct.FullyQualifiedName || acct.Name || "",
        account_type: acct.AccountSubType || acct.AccountType || "Expense",
        is_custom: false,
      }));

      await adminClient.from("chart_of_accounts").insert(rows);
    }

    return new Response(JSON.stringify({ success: true, count: qbAccounts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
