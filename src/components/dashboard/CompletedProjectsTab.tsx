import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SummaryColGroup, SummaryHead, SummaryProjectRow, SUMMARY_COLUMN_COUNT, type SummaryProject,
} from "./ProjectSummaryTable";

export interface CompletedGroup {
  label: string;               // "Development" / "Asset Management" / "Uncategorized"
  items: SummaryProject[];
}

// Where completed projects live once they're off the Dashboard: the same table as the Project
// Summary (same columns, same cells, same Development / Asset Management sections), one click
// from each project's page. To reopen one, change its status in Project Info.
export default function CompletedProjectsTab({ groups, projectsWithAlerts }: { groups: CompletedGroup[]; projectsWithAlerts: Set<string> }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (label: string) =>
    setCollapsed((prev) => { const next = new Set(prev); if (!next.delete(label)) next.add(label); return next; });

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground" data-testid="completed-empty">
        <p>No completed projects yet.</p>
        <p className="mt-1 text-sm">Set a project's status to Completed in Project Info and it will move here, off the Dashboard.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Completed projects are hidden from the Project Summary and Master Calendar. Open one to see all of its records, or change its status in Project Info to reopen it.
      </p>
      <div className="space-y-6">
        {groups.map((group, groupIdx) => {
          const isCollapsed = collapsed.has(group.label);
          return (
            <div key={group.label} className="border rounded-md overflow-hidden bg-card">
              <table className="w-full table-dense" style={{ tableLayout: "fixed" }}>
                <SummaryColGroup />
                {groupIdx === 0 && <SummaryHead />}
                <tbody className="divide-y">
                  <tr className="cursor-pointer select-none" onClick={() => toggle(group.label)}>
                    <td colSpan={SUMMARY_COLUMN_COUNT} className="bg-sidebar-accent py-2 px-3 text-left">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-3.5 w-3.5 text-sidebar-accent-foreground transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`} />
                        <span className="text-xs font-bold uppercase tracking-wider text-sidebar-accent-foreground">
                          {group.label} ({group.items.length})
                        </span>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed && group.items.map((p) => (
                    <SummaryProjectRow key={p.id} project={p} hasAlert={projectsWithAlerts.has(p.id)} testId="completed-row" />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
