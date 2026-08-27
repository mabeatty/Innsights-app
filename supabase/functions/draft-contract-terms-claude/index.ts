// Draft contract terms from an awarded vendor quote, for the PM to review
// and edit before a PO/Subcontract document is generated.
//
// Unlike extract-invoice-claude, the source here isn't a document to read —
// it's already-structured data from the bid item, awarded quote, and any
// scope adjustments (freight, tax, installation, etc.) recorded during
// leveling. Claude's job is to turn that terse bidding data into
// contract-ready prose: a real scope-of-work paragraph, normalized payment
// terms, and a plain-language summary of any special terms implied by the
// adjustments (e.g. "includes installation" if an Installation adjustment
// was present).
//
// Returns { ok: true, fields: { vendor_name, contract_amount, scope_of_work,
// payment_terms, special_terms } }. This is a DRAFT for the PM to review and
// edit in the app before the document is generated — never treated as final.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a construction project administrator drafting the terms for a Purchase Order or Subcontract Agreement, based on an awarded vendor bid.

You will be given: the item/trade being purchased, its segment, the awarded vendor's name, the awarded amount, and any scope adjustments (e.g. Freight, Tax/Tariff, Installation, Other Scope) that were applied during bid leveling.

Draft:
- scope_of_work: A clear, professional scope-of-work paragraph describing what the vendor is being contracted to provide, based on the item name, segment, and any adjustment descriptions (which hint at what's included — e.g. an "Installation" adjustment means installation is part of scope). Write it as it would appear in a formal contract, 2-4 sentences. Do not invent specifics (exact quantities, model numbers, dates) that weren't given to you — describe scope at the level of detail the input supports.
- payment_terms: Standard, reasonable payment terms in plain contract language given the segment and amount (e.g. deposit/progress/final split for a large subcontract, net terms for a smaller PO). Keep it short, 1-2 sentences. Flag it as a standard suggestion, not a negotiated term, if you're inferring rather than given explicit terms.
- special_terms: Any notable terms suggested by the adjustments or context (e.g. "Freight included per vendor quote" or "Pricing reflects tariff surcharge as of quote date") — one sentence per notable item, or null if there's nothing beyond the base scope.

Do not fabricate legal boilerplate, warranty language, or liability terms — those aren't yours to draft. Stick to describing scope, payment, and any material terms directly supported by the input data.

Return only a JSON object: { "scope_of_work": string, "payment_terms": string, "special_terms": string | null }. No preamble or markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY is not configured." });
    }
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const { itemName, segment, vendorName, amount, adjustments } = await req.json();
    if (!itemName || !vendorName || amount == null) {
      return json({ ok: false, error: "Missing required fields (itemName, vendorName, amount)." });
    }

    const adjustmentText = Array.isArray(adjustments) && adjustments.length > 0
      ? adjustments.map((a: any) => `- ${a.category}: ${a.description} (${a.amount >= 0 ? "+" : ""}${a.amount})`).join("\n")
      : "None";

    const userPrompt = `Item/Trade: ${itemName}
Segment: ${segment ?? "Unspecified"}
Awarded Vendor: ${vendorName}
Contract Amount: $${Number(amount).toLocaleString()}
Scope Adjustments Applied During Leveling:
${adjustmentText}

Draft the contract terms as instructed.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[draft-contract-terms-claude] Anthropic error", resp.status);
      return json({ ok: false, error: `Anthropic API error: ${resp.status}`, detail: errText.slice(0, 300) });
    }

    const data = await resp.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let fields: Record<string, unknown> | null = null;
    try {
      fields = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try { fields = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    if (!fields) {
      return json({ ok: false, error: "Could not parse draft result." });
    }
    return json({ ok: true, fields });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
