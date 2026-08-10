// Generates a 1-page bid leveling report for a bid item: an executive summary,
// key differences between vendor bids, an explanation of the leveling
// adjustments applied, and considerations for the PM team.
//
// This function owns the entire cache-or-generate flow server-side using the
// service-role client: if a report already exists for this bid item and
// forceRegenerate isn't set, it's returned immediately with no call to Claude
// at all. A freshly generated report is saved before returning.
//
// Now also pulls the shared buildProjectContext (see
// ../_shared/project-context.ts — the same function project-assistant-chat
// uses) so the report has the full project picture as background, not just
// the one bid item's quotes. The prompt is written to keep the report
// focused on the specific item regardless — broader context is there to
// inform judgment (e.g. noticing a pattern across bid items), not to pad
// the report with unrelated detail.
//
// Requires the Supabase secrets ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Optionally ANTHROPIC_MODEL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildProjectContext, fmt } from "../_shared/project-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QuoteInput {
  vendor_name: string;
  round_1_amount: number | null;
  round_2_amount: number | null;
  round_3_amount: number | null;
  round_4_amount: number | null;
  final_quote_amount: number | null;
  leveled_total: number;
  vendor_status: string;
  notes: string | null;
  adjustments: { description: string; amount: number; category: string }[];
}

const SYSTEM_PROMPT =
  "You write concise, factual bid-leveling reports for a hotel construction project management team. " +
  "The team has already applied dollar-value scope adjustments to normalize vendor quotes for an " +
  "apples-to-apples comparison — your job is to explain in plain English what's actually different " +
  "between the bids and what the leveled comparison shows, so a PM who hasn't reviewed the raw quotes " +
  "can understand the situation in under a minute. Be specific about dollar amounts and vendor names. " +
  "Adjustments are tagged by category (Freight, Tax/Tariff, Installation, Other Scope) in brackets — " +
  "call out by name whenever a price gap is driven by freight, tax, or tariff differences rather than " +
  "true scope, since that distinction matters for how the team should weigh the comparison. " +
  "You'll also be given the broader project context (budget, other bid items, contracts, recent reports) " +
  "for background — use it only if directly relevant (e.g. a pattern across multiple bid items, or a " +
  "budget line this item should tie back to); the report itself must stay focused on THIS bid item, not " +
  "turn into a project-wide summary. " +
  "Do not invent scope details not present in the notes or adjustment descriptions provided. " +
  "Frame any recommendation as a consideration for the team's judgment, not a directive — you " +
  "don't have full context on qualitative factors like vendor reliability or schedule fit. " +
  "Return your answer only via the return_report tool.";

const REPORT_TOOL = {
  name: "return_report",
  description: "Return the structured bid leveling report",
  input_schema: {
    type: "object",
    properties: {
      executive_summary: {
        type: "string",
        description: "2-3 sentence overview: how many vendors, the leveled price range, and the headline takeaway.",
      },
      key_differences: {
        type: "array",
        items: { type: "string" },
        description: "3-6 short bullet points on what's actually different between the bids — scope inclusions/exclusions, notable price gaps, anything unusual in the notes.",
      },
      leveling_summary: {
        type: "string",
        description: "2-4 sentences explaining what adjustments were applied and why, and what the leveled totals show once bids are normalized.",
      },
      considerations: {
        type: "string",
        description: "1-2 sentences framing what the team should weigh next — phrased as considerations, not a directive.",
      },
    },
    required: ["executive_summary", "key_differences", "leveling_summary", "considerations"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { bidItemId, projectId, segment, itemName, quotes, forceRegenerate, userId } = (await req.json()) as {
      bidItemId: string;
      projectId?: string;
      segment: string;
      itemName: string;
      quotes: QuoteInput[];
      forceRegenerate?: boolean;
      userId?: string | null;
    };

    if (!bidItemId) return json({ error: "Missing bidItemId." }, 400);
    if (!quotes || quotes.length === 0) return json({ error: "No vendor quotes to compare." }, 400);

    // Check for an existing saved report first — this is the whole point of
    // persistence, so this check happens unconditionally before anything
    // that would call the AI.
    if (!forceRegenerate) {
      const { data: cached, error: cacheError } = await supabase
        .from("bid_leveling_reports")
        .select("report, generated_at")
        .eq("bid_item_id", bidItemId)
        .maybeSingle();
      if (cacheError) console.error("[generate-bid-leveling-report] cache lookup error", cacheError);
      if (cached) {
        return json({ report: cached.report, generatedAt: cached.generated_at, fromCache: true });
      }
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const quoteText = quotes
      .map((q) => {
        const rounds = [q.round_1_amount, q.round_2_amount, q.round_3_amount, q.round_4_amount]
          .map((r, i) => (r != null ? `Round ${i + 1}: ${fmt(r)}` : null))
          .filter(Boolean)
          .join(", ");
        const adjText =
          q.adjustments.length > 0
            ? q.adjustments.map((a) => `[${a.category}] ${a.description || "Adjustment"}: ${a.amount >= 0 ? "+" : ""}${fmt(a.amount)}`).join("; ")
            : "None";
        return [
          `Vendor: ${q.vendor_name}`,
          rounds ? `Negotiation rounds: ${rounds}` : null,
          `Raw final quote: ${fmt(q.final_quote_amount)}`,
          `Scope adjustments: ${adjText}`,
          `Leveled total: ${fmt(q.leveled_total)}`,
          `Status: ${q.vendor_status}`,
          q.notes ? `Notes: ${q.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    // Broader project context, for background only — see SYSTEM_PROMPT.
    const projectContext = projectId ? await buildProjectContext(supabase, projectId) : "";

    const userContent =
      (projectContext ? `PROJECT CONTEXT (background only — the report must stay focused on the bid item below):\n${projectContext}\n\n` : "") +
      `BID ITEM TO REPORT ON: ${segment} — ${itemName}\n\nVendor quotes:\n\n${quoteText}\n\nGenerate a bid leveling report focused on this bid item.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        tools: [REPORT_TOOL],
        tool_choice: { type: "tool", name: "return_report" },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[generate-bid-leveling-report] Anthropic error", resp.status, errText);
      return json({ error: `Anthropic API error: ${resp.status}`, detail: errText.slice(0, 300) }, 500);
    }

    const data = await resp.json();
    const toolUse = (data?.content ?? []).find((b: any) => b?.type === "tool_use" && b?.name === "return_report");
    if (!toolUse?.input) {
      console.error("[generate-bid-leveling-report] no tool_use block in response", JSON.stringify(data).slice(0, 500));
      return json({ error: "No report returned by Claude." }, 500);
    }

    const report = toolUse.input;
    const generatedAt = new Date().toISOString();

    const { error: saveError } = await supabase
      .from("bid_leveling_reports")
      .upsert(
        { bid_item_id: bidItemId, report, generated_at: generatedAt, generated_by: userId ?? null },
        { onConflict: "bid_item_id" }
      );
    if (saveError) {
      console.error("[generate-bid-leveling-report] FAILED TO PERSIST REPORT", saveError);
    }

    return json({ report, generatedAt, fromCache: false, persisted: !saveError });
  } catch (e) {
    console.error("[generate-bid-leveling-report] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
