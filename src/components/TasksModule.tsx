import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RefreshCw, AlertTriangle, ChevronDown, ChevronRight, Plus, X, CalendarIcon, ListTodo, ListTree, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";

interface ClickUpAssignee {
  id: number;
  username: string;
  initials: string;
  profilePicture: string | null;
  color?: string;
}
interface ClickUpStatus { name: string; color: string; }
interface ClickUpTask {
  id: string;
  name: string;
  status: ClickUpStatus;
  due_date: number | null;
  parent: string | null;
  subtasks_count: number;
  dependencies_count: number;
  assignees: ClickUpAssignee[];
  tags: { name: string; tag_bg: string; tag_fg: string }[];
}
interface ListStatus { status: string; color: string; orderindex: number; type: string; }
interface ListMember { id: number; username: string; email: string; initials: string; color: string; profilePicture: string | null; }

interface TasksModuleProps {
  projectId: string;
  clickupListId: string | null;
  organizationId: string | null;
}

const initialsOf = (name: string) => name?.charAt(0)?.toUpperCase() || "?";

export default function TasksModule({ clickupListId, organizationId }: TasksModuleProps) {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [statuses, setStatuses] = useState<ListStatus[]>([]);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [newTaskGroup, setNewTaskGroup] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Which parent tasks have their subtask rows collapsed (indented children
  // hidden). Default expanded — a parent's subtasks are the whole reason
  // "can't see subtasks" was the complaint, so hiding them by default would
  // just recreate the same problem.
  const [collapsedSubtaskParents, setCollapsedSubtaskParents] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    if (!clickupListId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-clickup-tasks", {
        body: { list_id: clickupListId, org_id: organizationId },
      });
      if (fnError) throw fnError;
      if (data && data.ok === false) throw new Error(data.error || "Unknown error from ClickUp");
      setTasks(data?.tasks || []);
      setStatuses(data?.statuses || []);
      setMembers(data?.members || []);
      setLastSynced(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to fetch tasks");
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [clickupListId, organizationId]);

  useEffect(() => {
    // Re-run whenever the list ID itself changes (including switching to a
    // different project's list) — not just once ever. hasFetched previously
    // gated this and, since it's never reset, permanently blocked every
    // fetch after the first successful one: switching projects updated
    // clickupListId correctly and this effect re-ran, but the fetch itself
    // was silently skipped because hasFetched was already true from the
    // prior project.
    if (clickupListId) fetchTasks();
    else {
      // No list for this project — clear out the previous project's data
      // rather than leaving stale tasks on screen.
      setTasks([]);
      setStatuses([]);
      setMembers([]);
      setHasFetched(false);
      setError(null);
      setCollapsedGroups(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickupListId]);

  useEffect(() => {
    if (newTaskGroup) newTaskInputRef.current?.focus();
  }, [newTaskGroup]);

  const withSaving = async (taskId: string, fn: () => Promise<void>) => {
    setSavingTaskIds((prev) => new Set(prev).add(taskId));
    try {
      await fn();
    } finally {
      setSavingTaskIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    }
  };

  const updateTaskStatus = (task: ClickUpTask, newStatus: string) =>
    withSaving(task.id, async () => {
      const prevTasks = tasks;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: { ...t.status, name: newStatus } } : t)));
      const { data, error: fnError } = await supabase.functions.invoke("clickup-update-task", {
        body: { task_id: task.id, org_id: organizationId, status: newStatus },
      });
      if (fnError || data?.ok === false) {
        setTasks(prevTasks);
        toast.error(data?.error || fnError?.message || "Failed to update status");
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
    });

  const updateTaskDueDate = (task: ClickUpTask, date: Date | undefined) =>
    withSaving(task.id, async () => {
      const prevTasks = tasks;
      const ms = date ? date.getTime() : null;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: ms } : t)));
      const { data, error: fnError } = await supabase.functions.invoke("clickup-update-task", {
        body: { task_id: task.id, org_id: organizationId, due_date: ms },
      });
      if (fnError || data?.ok === false) {
        setTasks(prevTasks);
        toast.error(data?.error || fnError?.message || "Failed to update due date");
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
    });

  const toggleAssignee = (task: ClickUpTask, member: ListMember) =>
    withSaving(task.id, async () => {
      const isAssigned = task.assignees.some((a) => a.id === member.id);
      const prevTasks = tasks;
      setTasks((prev) => prev.map((t) => t.id === task.id
        ? { ...t, assignees: isAssigned ? t.assignees.filter((a) => a.id !== member.id) : [...t.assignees, { id: member.id, username: member.username, initials: member.initials, profilePicture: member.profilePicture, color: member.color }] }
        : t));
      const { data, error: fnError } = await supabase.functions.invoke("clickup-update-task", {
        body: {
          task_id: task.id, org_id: organizationId,
          add_assignees: isAssigned ? [] : [member.id],
          remove_assignees: isAssigned ? [member.id] : [],
        },
      });
      if (fnError || data?.ok === false) {
        setTasks(prevTasks);
        toast.error(data?.error || fnError?.message || "Failed to update assignee");
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
    });

  const createTask = async (statusName: string) => {
    const name = newTaskName.trim();
    if (!name || !clickupListId) { setNewTaskGroup(null); setNewTaskName(""); return; }
    setNewTaskGroup(null);
    setNewTaskName("");
    const { data, error: fnError } = await supabase.functions.invoke("clickup-create-task", {
      body: { list_id: clickupListId, org_id: organizationId, name, status: statusName },
    });
    if (fnError || data?.ok === false) {
      toast.error(data?.error || fnError?.message || "Failed to create task");
      return;
    }
    setTasks((prev) => [...prev, data.task]);
  };

  const toggleGroup = (name: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  if (!clickupListId) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <ListTodo className="h-10 w-10 text-muted-foreground mb-3 mx-auto" />
        <p className="text-sm font-medium text-foreground">Connect a ClickUp list in Project Info to enable task tracking.</p>
        <p className="text-xs text-muted-foreground mt-1">Add your ClickUp List ID in the Project Info panel above.</p>
      </div>
    );
  }

  const orderedStatusNames = statuses.length > 0
    ? statuses.map((s) => s.status)
    : Array.from(new Set(tasks.map((t) => t.status.name)));
  const statusColor = (name: string) => statuses.find((s) => s.status === name)?.color || tasks.find((t) => t.status.name === name)?.status.color || "#808080";

  // Real parent/child tree: group only top-level tasks (parent === null) by
  // status, matching ClickUp's own list view — a subtask nests under its
  // parent row wherever the parent lives, rather than appearing as its own
  // independent sibling in whatever status group its own status happens to
  // fall into. A subtask whose parent isn't in this list at all (e.g. the
  // parent lives in a different list) falls back to rendering as its own
  // top-level row so it's never silently hidden.
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  const subtasksByParent = new Map<string, ClickUpTask[]>();
  const topLevelTasks: ClickUpTask[] = [];
  tasks.forEach((t) => {
    if (t.parent && byId.has(t.parent)) {
      if (!subtasksByParent.has(t.parent)) subtasksByParent.set(t.parent, []);
      subtasksByParent.get(t.parent)!.push(t);
    } else {
      topLevelTasks.push(t);
    }
  });

  const tasksByStatus = new Map<string, ClickUpTask[]>();
  orderedStatusNames.forEach((s) => tasksByStatus.set(s, []));
  topLevelTasks.forEach((t) => {
    if (!tasksByStatus.has(t.status.name)) tasksByStatus.set(t.status.name, []);
    tasksByStatus.get(t.status.name)!.push(t);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          {lastSynced && (
            <p className="text-xs text-muted-foreground">Last synced: {format(lastSynced, "MMM d, yyyy h:mm a")}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchTasks} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{error}</div>
      )}

      {hasFetched && tasks.length === 0 && !error && orderedStatusNames.length === 0 && (
        <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">No tasks found in this list.</div>
      )}

      <div className="rounded-lg border overflow-hidden divide-y">
        {Array.from(tasksByStatus.entries()).map(([statusName, statusTasks]) => {
          const collapsed = collapsedGroups.has(statusName);
          const color = statusColor(statusName);

          const renderTaskRow = (task: ClickUpTask, indent: number) => {
            const overdue = task.due_date && isPast(new Date(task.due_date));
            const isSaving = savingTaskIds.has(task.id);
            const subtasks = subtasksByParent.get(task.id) ?? [];
            const subtasksCollapsed = collapsedSubtaskParents.has(task.id);
            return (
              <div key={task.id}>
                <div
                  className={cn("flex items-center gap-2 px-3 py-1.5 border-t hover:bg-muted/20 transition-colors", isSaving && "opacity-60")}
                  style={{ paddingLeft: `${8 + indent * 20}px` }}
                >
                  {subtasks.length > 0 ? (
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setCollapsedSubtaskParents((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                        return next;
                      })}
                    >
                      {subtasksCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="text-[10px] font-medium px-2 py-0.5 rounded shrink-0 whitespace-nowrap text-white"
                        style={{ backgroundColor: task.status.color }}
                        disabled={statuses.length === 0}
                      >
                        {task.status.name}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {statuses.map((s) => (
                        <DropdownMenuItem key={s.status} onClick={() => updateTaskStatus(task, s.status)}>
                          <span className="h-2 w-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                          {s.status}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    className="text-sm flex-1 truncate text-left hover:underline underline-offset-2"
                    onClick={() => setOpenTaskId(task.id)}
                  >
                    {task.name}
                  </button>

                  {subtasks.length > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0" title="Subtasks">
                      <ListTree className="h-3 w-3" /> {subtasks.length}
                    </span>
                  )}
                  {task.dependencies_count > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0" title="Has dependencies">
                      <Link2 className="h-3 w-3" /> {task.dependencies_count}
                    </span>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex -space-x-1 shrink-0" disabled={members.length === 0}>
                        {task.assignees.length > 0 ? (
                          task.assignees.slice(0, 3).map((a) => (
                            <div
                              key={a.id}
                              className="h-6 w-6 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-medium text-white"
                              style={{ backgroundColor: a.color || "#87909e" }}
                              title={a.username}
                            >
                              {a.initials || initialsOf(a.username)}
                            </div>
                          ))
                        ) : (
                          <div className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground">
                            <Plus className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {members.map((m) => {
                        const assigned = task.assignees.some((a) => a.id === m.id);
                        return (
                          <DropdownMenuItem key={m.id} onClick={() => toggleAssignee(task, m)} className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-medium text-white shrink-0" style={{ backgroundColor: m.color || "#87909e" }}>
                              {m.initials || initialsOf(m.username)}
                            </div>
                            <span className="flex-1 truncate">{m.username}</span>
                            {assigned && <span className="text-xs text-primary">✓</span>}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-1 text-xs shrink-0 px-1.5 py-0.5 rounded hover:bg-muted",
                          overdue ? "text-destructive font-medium" : "text-muted-foreground"
                        )}
                      >
                        {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarIcon className="h-3 w-3" />}
                        {task.due_date ? format(new Date(task.due_date), "MMM d") : "Set date"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={task.due_date ? new Date(task.due_date) : undefined}
                        onSelect={(date) => updateTaskDueDate(task, date)}
                      />
                      {task.due_date && (
                        <div className="border-t p-2">
                          <Button variant="ghost" size="sm" className="w-full gap-1 text-xs" onClick={() => updateTaskDueDate(task, undefined)}>
                            <X className="h-3 w-3" /> Clear date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {subtasks.length > 0 && !subtasksCollapsed && subtasks.map((sub) => renderTaskRow(sub, indent + 1))}
              </div>
            );
          };

          return (
            <div key={statusName}>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                onClick={() => toggleGroup(statusName)}
              >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs font-semibold uppercase tracking-wide">{statusName}</span>
                <span className="text-xs text-muted-foreground">{statusTasks.length}</span>
              </button>

              {!collapsed && (
                <div>
                  {statusTasks.map((task) => renderTaskRow(task, 0))}

                  {newTaskGroup === statusName ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 pl-8 border-t bg-muted/10">
                      <Input
                        ref={newTaskInputRef}
                        value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createTask(statusName);
                          if (e.key === "Escape") { setNewTaskGroup(null); setNewTaskName(""); }
                        }}
                        onBlur={() => { if (!newTaskName.trim()) setNewTaskGroup(null); }}
                        placeholder="Task name…"
                        className="h-7 text-sm"
                      />
                      <Button size="sm" className="h-7 shrink-0" onClick={() => createTask(statusName)}>Add</Button>
                    </div>
                  ) : (
                    <button
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 pl-8 border-t text-xs text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors"
                      onClick={() => setNewTaskGroup(statusName)}
                    >
                      <Plus className="h-3 w-3" /> Add Task
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TaskDetailDialog
        taskId={openTaskId}
        organizationId={organizationId}
        onClose={() => setOpenTaskId(null)}
        onOpenTask={(id) => setOpenTaskId(id)}
        onTaskUpdated={(taskId, patch) => {
          setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
        }}
      />
    </div>
  );
}
