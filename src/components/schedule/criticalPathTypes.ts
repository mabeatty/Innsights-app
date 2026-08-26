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
  trade?: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  is_critical: boolean;
  predecessor_task_name?: string | null;
}
