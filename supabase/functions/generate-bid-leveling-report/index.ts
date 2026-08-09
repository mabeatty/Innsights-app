// Generates a 1-page bid leveling report for a bid item: an executive summary,
// key differences between vendor bids, an explanation of the leveling
// adjustments applied, and considerations for the PM team.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

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
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const { segment, itemName, quotes } = (await req.json()) as {
      segment: string;
      itemName: string;
      quotes: QuoteInput[];
    };

    if (!quotes || quotes.length === 0) {
      return json({ error: "No vendor quotes to compare." }, 400);
    }

    const fmt = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

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
        messages: [
          {
            role: "user",
            content: `Bid item: ${segment} — ${itemName}\n\nVendor quotes:\n\n${quoteText}\n\nGenerate a bid leveling report.`,
          },
        ],
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

    return json({ report: toolUse.input });
  } catch (e) {
    console.error("[generate-bid-leveling-report] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
