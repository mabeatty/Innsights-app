import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, AlertTriangle, Clock, CheckCircle2, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, addDays, isAfter } from "date-fns";

interface ClickUpTask {
  id: string;
  name: string;
  status: { name: string; color: string };
  due_date: number | null;
  assignees: { id: number; username: string; initials: string; profilePicture: string | null }[];
  tags: { name: string; tag_bg: string; tag_fg: string }[];
}

interface TasksModuleProps {
  projectId: string;
  clickupListId: string | null;
  organizationId: string | null;
}

export default function TasksModule({ projectId, clickupListId, organizationId }: TasksModuleProps) {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

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
      setLastSynced(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to fetch tasks");
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [clickupListId]);

  // Auto-fetch on first render if list ID exists
  if (!hasFetched && clickupListId && !loading) {
    fetchTasks();
  }

  if (!clickupListId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ListTodo className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">Connect a ClickUp list in Project Info to enable task tracking.</p>
          <p className="text-xs text-muted-foreground mt-1">Add your ClickUp List ID in the Project Info panel above.</p>
        </CardContent>
      </Card>
    );
  }

  // Group tasks by tag
  const grouped: Record<string, ClickUpTask[]> = {};
  tasks.forEach((t) => {
    if (t.tags.length === 0) {
      (grouped["Uncategorized"] ??= []).push(t);
    } else {
      t.tags.forEach((tag) => {
        (grouped[tag.name] ??= []).push(t);
      });
    }
  });

  const now = new Date();
  const sevenDaysFromNow = addDays(now, 7);

  const getDueIndicator = (task: ClickUpTask) => {
    if (!task.due_date) return null;
    const dueDate = new Date(task.due_date);
    const isComplete = task.status.name.toLowerCase() === "closed" || task.status.name.toLowerCase() === "complete" || task.status.name.toLowerCase() === "done";
    if (isComplete) return null;
    if (isPast(dueDate)) return "overdue";
    if (!isAfter(dueDate, sevenDaysFromNow)) return "soon";
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {lastSynced && (
            <p className="text-xs text-muted-foreground">
              Last synced: {format(lastSynced, "MMM d, yyyy h:mm a")}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchTasks} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {hasFetched && tasks.length === 0 && !error && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No tasks found in this list.</CardContent>
        </Card>
      )}

      {/* Grouped tasks */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, groupTasks]) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {groupTasks.map((task) => {
              const indicator = getDueIndicator(task);
              return (
                <div key={task.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  {/* Status badge */}
                  <Badge
                    className="text-[10px] shrink-0 border-0"
                    style={{ backgroundColor: task.status.color, color: "#fff" }}
                  >
                    {task.status.name}
                  </Badge>

                  {/* Task name */}
                  <span className="text-sm flex-1 truncate">{task.name}</span>

                  {/* Due indicator */}
                  {indicator === "overdue" && (
                    <span className="flex items-center gap-1 text-xs text-destructive font-medium shrink-0">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                  {indicator === "soon" && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium shrink-0">
                      <Clock className="h-3 w-3" /> Due soon
                    </span>
                  )}

                  {/* Due date */}
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(task.due_date), "MMM d")}
                    </span>
                  )}

                  {/* Assignees */}
                  {task.assignees.length > 0 && (
                    <div className="flex -space-x-1 shrink-0">
                      {task.assignees.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium"
                          title={a.username}
                        >
                          {a.initials || a.username?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
