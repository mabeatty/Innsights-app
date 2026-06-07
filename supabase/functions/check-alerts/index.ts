import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all active projects (Under Construction status)
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, organization_id");

    if (!projects || projects.length === 0) {
      return new Response(JSON.stringify({ message: "No projects found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all existing unresolved alerts to avoid duplicates
    const { data: existingAlerts } = await supabase
      .from("alerts")
      .select("project_id, alert_type")
      .is("resolved_at", null)
      .is("dismissed_by", null);

    const existingAlertSet = new Set(
      (existingAlerts ?? []).map((a: any) => `${a.project_id}:${a.alert_type}`)
    );

    // Fetch alert settings (per org)
    const orgIds = [...new Set(projects.map((p: any) => p.organization_id).filter(Boolean))];
    const { data: settingsData } = await supabase
      .from("alert_settings")
      .select("*")
      .in("org_id", orgIds);

    const settingsMap = new Map<string, Map<string, any>>();
    for (const s of settingsData ?? []) {
      if (!settingsMap.has(s.org_id)) settingsMap.set(s.org_id, new Map());
      settingsMap.get(s.org_id)!.set(s.alert_type, s);
    }

    const isEnabled = (orgId: string, alertType: string) => {
      const orgSettings = settingsMap.get(orgId);
      if (!orgSettings) return true; // Default enabled
      const setting = orgSettings.get(alertType);
      return setting ? setting.enabled : true;
    };

    const getThreshold = (orgId: string, alertType: string, defaultVal: number) => {
      const orgSettings = settingsMap.get(orgId);
      if (!orgSettings) return defaultVal;
      const setting = orgSettings.get(alertType);
      return setting?.threshold_value ?? defaultVal;
    };

    // Fetch project info for status
    const { data: projectInfoData } = await supabase
      .from("project_info")
      .select("project_id, project_status, target_opening_date");

    const statusMap = new Map<string, string>();
    const completionMap = new Map<string, string>();
    for (const info of projectInfoData ?? []) {
      if (info.project_status) statusMap.set(info.project_id, info.project_status);
      if (info.target_opening_date) completionMap.set(info.project_id, info.target_opening_date);
    }

    const newAlerts: any[] = [];
    const resolvedKeys: string[] = [];

    for (const project of projects) {
      const orgId = project.organization_id;
      if (!orgId) continue;

      // === Budget & Cost Alerts ===

      // Fetch budget data
      const { data: budgetLines } = await supabase
        .from("project_budget")
        .select("division_number, division_name, scheduled_value")
        .eq("project_id", project.id);

      const { data: transactions } = await supabase
        .from("budget_transactions")
        .select("division_number, amount")
        .eq("project_id", project.id);

      const { data: changeOrders } = await supabase
        .from("change_orders")
        .select("division_number, amount, status")
        .eq("project_id", project.id)
        .eq("status", "Approved");

      if (budgetLines && budgetLines.length > 0) {
        const originalTotal = budgetLines.reduce((s: number, l: any) => s + Number(l.scheduled_value), 0);
        const coTotal = (changeOrders ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
        const currentContractSum = originalTotal + coTotal;

        // Contract over budget
        if (isEnabled(orgId, "contract_over_budget") && currentContractSum > originalTotal && coTotal > 0) {
          const key = `${project.id}:contract_over_budget`;
          if (!existingAlertSet.has(key)) {
            newAlerts.push({
              project_id: project.id,
              alert_type: "contract_over_budget",
              message: `Change orders have pushed the contract sum $${Math.round(coTotal).toLocaleString()} over the original budget.`,
              severity: "critical",
            });
          }
        } else {
          resolvedKeys.push(`${project.id}:contract_over_budget`);
        }

        // Line item over budget
        if (isEnabled(orgId, "line_item_over_budget") && transactions) {
          const spendByDiv = new Map<string, number>();
          for (const t of transactions) {
            spendByDiv.set(t.division_number, (spendByDiv.get(t.division_number) ?? 0) + Number(t.amount));
          }
          let anyOverBudget = false;
          for (const line of budgetLines) {
            const spend = spendByDiv.get(line.division_number) ?? 0;
            if (spend > Number(line.scheduled_value) && Number(line.scheduled_value) > 0) {
              anyOverBudget = true;
              const key = `${project.id}:line_item_over_budget`;
              if (!existingAlertSet.has(key)) {
                newAlerts.push({
                  project_id: project.id,
                  alert_type: "line_item_over_budget",
                  message: `${line.division_number} ${line.division_name} is over budget by $${Math.round(spend - Number(line.scheduled_value)).toLocaleString()}.`,
                  severity: "warning",
                });
              }
              break; // One alert per project
            }
          }
          if (!anyOverBudget) {
            resolvedKeys.push(`${project.id}:line_item_over_budget`);
          }
        }

        // Spend threshold
        if (isEnabled(orgId, "spend_threshold") && transactions) {
          const totalSpend = transactions.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const threshold1 = getThreshold(orgId, "spend_threshold", 80);
          const pct = originalTotal > 0 ? (totalSpend / originalTotal) * 100 : 0;
          if (pct >= threshold1) {
            const key = `${project.id}:spend_threshold`;
            if (!existingAlertSet.has(key)) {
              newAlerts.push({
                project_id: project.id,
                alert_type: "spend_threshold",
                message: `Project spend has reached ${Math.round(pct)}% of total budget.`,
                severity: pct >= 90 ? "critical" : "warning",
              });
            }
          } else {
            resolvedKeys.push(`${project.id}:spend_threshold`);
          }
        }
      }

      // === Schedule & Milestones ===

      // Milestone overdue
      if (isEnabled(orgId, "milestone_overdue")) {
        const { data: milestones } = await supabase
          .from("schedule_milestones")
          .select("name, planned_date, actual_date")
          .eq("project_id", project.id)
          .is("actual_date", null)
          .lt("planned_date", new Date().toISOString().split("T")[0]);

        if (milestones && milestones.length > 0) {
          const key = `${project.id}:milestone_overdue`;
          if (!existingAlertSet.has(key)) {
            newAlerts.push({
              project_id: project.id,
              alert_type: "milestone_overdue",
              message: `Milestone "${milestones[0].name}" is overdue (planned ${milestones[0].planned_date}).`,
              severity: "warning",
            });
          }
        } else {
          resolvedKeys.push(`${project.id}:milestone_overdue`);
        }
      }

      // No weekly report
      const projectStatus = statusMap.get(project.id);
      if (isEnabled(orgId, "no_weekly_report") && projectStatus === "Under Construction") {
        const dayThreshold = getThreshold(orgId, "no_weekly_report", 14);
        const cutoff = new Date(Date.now() - dayThreshold * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("weekly_report_attachments")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .gte("created_at", cutoff);

        if ((count ?? 0) === 0) {
          const key = `${project.id}:no_weekly_report`;
          if (!existingAlertSet.has(key)) {
            newAlerts.push({
              project_id: project.id,
              alert_type: "no_weekly_report",
              message: `No weekly report submitted in the past ${dayThreshold} days.`,
              severity: "warning",
            });
          }
        } else {
          resolvedKeys.push(`${project.id}:no_weekly_report`);
        }
      }

      // === Capital & Cash ===

      // Equity over commitment
      if (isEnabled(orgId, "equity_over_commitment")) {
        const { data: equitySources } = await supabase
          .from("capital_equity_sources")
          .select("total_commitment, equity_called")
          .eq("project_id", project.id);

        if (equitySources && equitySources.length > 0) {
          const totalCommit = equitySources.reduce((s: number, e: any) => s + Number(e.total_commitment), 0);
          const totalCalled = equitySources.reduce((s: number, e: any) => s + Number(e.equity_called), 0);
          if (totalCalled > totalCommit && totalCommit > 0) {
            const key = `${project.id}:equity_over_commitment`;
            if (!existingAlertSet.has(key)) {
              newAlerts.push({
                project_id: project.id,
                alert_type: "equity_over_commitment",
                message: `Equity called ($${Math.round(totalCalled).toLocaleString()}) exceeds commitment ($${Math.round(totalCommit).toLocaleString()}).`,
                severity: "critical",
              });
            }
          } else {
            resolvedKeys.push(`${project.id}:equity_over_commitment`);
          }
        }
      }

      // Debt over commitment
      if (isEnabled(orgId, "debt_over_commitment")) {
        const { data: debtTranches } = await supabase
          .from("capital_debt_tranches")
          .select("loan_amount")
          .eq("project_id", project.id);

        // Check draws vs debt commitment
        const { data: draws } = await supabase
          .from("draw_history")
          .select("total_amount")
          .eq("project_id", project.id);

        if (debtTranches && debtTranches.length > 0) {
          const totalDebt = debtTranches.reduce((s: number, d: any) => s + Number(d.loan_amount), 0);
          const totalDrawn = (draws ?? []).reduce((s: number, d: any) => s + Number(d.total_amount), 0);
          if (totalDrawn > totalDebt && totalDebt > 0) {
            const key = `${project.id}:debt_over_commitment`;
            if (!existingAlertSet.has(key)) {
              newAlerts.push({
                project_id: project.id,
                alert_type: "debt_over_commitment",
                message: `Debt drawn ($${Math.round(totalDrawn).toLocaleString()}) exceeds committed loan amount ($${Math.round(totalDebt).toLocaleString()}).`,
                severity: "critical",
              });
            }
          } else {
            resolvedKeys.push(`${project.id}:debt_over_commitment`);
          }
        }
      }

      // === Document & Compliance ===

      // No draw activity
      if (isEnabled(orgId, "no_draw_activity") && projectStatus === "Under Construction") {
        const dayThreshold = getThreshold(orgId, "no_draw_activity", 45);
        const cutoff = new Date(Date.now() - dayThreshold * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("draw_history")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .gte("created_at", cutoff);

        if ((count ?? 0) === 0) {
          const key = `${project.id}:no_draw_activity`;
          if (!existingAlertSet.has(key)) {
            newAlerts.push({
              project_id: project.id,
              alert_type: "no_draw_activity",
              message: `No draw submitted in the past ${dayThreshold} days.`,
              severity: "warning",
            });
          }
        } else {
          resolvedKeys.push(`${project.id}:no_draw_activity`);
        }
      }
    }

    // Insert new alerts
    if (newAlerts.length > 0) {
      await supabase.from("alerts").insert(newAlerts);
    }

    // Resolve alerts that are no longer true
    for (const key of resolvedKeys) {
      const [projectId, alertType] = key.split(":");
      if (existingAlertSet.has(key)) {
        await supabase
          .from("alerts")
          .update({ resolved_at: new Date().toISOString() })
          .eq("project_id", projectId)
          .eq("alert_type", alertType)
          .is("resolved_at", null);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Checked ${projects.length} projects. Created ${newAlerts.length} new alerts. Resolved ${resolvedKeys.filter(k => existingAlertSet.has(k)).length} alerts.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-alerts error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
