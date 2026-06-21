// Extract invoice fields from a PDF using the Anthropic Claude API.
// Returns { ok: true, fields: { vendor_name, invoice_number, invoice_date, amount } }
// to match the contract the Upload Invoice modal expects.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL
// (defaults to a current PDF-capable Claude model).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_PROMPT = `You are extracting data from an invoice or payment application PDF. First identify the document type.

If this is an AIA G702/G703 Pay Application:
- Set document_type to 'aia_pay_app'
- Extract vendor_name (the Contractor name)
- Extract invoice_number (the Application No)
- Extract invoice_date (the Period To date, YYYY-MM-DD format)
- Do NOT extract a total_amount — set it to null
- Extract line_items from the G703 continuation sheet: for each line item row that has a non-zero 'Work Completed This Period' (Column E), extract the description (Column B) and the this-period amount (Column E as a number)

If this is a regular invoice:
- Set document_type to 'regular_invoice'
- Extract vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount (number only)
- Set line_items to empty array

Return only a JSON object with keys: document_type, vendor_name, invoice_number, invoice_date, total_amount, line_items (array of {description, amount, category}). No preamble or markdown.`;

// Append category-matching instructions. When the caller provides the project's
// budget categories, Claude must map each line item to one of those exact
// strings (or null) — far more reliable than fuzzy string matching client-side.
function buildPrompt(categories?: unknown): string {
  const list = Array.isArray(categories)
    ? categories.filter((c) => typeof c === "string" && c.trim()).map((c) => (c as string).trim())
    : [];
  if (list.length === 0) {
    return BASE_PROMPT + `\n\nFor each line item, set "category" to null.`;
  }
  return (
    BASE_PROMPT +
    `\n\nFor each line item's "category", choose the SINGLE best match from this exact list of the project's budget categories and copy that string VERBATIM (including the number prefix). Match on the meaning of the work, not just exact words (e.g. "electrical rough-in" matches "26 — Electrical"). If no category is a reasonable match, set "category" to null. Never invent a category that is not in this list.\n` +
    list.map((c) => `- ${c}`).join("\n")
  );
}

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
    // PDF-capable current model. Override with the ANTHROPIC_MODEL secret
    // (e.g. claude-haiku-4-5 for a cheaper/faster option) without redeploying.
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-4-8";

    const { pdfBase64, mimeType, categories } = await req.json();
    if (!pdfBase64) {
      return json({ ok: false, error: "Missing pdfBase64." });
    }
    const systemPrompt = buildPrompt(categories);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mimeType || "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: "Extract the fields as instructed and return only the JSON object." },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[extract-invoice-claude] Anthropic error", resp.status);
      return json({ ok: false, error: `Anthropic API error: ${resp.status}`, detail: errText.slice(0, 300) });
    }

    const data = await resp.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    // The model is asked to return only JSON; strip any code fences just in case.
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
      return json({ ok: false, error: "Could not parse extraction result." });
    }
    return json({ ok: true, fields });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
