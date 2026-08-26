// Extract a draft critical-path task list from a contractor-provided Gantt
// chart PDF.
//
// Strategy: Gantt charts are visual documents — task bars, dates, and
// critical-path highlighting (commonly shown in red) are drawn graphically,
// not encoded as text. Unlike extract-invoice-claude, we always send the
// PDF to Claude as a document for visual reading rather than attempting
// text-layer extraction first.
//
// Returns { ok: true, tasks: [{ task_name, trade, start_date, end_date,
// duration_days, is_critical, predecessor_task_name }] }. This is a DRAFT
// for the person to review and edit before it's saved — extraction from a
// visual chart is inherently approximate (especially bar-edge date
// precision), so the result is never written directly to the database.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are reading a construction Gantt chart (schedule) PDF provided by a general contractor. Extract every task/activity row shown in the chart.

For each task, determine:
- task_name: the activity name exactly as labeled
- trade: the trade or discipline if identifiable from the row grouping or task name (e.g. "Electrical", "Drywall", "FF&E"), otherwise null
- start_date and end_date in YYYY-MM-DD format, read from the bar's position against the chart's date axis. If you cannot determine an exact date, make your best estimate from the axis gridlines and note the uncertainty is expected — do not fabricate a date with false precision, but do provide your best reading.
- duration_days: the task's duration in calendar days, if shown or calculable from the bar width
- is_critical: true if this task is drawn as part of the critical path — typically shown in red, a distinct color/pattern from other bars, or explicitly labeled "critical path". If the chart does not visually distinguish a critical path, set is_critical to true for all tasks (assume the whole chart represents the critical sequence) and note this in a top-level "critical_path_indicated" boolean.
- predecessor_task_name: the task_name of the row immediately preceding this one in the dependency chain, if a dependency line/arrow is visible connecting them, or if sequential ordering in the chart clearly implies it. Otherwise null.

List tasks in chronological/chart order. Return only a JSON object: { "critical_path_indicated": boolean, "tasks": [{ task_name, trade, start_date, end_date, duration_days, is_critical, predecessor_task_name }] }. No preamble or markdown.`;

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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: mimeType || "application/pdf", data: pdfBase64 },
              },
              { type: "text", text: "Extract the critical path task list as instructed and return only the JSON object." },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[extract-gantt-claude] Anthropic error", resp.status);
      return json({ ok: false, error: `Anthropic API error: ${resp.status}`, detail: errText.slice(0, 300) });
    }

    const data = await resp.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let result: { critical_path_indicated?: boolean; tasks?: unknown[] } | null = null;
    try {
      result = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try { result = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    if (!result || !Array.isArray(result.tasks)) {
      return json({ ok: false, error: "Could not parse extraction result." });
    }
    return json({ ok: true, tasks: result.tasks, critical_path_indicated: result.critical_path_indicated ?? true });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
