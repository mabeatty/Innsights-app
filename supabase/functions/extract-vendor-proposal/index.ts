// Extract vendor identity + itemized pricing from a vendor/FF&E proposal PDF.
//
// Strategy mirrors extract-invoice-claude: extract the PDF's text layer
// programmatically (unpdf) and have Claude interpret the TEXT. Falls back to
// visual reading if there's no usable text layer (scanned document).
//
// This is for itemized vendor/FF&E price sheets — NOT general contractor
// lump-sum pricing outlines (GMP proposals with CSI divisions). Those are
// out of scope here and should still be entered via the accounting/budget
// tools directly.
//
// Returns { ok: true, fields: { vendor_name, contact_name, phone, email,
// category, brand, project_hint, room_type_hint, inferred: string[],
// line_items: [{ item_name, category, raw_description, quantity, unit,
// unit_price, ext_price, room_type }] } }.
//
// "inferred" lists which top-level fields were not explicitly stated in the
// document and were filled in by the model's judgment (e.g. brand guessed
// from a hotel prototype name) — the UI should visually flag these for
// review rather than presenting them as verified facts.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_PROMPT = `You are reading a vendor or FF&E supplier proposal/quote for a hotel construction or renovation project. This is NOT a general contractor's lump-sum CSI-division pricing outline — it is an itemized quote from a single vendor/supplier (furniture, fixtures, equipment, signage, a trade subcontractor, etc.).

Your job is to extract vendor identity and every priced line item, AND to use context clues in the document to fill reasonable gaps — while being transparent about what you inferred vs. what was explicitly stated.

Step 1 — Identify the hotel/project context:
- Look for a hotel brand (e.g. "Home2 Suites", "SpringHill Suites", "DoubleTree", "TownePlace Suites", "Hilton", "Marriott") anywhere in the document — header, project name, spec references, prototype callouts.
- Look for a project name/location (e.g. "Ashland, OH", "Home2 Suites Ontario").
- If a brand is named but not a specific project, or vice versa, do your best to infer the missing one ONLY if there is a clear textual clue (e.g. a prototype name that is brand-specific). Do not guess a project or brand with no textual basis — leave it null instead.

Step 2 — Extract vendor identity:
- vendor_name: the company issuing the quote/proposal (not the customer/GC/owner receiving it)
- contact_name: the preparer or salesperson listed, if any
- phone, email: from the vendor's letterhead or signature block
- category: best-fit single category for what this vendor supplies, from this exact list (copy verbatim) — or null if nothing fits well:
${["Bath Accessories","Bedding","Corner Guards","Countertops","Doors, Frames & Hardware","Electrical","EV Charging","Exterior Signage","FF&E","Fitness Equipment","Flooring","Furnishings","Furniture","IT Hardware","Kitchen Appliances","Lighting","Millwork","Plumbing Fixtures","Signage","Soft Goods","Tile","Tubs & Showers","TVs & Accessories","Wall Coverings","Water Dispensers","Window Treatments","Windows"].map((c) => `  - ${c}`).join("\n")}

Step 3 — Extract every priced line item you can find. For each line item capture:
- item_name: a short generic name for the item (e.g. "Trash can", "Carpet padding", "Full-length mirror") — NOT the full spec string
- raw_description: the full description text as written in the document
- quantity, unit (e.g. EA, SY, LF), unit_price, ext_price (extended/total price for that line) — use null for any that are not stated or not computable
- room_type: guestroom type, public area, or location this item is for, if stated or clearly implied by section headers (e.g. "King Guestroom", "Public Corridor", "Lobby") — else null
- category: best-fit category for this specific line item from the same list above (a vendor can supply items across more than one category)

If the document is a lump-sum GC pricing outline organized by CSI divisions (01 General Conditions, 02 Sitework, 03 Concrete, etc. — i.e. it prices whole scopes of construction work rather than individual purchasable items), set is_gc_lump_sum to true and return an empty line_items array — this tool is not meant to parse those.

Step 4 — Report what you inferred. Populate "inferred" with the field names (from: vendor_name, contact_name, phone, email, category, brand, project_hint, room_type_hint) that you filled in using judgment/context rather than an explicit, direct statement in the document. If every top-level field you populated was explicitly stated, return an empty array. Do NOT include per-line-item inferences in this list — only top-level fields.

Return only a JSON object with this exact shape, no preamble or markdown:
{
  "is_gc_lump_sum": boolean,
  "vendor_name": string | null,
  "contact_name": string | null,
  "phone": string | null,
  "email": string | null,
  "category": string | null,
  "brand": string | null,
  "project_hint": string | null,
  "inferred": string[],
  "line_items": [
    { "item_name": string, "raw_description": string | null, "quantity": number | null, "unit": string | null, "unit_price": number | null, "ext_price": number | null, "room_type": string | null, "category": string | null }
  ]
}`;

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

    // 1. Decode the base64 PDF into bytes.
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

    // 2. Programmatically extract the PDF text layer.
    let rawText = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = (typeof text === "string" ? text : (text as string[]).join("\n")).trim();
    } catch (e) {
      console.warn("[extract-vendor-proposal] text extraction failed:", (e as Error).message);
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
        max_tokens: 4000,
        system: BASE_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[extract-vendor-proposal] Anthropic error", resp.status);
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
