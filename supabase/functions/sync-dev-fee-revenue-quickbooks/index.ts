// Pulls real monthly revenue from QuickBooks for the Company Dashboard's
// Revenue tab, via a single ProfitAndLoss report call (SummarizeColumnBy=
// Month):
//
// 1. Development Fees — real per-project sub-accounts exist in QB for this
//    fee type, so amounts are attributed per-project via
//    dev_fee_qb_account_map / written to dev_fee_qb_actuals (unchanged
//    behavior from before this function also covered Construction/
//    Consulting Fees).
// 2. Construction Fees and Consulting Fees — QB does NOT track these
//    per-project (postings go to pooled subtype accounts like "Owner's
//    Representative Fees" or "Legal Fee Revenue", not per-project
//    sub-accounts, even though some per-project sub-accounts are defined
//    in the chart of accounts — they simply have no actual postings).
//    So these are synced as company-wide monthly totals into
//    company_revenue_monthly, not attributed to any project. This is a
//    QuickBooks data-structure limitation, not an Innsights choice — if
//    per-project postings start happening for these fee types, this
//    function would need updating to attribute them the way Development
//    Fees already are.
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

// Recursively find a top-level P&L section (e.g. "Development Fees",
// "Construction Fees", "Consulting Fees") by matching its Header label
// (QB prefixes some with the account number, e.g. "4200 Development
// Fees" — matched by substring, not exact equality).
function findSection(rows: any[], labelSubstring: string): any | null {
  for (const row of rows ?? []) {
    const label = row?.Header?.ColData?.[0]?.value ?? "";
    if (typeof label === "string" && label.includes(labelSubstring)) return row;
    if (row.Rows?.Row) {
      const found = findSection(row.Rows.Row, labelSubstring);
      if (found) return found;
    }
  }
  return null;
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
    const mapByName = new Map((mappings ?? []).map((m: any) => [m.qb_account_name.trim().toLowerCase(), m.project_id]));

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
      if (startMeta?.Value) monthByColIndex.set(idx, startMeta.Value.slice(0, 7)); // 'YYYY-MM'
    });
    const readMonthlyValues = (colData: any[]): { month: string; amount: number }[] => {
      const out: { month: string; amount: number }[] = [];
      for (let i = 1; i < colData.length - 1; i++) {
        const month = monthByColIndex.get(i);
        if (!month) continue;
        const raw = colData[i]?.value;
        const amount = raw ? Number(raw) : 0;
        if (amount) out.push({ month, amount });
      }
      return out;
    };

    // ── 1. Development Fees: per-project, via dev_fee_qb_account_map ──
    const devFeeSection = findSection(report?.Rows?.Row ?? [], "Development Fees");
    const devFeeRows = (devFeeSection?.Rows?.Row ?? []).filter((r: any) => r.type === "Data" || r.ColData);
    const devFeeUpserts: { org_id: string; project_id: string; month: string; amount: number }[] = [];
    const unmatchedDevFeeAccounts: string[] = [];
    for (const row of devFeeRows) {
      const colData = row.ColData ?? [];
      const rawLabel: string = colData?.[0]?.value ?? "";
      const cleanLabel = rawLabel.replace(/^\d+\s+/, "").trim();
      const projectId = mapByName.get(cleanLabel.toLowerCase());
      if (!projectId) {
        if (rawLabel) unmatchedDevFeeAccounts.push(rawLabel);
        continue;
      }
      for (const { month, amount } of readMonthlyValues(colData)) {
        devFeeUpserts.push({ org_id, project_id, month, amount });
      }
    }
    if (devFeeUpserts.length > 0) {
      const { error: devFeeErr } = await adminClient
        .from("dev_fee_qb_actuals")
        .upsert(devFeeUpserts.map((u) => ({ ...u, synced_at: new Date().toISOString() })), { onConflict: "org_id,project_id,month" });
      if (devFeeErr) return json({ error: `Failed to save Development Fees: ${devFeeErr.message}` }, 500);
    }

    // ── 2. Construction Fees & Consulting Fees: company-wide monthly totals ──
    const companyWideUpserts: { org_id: string; revenue_type: string; month: string; amount: number }[] = [];
    for (const [sectionLabel, revenueType] of [
      ["Construction Fees", "construction_fee"],
      ["Consulting Fees", "consulting_fee"],
    ] as const) {
      const section = findSection(report?.Rows?.Row ?? [], sectionLabel);
      const summaryColData = section?.Summary?.ColData ?? [];
      for (const { month, amount } of readMonthlyValues(summaryColData)) {
        companyWideUpserts.push({ org_id, revenue_type: revenueType, month, amount });
      }
    }
    if (companyWideUpserts.length > 0) {
      const { error: cwErr } = await adminClient
        .from("company_revenue_monthly")
        .upsert(companyWideUpserts.map((u) => ({ ...u, synced_at: new Date().toISOString() })), { onConflict: "org_id,revenue_type,month" });
      if (cwErr) return json({ error: `Failed to save company-wide revenue: ${cwErr.message}` }, 500);
    }

    return json({
      ok: true,
      devFeeMonthsSynced: devFeeUpserts.length,
      unmatchedDevFeeAccounts: [...new Set(unmatchedDevFeeAccounts)],
      companyWideMonthsSynced: companyWideUpserts.length,
    });
  } catch (err) {
    console.error("[sync-dev-fee-revenue-quickbooks] error", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
