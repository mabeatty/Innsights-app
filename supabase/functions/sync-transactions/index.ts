import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
    const PLAID_SECRET = Deno.env.get("PLAID_PRODUCTION_SECRET");
    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      return new Response(JSON.stringify({ error: "Plaid credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse optional body params
    let startDate: string | null = null;
    let endDate: string | null = null;
    let connectionId: string | null = null;
    try {
      const body = await req.json();
      startDate = body.start_date || null;
      endDate = body.end_date || null;
      connectionId = body.connection_id || null;
    } catch {
      // No body — that's fine, use defaults
    }

    // Default date range: last 30 days
    if (!startDate) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split("T")[0];
    }
    if (!endDate) {
      endDate = new Date().toISOString().split("T")[0];
    }

    // Get connections (optionally filtered)
    let query = adminClient.from("plaid_connections").select("*").eq("status", "Active");
    if (connectionId) {
      query = query.eq("id", connectionId);
    }
    const { data: connections, error: connErr } = await query;

    if (connErr || !connections) {
      return new Response(JSON.stringify({ error: "Failed to fetch connections" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSynced = 0;

    for (const conn of connections) {
      try {
        // Use transactions/get with date range
        let allTransactions: any[] = [];
        let allAccounts: any[] = [];
        let totalTransactions = 0;
        let offset = 0;
        const count = 500;

        // Paginate through all transactions in the date range
        do {
          const plaidRes = await fetch("https://production.plaid.com/transactions/get", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: PLAID_CLIENT_ID,
              secret: PLAID_SECRET,
              access_token: conn.access_token,
              start_date: startDate,
              end_date: endDate,
              options: { count, offset },
            }),
          });

          const plaidData = await plaidRes.json();
          if (!plaidRes.ok) {
            console.error(`Plaid error for ${conn.institution_name}:`, plaidData);
            await adminClient.from("plaid_connections").update({ status: "Error" }).eq("id", conn.id);
            break;
          }

          allTransactions = allTransactions.concat(plaidData.transactions || []);
          // Capture accounts from first page (same across pages)
          if (offset === 0 && plaidData.accounts) {
            allAccounts = plaidData.accounts;
          }
          totalTransactions = plaidData.total_transactions || 0;
          offset += count;
        } while (offset < totalTransactions);

        // Upsert account details from the Plaid response
        if (allAccounts.length > 0) {
          const accountRows = allAccounts.map((a: any) => ({
            org_id: conn.org_id,
            connection_id: conn.id,
            plaid_account_id: a.account_id,
            name: a.name || '',
            mask: a.mask || null,
            official_name: a.official_name || null,
            type: a.type || null,
            subtype: a.subtype || null,
            institution_name: conn.institution_name,
          }));

          const { error: acctErr } = await adminClient
            .from("plaid_accounts")
            .upsert(accountRows, { onConflict: "plaid_account_id" });

          if (acctErr) console.error("Account upsert error:", acctErr);
        }

        if (allTransactions.length > 0) {
          const rows = allTransactions.map((t: any) => ({
            org_id: conn.org_id,
            plaid_item_id: conn.item_id,
            plaid_transaction_id: t.transaction_id,
            account_id: t.account_id,
            merchant_name: t.merchant_name || t.name || "Unknown",
            amount: Math.abs(t.amount),
            date: t.date,
            plaid_category: t.personal_finance_category?.primary || t.category?.[0] || null,
            status: "unassigned",
          }));

          const { error: insertErr } = await adminClient
            .from("plaid_transactions")
            .upsert(rows, { onConflict: "plaid_transaction_id" });

          if (insertErr) {
            console.error("Insert error:", insertErr);
          } else {
            totalSynced += rows.length;
          }
        }

        // Update last synced
        await adminClient.from("plaid_connections")
          .update({ last_synced: new Date().toISOString(), status: "Active" })
          .eq("id", conn.id);

      } catch (err) {
        console.error(`Error syncing ${conn.institution_name}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, synced: totalSynced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
