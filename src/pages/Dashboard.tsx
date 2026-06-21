import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FolderPlus, ChevronRight, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useAlerts } from "@/hooks/useAlerts";



interface ProjectRow {
  id: string;
  name: string;
  updated_at: string;
  project_type: string;
  brands: { name: string } | null;
  _status?: string;
  _constructionStart?: string | null;
  _completionDate?: string | null;
  _infoType?: string | null;
  _projectCost?: number | null;
  _completedToDate?: number | null;
}

const fmtCost = (v: number) =>
  "$" + Math.round(v).toLocaleString("en-US");

const fmtCents = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Dashboard() {
  const { isConsultant, consultantProjectIds, accessLevel } = useAuth();
  const { getProjectsWithAlerts } = useAlerts();
  const projectsWithAlerts = getProjectsWithAlerts();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set());

  const toggleType = (label: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const toggleStatus = (key: string) => {
    setCollapsedStatuses(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  useEffect(() => {
    async function load() {
      const [{ data: projData }, { data: infoData }, { data: phaseData }, { data: budgetData }, { data: txnData }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, updated_at, project_type, brands(name)")
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_info")
          .select("project_id, project_status, project_type, target_opening_date"),
        supabase
          .from("schedule_phases")
          .select("project_id, start_date")
          .eq("sub_phase_number", "4.1"),
        supabase
          .from("project_budget")
          .select("project_id, scheduled_value"),
        supabase
          .from("budget_transactions")
          .select("project_id, amount, status"),
      ]);

      const statusMap = new Map<string, string>();
      const infoTypeMap = new Map<string, string>();
      const completionMap = new Map<string, string>();
      for (const info of infoData ?? []) {
        if (info.project_status) statusMap.set(info.project_id, info.project_status);
        if (info.project_type) infoTypeMap.set(info.project_id, info.project_type);
        if (info.target_opening_date) completionMap.set(info.project_id, info.target_opening_date);
      }

      const constructionStartMap = new Map<string, string>();
      for (const phase of phaseData ?? []) {
        if (phase.start_date) constructionStartMap.set(phase.project_id, phase.start_date);
      }

      const costMap = new Map<string, number>();
      for (const b of budgetData ?? []) {
        costMap.set(b.project_id, (costMap.get(b.project_id) ?? 0) + Number(b.scheduled_value));
      }

      // Completed to Date = sum of approved/paid/deferred transaction amounts,
      // matching the Executive Summary "Completed to Date" stat.
      const completedMap = new Map<string, number>();
      for (const t of txnData ?? []) {
        if (t.status === "Approved" || t.status === "Paid" || t.status === "Deferred") {
          completedMap.set(t.project_id, (completedMap.get(t.project_id) ?? 0) + Number(t.amount));
        }
      }

      let rows = ((projData as unknown as ProjectRow[]) ?? []).map(p => ({
        ...p,
        _status: statusMap.get(p.id) || "Draft",
        _constructionStart: constructionStartMap.get(p.id) ?? null,
        _completionDate: completionMap.get(p.id) ?? null,
        _infoType: infoTypeMap.get(p.id) ?? p.project_type ?? null,
        _projectCost: costMap.has(p.id) && costMap.get(p.id)! > 0 ? costMap.get(p.id)! : null,
        _completedToDate: completedMap.has(p.id) && completedMap.get(p.id)! > 0 ? completedMap.get(p.id)! : null,
      }));

      // Filter for consultants
      if (isConsultant) {
        rows = rows.filter((p) => consultantProjectIds.includes(p.id));
      }

      setProjects(rows);
      setLoading(false);
    }
    load();
  }, [isConsultant, consultantProjectIds]);

  const STATUS_ORDER = ["Under Construction", "Pre-Construction", "Design", "Prospecting", "Draft"];
  const TYPE_ORDER: { label: string; match: (t: string | null | undefined) => boolean }[] = [
    { label: "Development", match: (t) => t === "Development" || t === "New Construction" || t === "Conversion" },
    { label: "Asset Management", match: (t) => t === "Asset Management" || t === "Renovation" },
    { label: "Uncategorized", match: (t) => !t },
  ];

  const typeGroups = TYPE_ORDER.map((typeGroup) => {
    const typeProjects = projects.filter((p) => typeGroup.match(p._infoType));
    const statusGroups = STATUS_ORDER
      .map((status) => ({
        status,
        items: typeProjects
          .filter((p) => p._status === status)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.items.length > 0);
    return { label: typeGroup.label, statusGroups, total: typeProjects.length };
  }).filter((g) => g.total > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
        {!isConsultant && accessLevel !== "view" && (
          <Button asChild>
            <Link to="/new-project">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        )}
      </div>

      

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No projects yet.</p>
          {!isConsultant && <p className="text-sm mt-1">Create your first FF&E takeoff to get started.</p>}
          {isConsultant && <p className="text-sm mt-1">No projects have been assigned to you yet.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {typeGroups.map((typeGroup, groupIdx) => {
            const typeCollapsed = collapsedTypes.has(typeGroup.label);
            return (
              <div key={typeGroup.label} className="border rounded-md overflow-hidden bg-card">
                <table className="w-full table-dense" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  {groupIdx === 0 && (
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-center">Project</th>
                        <th className="text-center">Project Cost</th>
                        <th className="text-center">Completed to Date</th>
                        <th className="text-center">Construction Start</th>
                        <th className="text-center">Completion Date</th>
                        <th className="text-center">Last Updated</th>
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y">
                    <tr
                      className="cursor-pointer select-none"
                      onClick={() => toggleType(typeGroup.label)}
                    >
                      <td colSpan={6} className="bg-sidebar-accent py-2 px-3 text-left">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={`h-3.5 w-3.5 text-sidebar-accent-foreground transition-transform duration-200 ${typeCollapsed ? "" : "rotate-90"}`} />
                          <span className="text-xs font-bold uppercase tracking-wider text-sidebar-accent-foreground">
                            {typeGroup.label} ({typeGroup.total})
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!typeCollapsed && typeGroup.statusGroups.map((group) => {
                      const statusKey = `${typeGroup.label}-${group.status}`;
                      const statusCollapsed = collapsedStatuses.has(statusKey);
                      return (
                        <>
                          <tr
                            key={`status-${statusKey}`}
                            className="cursor-pointer select-none"
                            onClick={() => toggleStatus(statusKey)}
                          >
                            <td colSpan={6} className="bg-muted py-1.5 px-6 text-left">
                              <div className="flex items-center gap-2">
                                <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${statusCollapsed ? "" : "rotate-90"}`} />
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  {group.status} ({group.items.length})
                                </span>
                              </div>
                            </td>
                          </tr>
                          {!statusCollapsed && group.items.map((p) => (
                            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                              <td className="text-center">
                                <Link
                                  to={`/project/${p.id}`}
                                  className="text-primary hover:underline font-medium inline-flex items-center gap-1.5"
                                >
                                  {projectsWithAlerts.has(p.id) && (
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  )}
                                  {p.name}
                                </Link>
                              </td>
                              <td className="text-center text-foreground">
                                {p._projectCost != null ? fmtCost(p._projectCost) : "—"}
                              </td>
                              <td className="text-center text-foreground">
                                {p._completedToDate != null ? fmtCents(p._completedToDate) : "—"}
                              </td>
                              <td className="text-center text-muted-foreground">
                                {p._constructionStart
                                  ? format(new Date(p._constructionStart + "T00:00:00"), "MMM yyyy")
                                  : "—"}
                              </td>
                              <td className="text-center text-muted-foreground">
                                {p._completionDate
                                  ? format(new Date(p._completionDate + "T00:00:00"), "MMM yyyy")
                                  : "—"}
                              </td>
                              <td className="text-center text-muted-foreground">
                                {format(new Date(p.updated_at), "MMM d, yyyy")}
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
