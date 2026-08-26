// Extract loan/debt terms from a lender's commitment letter or term sheet PDF.
//
// Strategy: mirrors extract-invoice-claude — commitment letters and term
// sheets are text/table documents (not graphical like a Gantt chart), so we
// extract the PDF's text layer first and have Claude interpret the
// structured text. Falls back to visual reading if there's no usable text
// layer (scanned document).
//
// Returns { ok: true, fields: { lender_name, loan_type, loan_amount,
// interest_rate, rate_type, index_name, spread, loan_term, maturity_date,
// amortization_schedule, origination_fee, extension_options,
// required_reserves } }. This is a DRAFT for the person to review and edit
// before it's saved — never written directly to the database.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are reading a lender's commitment letter or term sheet for a construction or real estate loan. Extract the loan terms.

Fields to extract:
- lender_name: the lending institution's name
- loan_type: choose the single best match from this exact list: "Construction Loan", "Mini-Perm", "Bridge", "Mezz", "EB-5 Loan", "CMBS", "Other". Infer from context (e.g. a construction-to-perm facility is "Construction Loan"; subordinate/gap financing is usually "Mezz").
- loan_amount: the loan commitment amount (number only, no currency symbol)
- interest_rate: the interest rate as a percentage (number only, e.g. 7.5). If floating, this is the current all-in rate if stated, otherwise null.
- rate_type: "Fixed" or "Floating"
- index_name: if floating, the reference index (e.g. "SOFR", "Prime"), otherwise null
- spread: if floating, the spread over the index in percent (number only), otherwise null
- loan_term: the loan term in months (convert years to months if needed)
- maturity_date: YYYY-MM-DD format if a specific date is stated, otherwise null
- amortization_schedule: choose the best match from: "Interest Only", "30-Year", "25-Year", "20-Year", "15-Year", "Custom". Use "Custom" if a schedule is described but doesn't match a standard term, and put the detail in notes.
- origination_fee: the origination/commitment fee as a percentage of loan amount (number only), 0 if not stated
- extension_options: text describing any extension options (e.g. "2 x 12 months"), otherwise null
- required_reserves: text describing any required reserve accounts (interest reserve, tax/insurance escrow, etc.), otherwise null
- notes: any other material terms worth flagging (recourse/non-recourse, covenants, prepayment penalties, etc.) as a short summary, otherwise null

If a field cannot be determined from the document, set it to null (or 0 for numeric fields where 0 is a reasonable default like origination_fee). Do not fabricate values.

Return only a JSON object with exactly these fields. No preamble or markdown.`;

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

    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64) {
      return json({ ok: false, error: "Missing pdfBase64." });
    }

    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

    let rawText = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = (typeof text === "string" ? text : (text as string[]).join("\n")).trim();
    } catch (e) {
      console.warn("[extract-debt-terms-claude] text extraction failed:", (e as Error).message);
    }

    const usedTextMode = rawText.length >= 40;
    const userContent = usedTextMode
      ? [{ type: "text", text: `Raw text extracted from the PDF:\n\n${rawText}` }]
      : [
          {
            type: "document",
            source: { type: "base64", media_type: mimeType || "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Extract the loan terms as instructed and return only the JSON object." },
        ];

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[extract-debt-terms-claude] Anthropic error", resp.status);
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
      return json({ ok: false, error: "Could not parse extraction result." });
    }
    return json({ ok: true, fields, source: usedTextMode ? "text" : "visual" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
