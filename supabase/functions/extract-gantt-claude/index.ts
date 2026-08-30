// Extract a draft critical-path task list from a contractor-provided Gantt
// chart PDF.
//
// Strategy: many schedule exports (e.g. from scheduling tools like Moment
// Construction, MS Project, Smartsheet) include a clean text table (Title /
// Start / Duration) alongside the visual bars — in that case a text-layer
// extraction is far more reliable than reading bar positions off the chart.
// Some Gantt PDFs are purely graphical with no usable text layer. So: try
// text extraction first; only fall back to visual reading if the text layer
// is too sparse to be a real data table.
//
// Returns { ok: true, tasks: [{ task_name, trade, start_date, end_date,
// duration_days, is_critical, predecessor_task_name }] }. This is a DRAFT
// for the person to review and edit before it's saved — extraction is
// approximate (especially for visual-only charts), so the result is never
// written directly to the database.
//
// Requires the Supabase secret ANTHROPIC_API_KEY. Optionally ANTHROPIC_MODEL.

import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT_TEXT = `You are reading the text extracted from a construction schedule PDF. This PDF contains a data table (columns like Title/Task, Start date, and Duration/Workdays) alongside a visual Gantt chart — you're being given the table's text, which is the reliable source; ignore any stray/duplicated text fragments from the chart labels that don't fit the table structure.

For each task row, determine:
- task_name: the task/activity name exactly as listed
- workflow_group: the parent grouping this task belongs to, EXACTLY as the contractor's own schedule shows it — a bold/summary row's label (e.g. "Sitework", "MEP Rough-In"), a section header, or a clearly implied parent from indentation level. Use the contractor's own wording verbatim; do not invent, standardize, or rename groups, and do not force tasks into any predefined category list. If the schedule genuinely shows no grouping structure at all (a completely flat list with no section headers or indentation), set this to null for every task rather than guessing one.
- trade: the trade or discipline if identifiable from the task name (e.g. "Electrical", "Drywall", "FF&E"), otherwise null. This is a finer classification than workflow_group and may differ from it.
- start_date: in YYYY-MM-DD format, converted from whatever date format is shown
- duration_days: the workdays/duration value for that row, as a plain number
- end_date: calculate as start_date + duration_days (calendar days is fine as an approximation if the source uses workdays)
- is_critical: set true for every task — this text table format doesn't visually distinguish a critical path, so treat the full sequence as the critical path. Set the top-level "critical_path_indicated" to false.
- predecessor_task_name: the task_name of the row immediately before this one in the list, since these schedule exports are typically already in dependency order (each task begins at or after the prior one ends). Use null for the very first task.

Note: if a row is itself a summary/section header (e.g. "Sitework" spanning the full duration of its sub-tasks, with no real individual work described), it is likely a rollup row, not a real task — you can still extract it if it looks like a genuine schedule line, but do not force every summary row into the output if it's purely a container with no actual duration/work of its own.

List tasks in the same order they appear in the source. Return only a JSON object: { "critical_path_indicated": false, "tasks": [{ task_name, workflow_group, trade, start_date, end_date, duration_days, is_critical, predecessor_task_name }] }. No preamble or markdown.`;

const SYSTEM_PROMPT_VISUAL = `You are reading a construction Gantt chart (schedule) PDF provided by a general contractor. Extract every task/activity row shown in the chart.

For each task, determine:
- task_name: the activity name exactly as labeled
- workflow_group: the parent grouping this task belongs to, EXACTLY as the contractor's own chart shows it — a bold/summary bar's label (e.g. "Sitework", "MEP Rough-In"), a section header, a colored band grouping, or a clearly implied parent from indentation/outline level. Use the contractor's own wording verbatim; do not invent, standardize, or rename groups, and do not force tasks into any predefined category list. If the chart genuinely shows no grouping structure at all (a flat list with no section headers, indentation, or grouped color bands), set this to null for every task rather than guessing one.
- trade: the trade or discipline if identifiable from the row grouping or task name (e.g. "Electrical", "Drywall", "FF&E"), otherwise null. This is a finer classification than workflow_group and may differ from it.
- start_date and end_date in YYYY-MM-DD format, read from the bar's position against the chart's date axis. If you cannot determine an exact date, make your best estimate from the axis gridlines and note the uncertainty is expected — do not fabricate a date with false precision, but do provide your best reading.
- duration_days: the task's duration in calendar days, if shown or calculable from the bar width
- is_critical: true if this task is drawn as part of the critical path — typically shown in red, a distinct color/pattern from other bars, or explicitly labeled "critical path". If the chart does not visually distinguish a critical path, set is_critical to true for all tasks (assume the whole chart represents the critical sequence) and note this in a top-level "critical_path_indicated" boolean.
- predecessor_task_name: the task_name of the row immediately preceding this one in the dependency chain, if a dependency line/arrow is visible connecting them, or if sequential ordering in the chart clearly implies it. Otherwise null.

Note: if a bar is itself a summary/section rollup (e.g. "Sitework" spanning the full duration of its sub-tasks below it, with no real individual work described), it is likely a container row, not a real task — you can still extract it if it looks like a genuine schedule line, but do not force every summary bar into the output if it's purely a container with no actual work of its own.

List tasks in chronological/chart order. Return only a JSON object: { "critical_path_indicated": boolean, "tasks": [{ task_name, workflow_group, trade, start_date, end_date, duration_days, is_critical, predecessor_task_name }] }. No preamble or markdown.`;

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
      console.warn("[extract-gantt-claude] text extraction failed:", (e as Error).message);
    }

    // A real schedule table has many rows of "Task Name ... Date ... Nd
    // days"-shaped text; a short/near-empty text layer means this PDF is
    // effectively just the chart graphic, so fall back to visual reading.
    const usedTextMode = rawText.length >= 200;
    const userContent = usedTextMode
      ? [{ type: "text", text: `Text extracted from the schedule PDF:\n\n${rawText}` }]
      : [
          {
            type: "document",
            source: { type: "base64", media_type: mimeType || "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Extract the critical path task list as instructed and return only the JSON object." },
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
        system: usedTextMode ? SYSTEM_PROMPT_TEXT : SYSTEM_PROMPT_VISUAL,
        messages: [
          {
            role: "user",
            content: userContent,
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
