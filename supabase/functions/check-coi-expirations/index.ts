// Checks all contracts' COI requirements against certificates on file and
// emails the assigned Project Manager + Project Lead for any project with an
// expired, expiring-soon (<=30 days), insufficient, or missing certificate.
//
// Callable manually for now (no cron wired up yet — see check-alerts, which
// has the same status). Trigger with a POST to this function's URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPIRING_SOON_DAYS = 30;

type CoverageType =
  | "General Liability" | "Auto" | "Workers Comp" | "Umbrella/Excess"
  | "Errors & Omissions" | "Professional Liability";

interface CoiRequirement {
  id: string;
  contract_id: string;
  coverage_type: CoverageType;
  required_limit: number | null;
}

interface Coi {
  id: string;
  contract_id: string;
  coverage_type: CoverageType;
  actual_limit: number | null;
  expiration_date: string;
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((d.getTime() - utcNow) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: contracts } = await supabase
      .from("contracts")
      .select("id, project_id, contract_number, scope_summary, vendor_id, status")
      .eq("status", "Active");
    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ message: "No active contracts." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contractIds = contracts.map((c) => c.id);
    const [reqRes, certRes, vendorRes, projectRes] = await Promise.all([
      supabase.from("coi_requirements").select("*").in("contract_id", contractIds),
      supabase.from("certificates_of_insurance").select("*").in("contract_id", contractIds),
      supabase.from("vendors").select("id, name"),
      supabase.from("projects").select("id, name"),
    ]);

    const requirements = (reqRes.data ?? []) as CoiRequirement[];
    const certs = (certRes.data ?? []) as Coi[];
    const vendorNameById = new Map((vendorRes.data ?? []).map((v: any) => [v.id, v.name]));
    const projectNameById = new Map((projectRes.data ?? []).map((p: any) => [p.id, p.name]));

    // Build one issue row per (contract, coverage_type) that isn't clean.
    type Issue = { contractId: string; projectId: string; coverageType: string; status: string; detail: string };
    const issues: Issue[] = [];

    const reqsByContract = new Map<string, CoiRequirement[]>();
    for (const r of requirements) {
      if (!reqsByContract.has(r.contract_id)) reqsByContract.set(r.contract_id, []);
      reqsByContract.get(r.contract_id)!.push(r);
    }
    const certsByContractAndType = new Map<string, Coi[]>();
    for (const c of certs) {
      const key = `${c.contract_id}:${c.coverage_type}`;
      if (!certsByContractAndType.has(key)) certsByContractAndType.set(key, []);
      certsByContractAndType.get(key)!.push(c);
    }

    for (const contract of contracts) {
      const reqs = reqsByContract.get(contract.id) ?? [];
      for (const req of reqs) {
        const key = `${contract.id}:${req.coverage_type}`;
        const certsForType = (certsByContractAndType.get(key) ?? [])
          .sort((a, b) => new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime());
        const current = certsForType[0];

        if (!current) {
          issues.push({ contractId: contract.id, projectId: contract.project_id, coverageType: req.coverage_type, status: "Missing", detail: "No certificate on file." });
          continue;
        }
        const days = daysUntil(current.expiration_date);
        if (days < 0) {
          issues.push({ contractId: contract.id, projectId: contract.project_id, coverageType: req.coverage_type, status: "Expired", detail: `Expired ${current.expiration_date} (${Math.abs(days)} days ago).` });
        } else if (req.required_limit && current.actual_limit != null && current.actual_limit < req.required_limit) {
          issues.push({ contractId: contract.id, projectId: contract.project_id, coverageType: req.coverage_type, status: "Insufficient", detail: `Actual limit $${current.actual_limit.toLocaleString()} is below required $${req.required_limit.toLocaleString()}.` });
        } else if (days <= EXPIRING_SOON_DAYS) {
          issues.push({ contractId: contract.id, projectId: contract.project_id, coverageType: req.coverage_type, status: "Expiring Soon", detail: `Expires ${current.expiration_date} (${days} days).` });
        }
      }
    }

    if (issues.length === 0) {
      return new Response(JSON.stringify({ message: "No COI issues found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group issues by project, then look up that project's PM + Lead.
    const issuesByProject = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!issuesByProject.has(issue.projectId)) issuesByProject.set(issue.projectId, []);
      issuesByProject.get(issue.projectId)!.push(issue);
    }

    const projectIds = [...issuesByProject.keys()];
    const { data: approvers } = await supabase
      .from("project_approvers")
      .select("project_id, role, approver_id")
      .in("project_id", projectIds)
      .in("role", ["project_manager", "project_lead"]);

    const recipientIdsByProject = new Map<string, Set<string>>();
    for (const a of approvers ?? []) {
      if (!a.approver_id) continue;
      if (!recipientIdsByProject.has(a.project_id)) recipientIdsByProject.set(a.project_id, new Set());
      recipientIdsByProject.get(a.project_id)!.add(a.approver_id);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const fromAddr = Deno.env.get("RESEND_FROM") || "Innsights Alerts <alerts@notifications.innsights.app>";

    const results: Array<{ projectId: string; recipients: string[]; sent: boolean; error?: string }> = [];

    for (const [projectId, projectIssues] of issuesByProject) {
      const recipientIds = [...(recipientIdsByProject.get(projectId) ?? [])];
      const recipientEmails: string[] = [];
      for (const uid of recipientIds) {
        const { data } = await supabase.auth.admin.getUserById(uid);
        if (data?.user?.email) recipientEmails.push(data.user.email);
      }

      if (recipientEmails.length === 0) {
        results.push({ projectId, recipients: [], sent: false, error: "No Project Manager or Project Lead assigned." });
        continue;
      }

      const projectName = projectNameById.get(projectId) ?? "Unknown Project";
      const rows = projectIssues.map((i) => {
        const contract = contracts.find((c) => c.id === i.contractId);
        const vendor = contract ? vendorNameById.get(contract.vendor_id) ?? "Unknown Vendor" : "Unknown Vendor";
        const contractLabel = contract?.contract_number || contract?.scope_summary || "";
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${vendor}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${contractLabel}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.coverageType}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${i.status === "Expired" || i.status === "Insufficient" ? "#b91c1c" : "#b45309"};font-weight:600;">${i.status}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.detail}</td>
        </tr>`;
      }).join("");

      const html = `
        <div style="font-family:sans-serif;font-size:14px;color:#111;">
          <h2 style="margin-bottom:4px;">Certificate of Insurance Alert — ${projectName}</h2>
          <p style="color:#555;margin-top:0;">The following coverage items need attention:</p>
          <table style="border-collapse:collapse;width:100%;font-size:13px;">
            <thead>
              <tr style="background:#f5f5f5;text-align:left;">
                <th style="padding:6px 10px;">Vendor</th>
                <th style="padding:6px 10px;">Contract</th>
                <th style="padding:6px 10px;">Coverage</th>
                <th style="padding:6px 10px;">Status</th>
                <th style="padding:6px 10px;">Detail</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      if (!RESEND_API_KEY) {
        results.push({ projectId, recipients: recipientEmails, sent: false, error: "RESEND_API_KEY not configured." });
        continue;
      }

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddr,
          to: recipientEmails,
          subject: `COI Alert: ${projectIssues.length} item(s) need attention — ${projectName}`,
          html,
        }),
      });
      if (!resp.ok) {
        const out = await resp.json().catch(() => ({}));
        results.push({ projectId, recipients: recipientEmails, sent: false, error: out?.message || `Resend HTTP ${resp.status}` });
      } else {
        results.push({ projectId, recipients: recipientEmails, sent: true });
      }
    }

    return new Response(JSON.stringify({ issueCount: issues.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-coi-expirations error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
