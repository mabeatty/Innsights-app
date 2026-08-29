// Project-aware AI chat assistant. Given a project and a new user message,
// assembles real context about that project via the shared buildProjectContext
// (see ../_shared/project-context.ts — the same function the bid leveling
// report generator uses, so the two can't drift out of sync), calls Claude,
// persists both messages, and returns the assistant's reply.
//
// This is a discuss/advise assistant, not a write-capable agent — it can
// read and reason about the project's data and suggest specific changes,
// but it does not modify any records itself. The system prompt makes this
// explicit so it doesn't claim to have made an edit it can't actually make.
//
// Requires the Supabase secrets ANTHROPIC_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Optionally ANTHROPIC_MODEL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildProjectContext } from "../_shared/project-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT_PREFIX =
  "You are the project assistant inside Innsights, a hotel construction/renovation project management tool. " +
  "You're having a conversation with someone on the project management team about this specific project. " +
  "You have read access to the data below — budget, FF&E takeoff, the critical path schedule, open Field Admin " +
  "items (permits, submittals, shop drawings, RFIs), bid items with vendor quotes and scope adjustments, any " +
  "bid leveling reports already generated, and executed contracts — use it to give specific, grounded answers " +
  "(real dollar amounts, vendor names, item names, division numbers, task names, dates) rather than generic " +
  "advice. Weekly reports are a partial exception: you can see each report's date range, category, attached " +
  "file name(s)/link(s), and any comments — but not the actual text inside the report PDF, since that isn't " +
  "extracted into your context. If someone asks what a weekly report actually says, tell them plainly that you " +
  "can see it exists and is attached but not its contents, and suggest they open the file or paste the relevant " +
  "section if they want you to reason about it. A common task is cross-referencing the schedule against other " +
  "signals you do have — e.g. checking whether a critical path task whose end date has passed is still marked " +
  "incomplete, or whether an open permit/submittal/RFI could be blocking an upcoming task. If something isn't " +
  "in the context below, say so plainly rather than guessing or assuming it doesn't exist elsewhere in the app. " +
  "IMPORTANT: you cannot directly edit any data yourself — you can discuss, analyze, and suggest specific " +
  "changes (e.g. 'update the quantity for X to Y' or 'the unit price for Z looks stale, consider updating it'), " +
  "but the person will need to make the actual edit in the relevant part of the app. Never claim to have made " +
  "a change. If you don't have enough information to answer precisely, say so and ask a clarifying question " +
  "rather than guessing. Keep responses conversational and concise — this is a chat, not a report.\n\n" +
  "PROJECT CONTEXT:\n";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 500);
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { projectId, message, userId } = await req.json();
    if (!projectId || !message) return json({ error: "Missing projectId or message." }, 400);

    // Save the user's message first.
    await supabase.from("project_assistant_messages").insert({ project_id: projectId, role: "user", content: message, created_by: userId ?? null });

    // Load conversation history (most recent 30 messages) for continuity.
    const { data: history } = await supabase
      .from("project_assistant_messages")
      .select("role, content")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(30);

    const context = await buildProjectContext(supabase, projectId);

    const anthropicMessages = (history ?? []).map((m: any) => ({ role: m.role, content: m.content }));

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
        system: SYSTEM_PROMPT_PREFIX + context,
        messages: anthropicMessages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[project-assistant-chat] Anthropic error", resp.status, errText);
      return json({ error: `Anthropic API error: ${resp.status}`, detail: errText.slice(0, 300) }, 500);
    }

    const data = await resp.json();
    const reply: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    if (!reply) return json({ error: "No reply returned by Claude." }, 500);

    await supabase.from("project_assistant_messages").insert({ project_id: projectId, role: "assistant", content: reply });

    return json({ reply });
  } catch (e) {
    console.error("[project-assistant-chat] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
