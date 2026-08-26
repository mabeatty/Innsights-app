import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CriticalPathTask, GanttUpload } from "./criticalPathTypes";

export function useCriticalPath(projectId: string) {
  const [tasks, setTasks] = useState<CriticalPathTask[]>([]);
  const [uploads, setUploads] = useState<GanttUpload[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, uploadsRes] = await Promise.all([
      supabase
        .from("critical_path_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("start_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("schedule_gantt_uploads")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
    ]);
    if (tasksRes.error) toast.error("Failed to load critical path.");
    else setTasks((tasksRes.data ?? []) as CriticalPathTask[]);
    if (!uploadsRes.error) setUploads((uploadsRes.data ?? []) as GanttUpload[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const addTask = useCallback(async (payload: Partial<CriticalPathTask>) => {
    const { error } = await supabase.from("critical_path_tasks").insert({ ...payload, project_id: projectId });
    if (error) { toast.error(`Failed to add task: ${error.message}`); return false; }
    await load();
    return true;
  }, [projectId, load]);

  const updateTask = useCallback(async (id: string, payload: Partial<CriticalPathTask>) => {
    const { error } = await supabase.from("critical_path_tasks").update(payload).eq("id", id);
    if (error) { toast.error(`Failed to update task: ${error.message}`); return false; }
    await load();
    return true;
  }, [load]);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from("critical_path_tasks").delete().eq("id", id);
    if (error) { toast.error(`Failed to delete task: ${error.message}`); return false; }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  /** Manual date/duration shift for a task, cascaded to critical successors via the DB function. */
  const shiftTask = useCallback(async (id: string, days: number) => {
    if (days === 0) return true;
    const { error } = await supabase.rpc("apply_schedule_impact", { p_task_id: id, p_days: days });
    if (error) { toast.error(`Failed to shift schedule: ${error.message}`); return false; }
    await load();
    return true;
  }, [load]);

  return { tasks, uploads, loading, addTask, updateTask, deleteTask, shiftTask, refetch: load };
}
