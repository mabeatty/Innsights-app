// Extract invoice fields from a PDF.
//
// Strategy: first extract the PDF's raw text layer programmatically (unpdf, a
// serverless/Deno-native pdf.js wrapper). Claude then interprets the structured
// TEXT — it is not asked to read columns visually, which is what made AIA G703
// column detection unreliable. If the PDF has no text layer (scanned image),
// we fall back to sending the document to Claude visually.
//
// Returns { ok: true, fields: { document_type, vendor_name, invoice_number,
// invoice_date, total_amount, line_items: [{description, amount, category}] } }.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_PROMPT = `You are interpreting an invoice or AIA payment application. First identify the document type.

If this is an AIA G702/G703 Pay Application (look for 'Application and Certificate for Payment' or 'Continuation Sheet'):
- Set document_type to 'aia_pay_app'
- Extract vendor_name from the Contractor field on G702
- Extract invoice_number from the Application No field on G702
- Extract invoice_date from the Period To field on G702 (YYYY-MM-DD format)
- Set total_amount to null
- The G703 Continuation Sheet has these columns: B=Description, C=Scheduled Value, D=From Previous Application, E=Work Completed This Period, F=Materials Stored, G=Total Completed, H=%, I=Balance to Finish.
- Extract ONLY the line items where Column E (Work Completed This Period) is non-zero
- For each such line item extract: the description from Column B, and the amount from Column E value ONLY (This Period column) — NOT Column C (Scheduled Value), NOT Column D (From Previous Application), NOT Column F (Materials Stored), NOT Column G (Total Completed)
- Be thorough — scan every row of the G703 table. Do not skip any row that has a non-zero value in the This Period column, even if the value appears small.

If this is a regular invoice:
- Set document_type to 'regular_invoice'
- Extract vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount (number only)
- Set line_items to empty array

Return only a JSON object: { document_type, vendor_name, invoice_number, invoice_date, total_amount, line_items: [{description, amount, category}] }. No preamble or markdown.`;

// Append category-matching instructions. When the caller provides the project's
// budget categories, Claude maps each line item to one of those exact strings
// (or null) — far more reliable than fuzzy string matching client-side.
function categorySuffix(categories?: unknown): string {
  const list = Array.isArray(categories)
    ? categories.filter((c) => typeof c === "string" && c.trim()).map((c) => (c as string).trim())
    : [];
  if (list.length === 0) {
    return `\n\nFor each line item, set "category" to null.`;
  }
  return (
    `\n\nFor each line item's "category", choose the SINGLE best match from this exact list of the project's budget categories and copy that string VERBATIM (including the number prefix). Match on the MEANING of the work, not just exact words — e.g. "General Conditions - GC" matches "General Requirements", "Architectural Design - OC" matches "Architecture", "electrical rough-in" matches "26 — Electrical". If no category is a reasonable match, set "category" to null. Never invent a category that is not in this list.\n` +
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
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const { pdfBase64, mimeType, categories } = await req.json();
    if (!pdfBase64) {
      return json({ ok: false, error: "Missing pdfBase64." });
    }
    const systemPrompt = BASE_PROMPT + categorySuffix(categories);

    // 1. Decode the base64 PDF into bytes.
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

    // 2. Programmatically extract the PDF text layer.
    let rawText = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = (typeof text === "string" ? text : (text as string[]).join("\n")).trim();
    } catch (e) {
      console.warn("[extract-invoice-claude] text extraction failed:", (e as Error).message);
    }

    // 3. Build the Claude message. Prefer interpreting the extracted text; if the
    //    PDF has no usable text layer (scanned image), fall back to visual reading.
    const usedTextMode = rawText.length >= 40;
    const userContent = usedTextMode
      ? [{ type: "text", text: `Raw text extracted from the PDF:\n\n${rawText}` }]
      : [
          {
            type: "document",
            source: { type: "base64", media_type: mimeType || "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Extract the fields as instructed and return only the JSON object." },
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
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
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
    return json({ ok: true, fields, source: usedTextMode ? "text" : "visual" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
