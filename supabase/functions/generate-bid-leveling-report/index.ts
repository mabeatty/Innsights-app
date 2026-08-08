import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  adjustments: { description: string; amount: number }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { segment, itemName, quotes } = (await req.json()) as {
      segment: string;
      itemName: string;
      quotes: QuoteInput[];
    };

    if (!quotes || quotes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No vendor quotes to compare." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const fmt = (n: number | null) => n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    const quoteText = quotes
      .map((q) => {
        const rounds = [q.round_1_amount, q.round_2_amount, q.round_3_amount, q.round_4_amount]
          .map((r, i) => r != null ? `Round ${i + 1}: ${fmt(r)}` : null)
          .filter(Boolean)
          .join(", ");
        const adjText = q.adjustments.length > 0
          ? q.adjustments.map((a) => `${a.description || "Adjustment"}: ${a.amount >= 0 ? "+" : ""}${fmt(a.amount)}`).join("; ")
          : "None";
        return [
          `Vendor: ${q.vendor_name}`,
          rounds ? `Negotiation rounds: ${rounds}` : null,
          `Raw final quote: ${fmt(q.final_quote_amount)}`,
          `Scope adjustments: ${adjText}`,
          `Leveled total: ${fmt(q.leveled_total)}`,
          `Status: ${q.vendor_status}`,
          q.notes ? `Notes: ${q.notes}` : null,
        ].filter(Boolean).join("\n");
      })
      .join("\n\n");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You write concise, factual bid-leveling reports for a hotel construction project management team. " +
                "The team has already applied dollar-value scope adjustments to normalize vendor quotes for an " +
                "apples-to-apples comparison — your job is to explain in plain English what's actually different " +
                "between the bids and what the leveled comparison shows, so a PM who hasn't reviewed the raw quotes " +
                "can understand the situation in under a minute. Be specific about dollar amounts and vendor names. " +
                "Do not invent scope details not present in the notes or adjustment descriptions provided. " +
                "Frame any recommendation as a consideration for the team's judgment, not a directive — the tool " +
                "doesn't have full context on qualitative factors like vendor reliability or schedule fit. " +
                "Return ONLY a JSON object via the return_report tool.",
            },
            {
              role: "user",
              content: `Bid item: ${segment} — ${itemName}\n\nVendor quotes:\n\n${quoteText}\n\nGenerate a bid leveling report.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_report",
                description: "Return the structured bid leveling report",
                parameters: {
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
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_report" } },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No report returned by AI gateway.");

    const report = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-bid-leveling-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
