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

const SYSTEM_PROMPT =
  "Extract the following fields from this invoice PDF and return only a JSON object with keys: vendor_name, invoice_number, invoice_date (YYYY-MM-DD), amount (number only). If a field cannot be found return null.";

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
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20241022";

    const { pdfBase64, mimeType } = await req.json();
    if (!pdfBase64) {
      return json({ ok: false, error: "Missing pdfBase64." });
    }

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
        system: SYSTEM_PROMPT,
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
