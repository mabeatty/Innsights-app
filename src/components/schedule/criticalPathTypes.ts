export interface GanttUpload {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  file_path: string | null;
  notes: string | null;
  created_at: string;
}

export type TaskStatus = "Not Started" | "In Progress" | "Complete" | "At Risk" | "Delayed";

export interface CriticalPathTask {
  id: string;
  project_id: string;
  gantt_upload_id: string | null;
  task_name: string;
  workflow_group: string | null;
  trade: string | null;
  predecessor_task_id: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  is_critical: boolean;
  status: TaskStatus;
  source: "upload" | "manual";
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeOrderScheduleImpact {
  id: string;
  change_order_id: string;
  critical_path_task_id: string;
  impact_days: number;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
}

export const TASK_STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Complete", "At Risk", "Delayed"];

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  "Not Started": "hsl(215 16% 47%)",
  "In Progress": "hsl(217 91% 60%)",
  "Complete": "hsl(142 71% 45%)",
  "At Risk": "hsl(38 92% 50%)",
  "Delayed": "hsl(0 84% 60%)",
};

/** Draft task row shape produced by AI extraction, before it's saved. */
export interface DraftTask {
  task_name: string;
  workflow_group?: string | null;
  trade?: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  is_critical: boolean;
  predecessor_task_name?: string | null;
}

// Consistent per-project color coding driven by whatever grouping the
// contractor's own schedule actually shows (task.workflow_group) — never a
// fixed taxonomy Innsights imposes. Two projects with different GCs can (and
// will) have entirely different group names; that's correct, not a bug.
//
// A parent group gets one hue, deterministically assigned from a fixed
// rotation ordered by first appearance in the task list (so the same
// project always colors the same way across reloads without needing to
// persist a color choice anywhere). Sub-tasks sharing that group get the
// same hue at varying lightness, so they read as "clearly part of Sitework"
// while still being visually distinguishable from one another.
const GROUP_HUE_ROTATION = [217, 25, 142, 271, 199, 48, 340, 172, 291, 12];

export function buildWorkflowColorMap(tasks: { workflow_group: string | null }[]): Map<string, string> {
  const seenGroups: string[] = [];
  for (const t of tasks) {
    if (t.workflow_group && !seenGroups.includes(t.workflow_group)) seenGroups.push(t.workflow_group);
  }
  const map = new Map<string, string>();
  seenGroups.forEach((group, i) => {
    const hue = GROUP_HUE_ROTATION[i % GROUP_HUE_ROTATION.length];
    map.set(group, `hsl(${hue} 65% 50%)`);
  });
  return map;
}

/**
 * The actual bar color for one task: critical-path always wins (solid red,
 * unchanged behavior); otherwise a shade of its workflow_group's hue if it
 * has one, varied by task index within that group so sub-tasks are
 * distinguishable but obviously related; otherwise falls back to the
 * original status-based color for ungrouped tasks (e.g. manually-entered
 * tasks with no workflow_group set, or schedules with no real grouping
 * structure to extract).
 */
export function workflowTaskColor(
  task: { workflow_group: string | null; status: TaskStatus; is_critical: boolean },
  indexWithinGroup: number,
  groupColorMap: Map<string, string>,
): string {
  if (task.is_critical) return "#DC2626"; // unchanged critical-path red, kept in sync with CriticalPathGantt's CRITICAL_COLOR
  const baseColor = task.workflow_group ? groupColorMap.get(task.workflow_group) : null;
  if (!baseColor) return TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS["Not Started"];
  const hueMatch = baseColor.match(/hsl\((\d+)/);
  const hue = hueMatch ? Number(hueMatch[1]) : 217;
  // Alternate lightness within a group (65/50/40/58...) so 4-5 sub-tasks in
  // a row are each visually distinct without straying from the family hue.
  const lightnessSteps = [50, 40, 60, 33, 55];
  const lightness = lightnessSteps[indexWithinGroup % lightnessSteps.length];
  return `hsl(${hue} 60% ${lightness}%)`;
}
