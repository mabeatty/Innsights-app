// Pulls real monthly revenue from QuickBooks for the Company Dashboard's
// Revenue tab (Development / Construction / Consulting Fees), attributed
// per-project via revenue_qb_account_map, for a fixed 24-month calendar
// window (Jan of the current year through Dec of the following year —
// matches the existing forecast horizon already loaded into
// dev_fee_schedule, so the Revenue tabs and that schedule cover the same
// range). Two ProfitAndLoss report calls (one per year), each
// SummarizeColumnBy=Month.
//
// A (revenue_type, QB sub-account name) pair with no matching row in
// revenue_qb_account_map is skipped, not guessed — mapping is intentionally
// manual since QB sub-account names don't reliably match Innsights project
// names, and per direction (2026-09-14) Construction Fees and Consulting
// Fees are being broken out by project in QuickBooks going forward, so new
// mappings should be added to revenue_qb_account_map as those sub-accounts
// go live with real postings.
//
// Requires the Supabase secrets Intuit_ID, Intuit_Secret, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REVENUE_SECTIONS: { sectionLabel: string; revenueType: string }[] = [
  { sectionLabel: "Development Fees", revenueType: "development_fee" },
  { sectionLabel: "Construction Fees", revenueType: "construction_fee" },
  { sectionLabel: "Consulting Fees", revenueType: "consulting_fee" },
];

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

// Recursively find a top-level P&L section by matching its Header label
// (QB prefixes some with the account number, e.g. "4200 Development Fees").
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

async function fetchPnlForYear(realmId: string, accessToken: string, year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const res = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&summarize_column_by=Month&minorversion=65`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`QuickBooks report request failed for ${year}: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

function extractProjectRows(report: any, sectionLabel: string, mapByName: Map<string, string>) {
  const columns: any[] = report?.Columns?.Column ?? [];
  const monthByColIndex = new Map<number, string>();
  columns.forEach((col: any, idx: number) => {
    const startMeta = (col.MetaData ?? []).find((m: any) => m.Name === "StartDate");
    if (startMeta?.Value) monthByColIndex.set(idx, startMeta.Value.slice(0, 7));
  });

  const section = findSection(report?.Rows?.Row ?? [], sectionLabel);
  const dataRows = (section?.Rows?.Row ?? []).filter((r: any) => r.type === "Data" || r.ColData);

  const upserts: { project_id: string; month: string; amount: number }[] = [];
  const unmatchedAccounts: string[] = [];
  for (const row of dataRows) {
    const colData = row.ColData ?? [];
    const rawLabel: string = colData?.[0]?.value ?? "";
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
      if (amount) upserts.push({ project_id: projectId, month, amount });
    }
  }
  return { upserts, unmatchedAccounts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { org_id, startYear } = await req.json().catch(() => ({ org_id: null, startYear: null }));
    if (!org_id) return json({ error: "Missing org_id." }, 400);
    // 24-month calendar window: Jan of startYear through Dec of startYear+1.
    // Defaults to the current year, matching the existing forecast horizon
    // already loaded into dev_fee_schedule (Jan 2026 – Dec 2027 as of this
    // writing).
    const year1 = startYear || new Date().getFullYear();
    const year2 = year1 + 1;

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
      .from("revenue_qb_account_map")
      .select("revenue_type, project_id, qb_account_name")
      .eq("org_id", org_id);

    const mapByTypeAndName = new Map<string, Map<string, string>>();
    for (const m of mappings ?? []) {
      if (!mapByTypeAndName.has(m.revenue_type)) mapByTypeAndName.set(m.revenue_type, new Map());
      mapByTypeAndName.get(m.revenue_type)!.set(m.qb_account_name.trim().toLowerCase(), m.project_id);
    }

    const accessToken = await refreshTokenIfNeeded(adminClient, connection);

    const reports = await Promise.all([
      fetchPnlForYear(connection.realm_id, accessToken, year1),
      fetchPnlForYear(connection.realm_id, accessToken, year2),
    ]);

    const allUpserts: { org_id: string; revenue_type: string; project_id: string; month: string; amount: number }[] = [];
    const unmatchedByType: Record<string, string[]> = {};

    for (const { sectionLabel, revenueType } of REVENUE_SECTIONS) {
      const mapByName = mapByTypeAndName.get(revenueType) ?? new Map();
      if (mapByName.size === 0) {
        unmatchedByType[revenueType] = ["(no project mappings configured for this revenue type yet)"];
        continue;
      }
      const unmatchedSet = new Set<string>();
      for (const report of reports) {
        const { upserts, unmatchedAccounts } = extractProjectRows(report, sectionLabel, mapByName);
        upserts.forEach((u) => allUpserts.push({ org_id, revenue_type: revenueType, ...u }));
        unmatchedAccounts.forEach((a) => unmatchedSet.add(a));
      }
      if (unmatchedSet.size > 0) unmatchedByType[revenueType] = [...unmatchedSet];
    }

    if (allUpserts.length > 0) {
      const { error: upsertErr } = await adminClient
        .from("revenue_qb_actuals")
        .upsert(
          allUpserts.map((u) => ({ ...u, synced_at: new Date().toISOString() })),
          { onConflict: "org_id,revenue_type,project_id,month" }
        );
      if (upsertErr) return json({ error: `Failed to save synced revenue: ${upsertErr.message}` }, 500);
    }

    return json({ ok: true, yearsSynced: [year1, year2], monthsSynced: allUpserts.length, unmatchedByType });
  } catch (err) {
    console.error("[sync-dev-fee-revenue-quickbooks] error", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
