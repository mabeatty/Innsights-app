import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Assembles a candidate "This Week" draft from real project data for a
// given ISO week — risks detected/resolved, invoices approved, schedule
// tasks completed or newly overdue, and OAC/weekly report highlights whose
// date falls in the week. This is explicitly NOT trying to write the note
// for the person; it's surfacing what the system already knows happened so
// their actual writing effort goes toward judgment (what does this mean,
// what's the plan) rather than re-typing facts already sitting in the
// database. Every line is plain, factual, and attributable to a real
// record — nothing here is inferred or summarized by a model.
//
// Only called once, when a week's note is first opened with no content yet
// — the frontend is responsible for not re-calling this once real content
// exists, since the whole point is a first-draft starting point, not a
// living feed that overwrites what someone wrote.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { project_id, week_start_date } = await req.json();
    if (!project_id || !week_start_date) return json({ ok: false, error: "project_id and week_start_date are required" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const weekStart = new Date(`${week_start_date}T00:00:00Z`);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const weekStartIso = weekStart.toISOString();
    const weekEndIso = weekEnd.toISOString();
    const weekStartDateStr = week_start_date;
    const weekEndDateStr = weekEnd.toISOString().slice(0, 10);

    const lines: string[] = [];

    // Risks newly detected or resolved this week.
    const { data: newRisks } = await supabase
      .from("project_risks")
      .select("title, severity")
      .eq("project_id", project_id)
      .gte("first_detected_at", weekStartIso)
      .lt("first_detected_at", weekEndIso);
    (newRisks ?? []).forEach((r: any) => lines.push(`New ${r.severity?.toLowerCase() ?? ""} risk flagged: ${r.title}`));

    const { data: resolvedRisks } = await supabase
      .from("project_risks")
      .select("title")
      .eq("project_id", project_id)
      .eq("status", "resolved")
      .gte("resolved_at", weekStartIso)
      .lt("resolved_at", weekEndIso);
    (resolvedRisks ?? []).forEach((r: any) => lines.push(`Resolved: ${r.title}`));

    // Invoices approved this week.
    const { data: approvedInvoices } = await supabase
      .from("invoices")
      .select("vendor_name, amount")
      .eq("project_id", project_id)
      .eq("status", "Approved")
      .gte("approved_at", weekStartIso)
      .lt("approved_at", weekEndIso);
    (approvedInvoices ?? []).forEach((i: any) =>
      lines.push(`Invoice approved: ${i.vendor_name} — $${Number(i.amount).toLocaleString()}`)
    );

    // Schedule: tasks marked Complete this week, and tasks whose end date
    // fell within this week but are still not Complete (newly overdue).
    const { data: completedTasks } = await supabase
      .from("critical_path_tasks")
      .select("task_name")
      .eq("project_id", project_id)
      .eq("status", "Complete")
      .gte("updated_at", weekStartIso)
      .lt("updated_at", weekEndIso);
    (completedTasks ?? []).forEach((t: any) => lines.push(`Completed: ${t.task_name}`));

    const { data: overdueTasks } = await supabase
      .from("critical_path_tasks")
      .select("task_name, end_date")
      .eq("project_id", project_id)
      .neq("status", "Complete")
      .gte("end_date", weekStartDateStr)
      .lt("end_date", weekEndDateStr);
    (overdueTasks ?? []).forEach((t: any) => lines.push(`Was due this week, not yet complete: ${t.task_name} (due ${t.end_date})`));

    // OAC meetings that happened this week — surface their extracted summary if available.
    const { data: meetings } = await supabase
      .from("oac_meetings")
      .select("id, meeting_date, title")
      .eq("project_id", project_id)
      .gte("meeting_date", weekStartDateStr)
      .lt("meeting_date", weekEndDateStr);
    if (meetings && meetings.length > 0) {
      const meetingIds = meetings.map((m: any) => m.id);
      const { data: attachments } = await supabase
        .from("oac_meeting_attachments")
        .select("meeting_id, extracted_text, extraction_status")
        .in("meeting_id", meetingIds)
        .eq("extraction_status", "done");
      for (const m of meetings) {
        const att = (attachments ?? []).find((a: any) => a.meeting_id === m.id);
        if (att?.extracted_text) {
          lines.push(`OAC meeting (${m.meeting_date}${m.title ? `, ${m.title}` : ""}):\n${att.extracted_text}`);
        } else {
          lines.push(`OAC meeting held ${m.meeting_date}${m.title ? ` — ${m.title}` : ""} (no extracted summary yet)`);
        }
      }
    }

    // Weekly reports submitted this week — same pattern, reference rather than duplicate.
    const { data: reports } = await supabase
      .from("weekly_reports")
      .select("id, date_range_start, date_range_end, content")
      .eq("project_id", project_id)
      .gte("date_range_end", weekStartDateStr)
      .lt("date_range_end", weekEndDateStr);
    if (reports && reports.length > 0) {
      for (const r of reports) {
        lines.push(`Weekly report submitted for ${r.date_range_start} to ${r.date_range_end} (${r.content || "Weekly Report"}) — see Reports tab for full content.`);
      }
    }

    return json({ ok: true, lines });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});
