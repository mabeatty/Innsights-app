// Detects and persists project risks automatically — budget divisions
// trending over their scheduled value, critical-path tasks overdue and not
// marked Complete, and anything an extracted weekly report itself flagged
// as a risk. Designed to run with zero manual action required:
//   - Triggered immediately after a weekly report attachment finishes
//     extraction (see extract-weekly-report-text, which calls this at the
//     end of a successful run)
//   - Triggered nightly for every active project via a pg_cron job (see
//     migration 20260830100000_schedule_nightly_risk_detection.sql), so
//     budget/schedule risks that emerge without any new report still surface
//
// Budget and schedule risk detection is fully deterministic (real sums and
// date comparisons in SQL/JS, no model call) — titles and descriptions are
// template-generated from the computed numbers, not written by an LLM, so
// there's no risk of a hallucinated dollar amount or date. Report-flagged
// risks reuse whatever extract-weekly-report-text already had Claude
// summarize (its "Risks flagged:" line), rather than re-analyzing the report
// here.
//
// Reconciliation: any existing 'open' risk for a project that is no longer
// detected on this run is marked 'resolved' automatically (e.g. a division
// that was over budget and got a budget revision, or a task that got marked
// Complete) — so the list reflects current reality, not just a growing pile.
//
// Requires the Supabase secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// No ANTHROPIC_API_KEY needed — this function does no model calls itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

interface DetectedRisk {
  risk_type: "Budget" | "Schedule" | "Compliance" | "Report";
  severity: "Low" | "Medium" | "High";
  title: string;
  description: string;
  related_entity: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    let projectIds: string[] = body.projectId ? [body.projectId] : [];

    // No specific project given — run for every project (the nightly batch
    // path). Not filtered by status: the only status value actually used in
    // this data is "Draft", which doesn't distinguish active-vs-not the way
    // a status filter here was meant to — so run against everything rather
    // than silently matching zero projects.
    if (projectIds.length === 0) {
      const { data: allProjects } = await supabase.from("projects").select("id");
      projectIds = (allProjects ?? []).map((p: any) => p.id);
    }

    const results: Record<string, { detected: number; resolved: number }> = {};

    for (const projectId of projectIds) {
      const detected: DetectedRisk[] = [];

      // ── Budget risk: division actual (sum of budget_transactions) vs. scheduled_value ──
      const [{ data: budgetRows }, { data: txRows }] = await Promise.all([
        supabase.from("project_budget").select("division_number, division_name, scheduled_value").eq("project_id", projectId),
        supabase.from("budget_transactions").select("division_number, amount").eq("project_id", projectId),
      ]);
      const actualByDivision = new Map<string, number>();
      (txRows ?? []).forEach((t: any) => {
        actualByDivision.set(t.division_number, (actualByDivision.get(t.division_number) ?? 0) + Number(t.amount));
      });
      for (const b of budgetRows ?? []) {
        const scheduled = Number(b.scheduled_value);
        const actual = actualByDivision.get(b.division_number) ?? 0;
        if (scheduled <= 0) continue; // no budget set for this division — nothing to compare against
        const overrunPct = (actual - scheduled) / scheduled;
        if (overrunPct > 0.05) {
          const overrunAmt = actual - scheduled;
          detected.push({
            risk_type: "Budget",
            severity: overrunPct > 0.2 ? "High" : overrunPct > 0.1 ? "Medium" : "Low",
            title: `${b.division_name} (Division ${b.division_number}) is ${fmt(overrunAmt)} over budget`,
            description: `Transactions to date total ${fmt(actual)} against a scheduled value of ${fmt(scheduled)} — ${(overrunPct * 100).toFixed(0)}% over.`,
            related_entity: `division:${b.division_number}`,
          });
        }
      }

      // ── Schedule risk: critical-path tasks past their end date, not Complete ──
      const { data: tasks } = await supabase
        .from("critical_path_tasks")
        .select("id, task_name, end_date, status, is_critical")
        .eq("project_id", projectId);
      const today = new Date().toISOString().slice(0, 10);
      for (const t of tasks ?? []) {
        if (t.end_date && t.end_date < today && t.status !== "Complete") {
          const daysLate = Math.round((new Date(today).getTime() - new Date(t.end_date).getTime()) / 86400000);
          detected.push({
            risk_type: "Schedule",
            severity: t.is_critical ? (daysLate > 14 ? "High" : "Medium") : "Low",
            title: `"${t.task_name}" is ${daysLate} day${daysLate === 1 ? "" : "s"} past its scheduled end date`,
            description: `Scheduled to finish ${t.end_date}, still marked "${t.status}".${t.is_critical ? " This task is on the critical path." : ""}`,
            related_entity: `task:${t.id}`,
          });
        }
      }

      // ── Report-flagged risk: anything an extracted weekly report itself called out ──
      const { data: reports } = await supabase
        .from("weekly_reports")
        .select("id, date_range_start, date_range_end")
        .eq("project_id", projectId)
        .order("date_range_start", { ascending: false })
        .limit(3);
      const reportIds = (reports ?? []).map((r: any) => r.id);
      if (reportIds.length > 0) {
        const { data: attachments } = await supabase
          .from("weekly_report_attachments")
          .select("report_id, extracted_text, extraction_status")
          .in("report_id", reportIds)
          .eq("extraction_status", "done");
        for (const a of attachments ?? []) {
          if (!a.extracted_text) continue;
          const riskLine = a.extracted_text.split("\n").find((l: string) => l.toLowerCase().startsWith("risks flagged:"));
          if (riskLine && !riskLine.toLowerCase().includes("risks flagged: none")) {
            const report = (reports ?? []).find((r: any) => r.id === a.report_id);
            detected.push({
              risk_type: "Report",
              severity: "Medium",
              title: `Weekly report (${report?.date_range_start ?? "recent"}) flagged a risk`,
              description: riskLine.replace(/^Risks flagged:\s*/i, ""),
              related_entity: `report:${a.report_id}`,
            });
          }
        }
      }

      // ── Reconcile against existing open risks ──
      const { data: existingOpen } = await supabase
        .from("project_risks")
        .select("id, related_entity, risk_type")
        .eq("project_id", projectId)
        .eq("status", "open");

      const stillPresentIds = new Set<string>();
      let insertedCount = 0;
      for (const d of detected) {
        const match = (existingOpen ?? []).find((e: any) => e.related_entity === d.related_entity && e.risk_type === d.risk_type);
        if (match) {
          stillPresentIds.add(match.id);
          await supabase.from("project_risks").update({
            title: d.title, description: d.description, severity: d.severity, last_confirmed_at: new Date().toISOString(),
          }).eq("id", match.id);
        } else {
          await supabase.from("project_risks").insert({
            project_id: projectId, risk_type: d.risk_type, severity: d.severity,
            title: d.title, description: d.description, related_entity: d.related_entity,
          });
          insertedCount++;
        }
      }
      const toResolve = (existingOpen ?? []).filter((e: any) => !stillPresentIds.has(e.id));
      for (const r of toResolve) {
        await supabase.from("project_risks").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", r.id);
      }

      results[projectId] = { detected: insertedCount, resolved: toResolve.length };
    }

    return json({ ok: true, results });
  } catch (e) {
    console.error("[detect-project-risks] error", e);
    return json({ ok: false, error: (e as Error).message || "Unexpected error" }, 500);
  }
});
