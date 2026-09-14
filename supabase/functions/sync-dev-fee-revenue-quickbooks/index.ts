// Pulls real monthly Development Fee revenue from QuickBooks (the
// "Development Fees" income account's sub-accounts, broken out by month via
// the ProfitAndLoss report with SummarizeColumnBy=Month) and writes it into
// dev_fee_qb_actuals — the source the Company Dashboard's Development Fees
// tab now reads for monthly actuals, replacing the project-accounting-
// derived figures, per Alex's direction (2026-09-14): QuickBooks is more
// accurate for this number than pulling from project draws/transactions.
//
// Only QB sub-accounts explicitly mapped in dev_fee_qb_account_map are
// synced — mapping is intentionally manual (see that table's comment) since
// QB sub-account names don't reliably match Innsights project names and
// several sub-accounts under "Development Fees" are dead/legacy with no
// real activity. Unmapped sub-accounts are silently skipped, not guessed.
//
// Requires the Supabase secrets Intuit_ID, Intuit_Secret, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

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
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refresh_token }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) throw new Error("Failed to refresh QuickBooks token");
  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  await adminClient.from("quickbooks_connections").update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  return tokenData.access_token;
}

// Recursively walk the P&L report's Row tree looking for the "Development
// Fees" section, then collect its direct child data rows (account name +
// per-column values). QB nests sub-accounts one level under the parent
// account's Header row.
function findDevFeeRows(rows: any[]): any[] {
  for (const row of rows ?? []) {
    const label = row?.Header?.ColData?.[0]?.value ?? row?.ColData?.[0]?.value ?? "";
    if (typeof label === "string" && label.includes("Development Fees") && row.Rows?.Row) {
      return row.Rows.Row.filter((r: any) => r.type === "Data" || r.ColData);
    }
    if (row.Rows?.Row) {
      const found = findDevFeeRows(row.Rows.Row);
      if (found.length > 0) return found;
    }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { org_id, year } = await req.json().catch(() => ({ org_id: null, year: null }));
    if (!org_id) return json({ error: "Missing org_id." }, 400);
    const targetYear = year || new Date().getFullYear();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: connection } = await adminClient
      .from("quickbooks_connections")
      .select("*")
      .eq("org_id", org_id)
      .limit(1)
      .single();
    if (!connection) return json({ error: "QuickBooks not connected for this org." }, 400);

    const { data: mappings } = await adminClient
      .from("dev_fee_qb_account_map")
      .select("project_id, qb_account_name")
      .eq("org_id", org_id);
    if (!mappings || mappings.length === 0) {
      return json({ error: "No QuickBooks account mappings configured (dev_fee_qb_account_map is empty)." }, 400);
    }
    const mapByName = new Map(mappings.map((m: any) => [m.qb_account_name.trim().toLowerCase(), m.project_id]));

    const accessToken = await refreshTokenIfNeeded(adminClient, connection);

    const startDate = `${targetYear}-01-01`;
    const endDate = `${targetYear}-12-31`;
    const reportRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&summarize_column_by=Month&minorversion=65`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    if (!reportRes.ok) {
      const t = await reportRes.text();
      return json({ error: `QuickBooks report request failed: ${reportRes.status}`, detail: t.slice(0, 300) }, 500);
    }
    const report = await reportRes.json();

    // Column metadata: index 0 = account label column, last index = Total,
    // everything between is a month column with a StartDate we can read.
    const columns: any[] = report?.Columns?.Column ?? [];
    const monthByColIndex = new Map<number, string>();
    columns.forEach((col: any, idx: number) => {
      const startMeta = (col.MetaData ?? []).find((m: any) => m.Name === "StartDate");
      if (startMeta?.Value) {
        monthByColIndex.set(idx, startMeta.Value.slice(0, 7)); // 'YYYY-MM'
      }
    });

    const devFeeRows = findDevFeeRows(report?.Rows?.Row ?? []);

    const upserts: { org_id: string; project_id: string; month: string; amount: number }[] = [];
    const unmatchedAccounts: string[] = [];

    for (const row of devFeeRows) {
      const colData = row.ColData ?? [];
      const rawLabel: string = colData?.[0]?.value ?? "";
      // Strip a leading account-number prefix if present, e.g. "4201 Ashland Home2 Suites".
      const cleanLabel = rawLabel.replace(/^\d+\s+/, "").trim();
      const projectId = mapByName.get(cleanLabel.toLowerCase());
      if (!projectId) {
        if (rawLabel) unmatchedAccounts.push(rawLabel);
        continue;
      }
      for (let i = 1; i < colData.length - 1; i++) {
        const month = monthByColIndex.get(i);
        if (!month) continue;
        const raw = colData[i]?.value;
        const amount = raw ? Number(raw) : 0;
        if (!amount) continue; // skip empty months, don't write zero-rows
        upserts.push({ org_id, project_id, month, amount });
      }
    }

    if (upserts.length > 0) {
      const { error: upsertErr } = await adminClient
        .from("dev_fee_qb_actuals")
        .upsert(
          upserts.map((u) => ({ ...u, synced_at: new Date().toISOString() })),
          { onConflict: "org_id,project_id,month" }
        );
      if (upsertErr) return json({ error: `Failed to save synced data: ${upsertErr.message}` }, 500);
    }

    return json({ ok: true, monthsSynced: upserts.length, unmatchedAccounts: [...new Set(unmatchedAccounts)] });
  } catch (err) {
    console.error("[sync-dev-fee-revenue-quickbooks] error", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
