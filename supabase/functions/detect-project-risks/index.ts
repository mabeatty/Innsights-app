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
  // Comparable severity metric so a later run can tell "still about the
  // same" from "meaningfully worse" for a manually-resolved risk — overrun
  // percent (0-100) for Budget, days late for Schedule. null for
  // Compliance/Report (no natural single number to compare).
  metric: number | null;
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

    const results: Record<string, { detected: number; resolved: number; reopened: number }> = {};

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
            metric: overrunPct * 100,
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
            metric: daysLate,
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
              metric: null,
            });
          }
        }
      }

      // ── Reconcile against existing risks ──
      // Active (open/acknowledged) risks: matched and refreshed as before, or
      // newly inserted. No longer detected -> auto-resolved.
      const { data: existingActive } = await supabase
        .from("project_risks")
        .select("id, related_entity, risk_type")
        .eq("project_id", projectId)
        .in("status", ["open", "acknowledged"]);

      // Manually-resolved risks: the person deliberately dismissed these.
      // Only reopen if the situation got meaningfully worse than it was at
      // the moment they resolved it — otherwise leave them alone entirely,
      // including not touching last_confirmed_at, so a resolved risk stays
      // quietly resolved rather than showing churn.
      const { data: manuallyResolved } = await supabase
        .from("project_risks")
        .select("id, related_entity, risk_type, resolved_metric")
        .eq("project_id", projectId)
        .eq("status", "resolved")
        .eq("resolution_type", "manual");

      // "Meaningfully worse" thresholds — deliberately simple, tunable
      // constants rather than a fraction of the original value, so a risk
      // resolved at a small metric doesn't get reopened by a tiny absolute
      // change: +10 percentage points of budget overrun, or +7 more days late.
      const isMeaningfullyWorse = (riskType: DetectedRisk["risk_type"], oldMetric: number | null, newMetric: number | null) => {
        if (oldMetric == null || newMetric == null) return false;
        if (riskType === "Budget") return newMetric - oldMetric >= 10;
        if (riskType === "Schedule") return newMetric - oldMetric >= 7;
        return false;
      };

      const stillPresentIds = new Set<string>();
      const reopenedIds = new Set<string>();
      let insertedCount = 0;

      for (const d of detected) {
        const activeMatch = (existingActive ?? []).find((e: any) => e.related_entity === d.related_entity && e.risk_type === d.risk_type);
        if (activeMatch) {
          stillPresentIds.add(activeMatch.id);
          await supabase.from("project_risks").update({
            title: d.title, description: d.description, severity: d.severity, last_confirmed_at: new Date().toISOString(), current_metric: d.metric,
          }).eq("id", activeMatch.id);
          continue;
        }

        const resolvedMatch = (manuallyResolved ?? []).find((e: any) => e.related_entity === d.related_entity && e.risk_type === d.risk_type);
        if (resolvedMatch) {
          if (isMeaningfullyWorse(d.risk_type, resolvedMatch.resolved_metric, d.metric)) {
            reopenedIds.add(resolvedMatch.id);
            await supabase.from("project_risks").update({
              status: "open", title: d.title, description: d.description, severity: d.severity,
              last_confirmed_at: new Date().toISOString(), resolved_at: null, resolution_type: null, resolved_metric: null, resolved_by: null,
              current_metric: d.metric,
            }).eq("id", resolvedMatch.id);
          }
          // Not meaningfully worse — leave the manual resolution alone entirely.
          continue;
        }

        await supabase.from("project_risks").insert({
          project_id: projectId, risk_type: d.risk_type, severity: d.severity,
          title: d.title, description: d.description, related_entity: d.related_entity, current_metric: d.metric,
        });
        insertedCount++;
      }

      const toAutoResolve = (existingActive ?? []).filter((e: any) => !stillPresentIds.has(e.id));
      for (const r of toAutoResolve) {
        await supabase.from("project_risks").update({
          status: "resolved", resolved_at: new Date().toISOString(), resolution_type: "auto",
        }).eq("id", r.id);
      }

      results[projectId] = { detected: insertedCount, resolved: toAutoResolve.length, reopened: reopenedIds.size };
    }

    return json({ ok: true, results });
  } catch (e) {
    console.error("[detect-project-risks] error", e);
    return json({ ok: false, error: (e as Error).message || "Unexpected error" }, 500);
  }
});
