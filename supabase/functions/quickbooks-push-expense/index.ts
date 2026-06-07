import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshTokenIfNeeded(adminClient: any, connection: any) {
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);
  
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

    const { report_id } = await req.json();
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing report_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Get transactions for this report
    const { data: transactions } = await adminClient
      .from("plaid_transactions")
      .select("*, chart_of_accounts:chart_of_accounts_id(account_code, account_name)")
      .eq("expense_report_id", report_id);

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ success: true, pushed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a map of account_code -> QB Account Id
    const qbAccountRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}/query?query=${encodeURIComponent("SELECT Id, AcctNum, Name FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1000")}&minorversion=65`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
      }
    );
    const qbAccountData = await qbAccountRes.json();
    const qbAccounts = qbAccountData?.QueryResponse?.Account || [];
    
    // Map by AcctNum or Name
    const acctByCode: Record<string, string> = {};
    const acctByName: Record<string, string> = {};
    qbAccounts.forEach((a: any) => {
      if (a.AcctNum) acctByCode[a.AcctNum] = a.Id;
      if (a.Name) acctByName[a.Name.toLowerCase()] = a.Id;
    });

    let pushed = 0;
    const errors: string[] = [];

    for (const txn of transactions) {
      // Find the matching QB account
      const coaCode = (txn as any).chart_of_accounts?.account_code || "";
      const coaName = (txn as any).chart_of_accounts?.account_name || "";
      
      let qbAccountId = acctByCode[coaCode] || acctByName[coaName.toLowerCase()];
      
      // Fallback to first expense account if no match
      if (!qbAccountId && qbAccounts.length > 0) {
        qbAccountId = qbAccounts[0].Id;
      }

      if (!qbAccountId) {
        errors.push(`No QB account for: ${txn.merchant_name}`);
        continue;
      }

      // Create a Purchase (expense) in QuickBooks
      const purchasePayload = {
        AccountRef: { value: qbAccountId },
        PaymentType: "Cash",
        TxnDate: txn.date,
        Line: [
          {
            Amount: Math.abs(Number(txn.amount)),
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: qbAccountId },
            },
            Description: `${txn.merchant_name}${txn.description ? " - " + txn.description : ""}`,
          },
        ],
      };

      const pushRes = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}/purchase?minorversion=65`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(purchasePayload),
        }
      );

      if (pushRes.ok) {
        pushed++;
      } else {
        const errBody = await pushRes.text();
        console.error(`Failed to push txn ${txn.id}:`, errBody);
        errors.push(`Failed: ${txn.merchant_name}`);
      }
    }

    return new Response(JSON.stringify({ success: true, pushed, total: transactions.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
