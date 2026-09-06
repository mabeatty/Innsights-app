import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Loader2, ArrowUpRight, ArrowDownRight, ListTree } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface DetailStatus { name: string; color: string; }
interface SubtaskSummary { id: string; name: string; status: DetailStatus; due_date: number | null; }
interface DependencySummary { id: string; name: string; status: DetailStatus; relation: "waiting_on" | "blocking"; }
interface TaskDetail {
  id: string;
  name: string;
  description: string;
  status: DetailStatus;
  due_date: number | null;
  parent: string | null;
  url: string;
  subtasks: SubtaskSummary[];
  dependencies: DependencySummary[];
}

interface Props {
  taskId: string | null;
  organizationId: string | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onTaskUpdated?: (taskId: string, patch: { name?: string }) => void;
}

export default function TaskDetailDialog({ taskId, organizationId, onClose, onOpenTask, onTaskUpdated }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!taskId) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions.invoke("clickup-get-task-detail", { body: { task_id: taskId, org_id: organizationId } })
      .then(({ data, error: fnError }) => {
        if (cancelled) return;
        if (fnError || data?.ok === false) {
          setError(data?.error || fnError?.message || "Failed to load task");
          return;
        }
        setDetail(data.task);
        setName(data.task.name);
        setDescription(data.task.description || "");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, organizationId]);

  const save = async () => {
    if (!detail) return;
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error("Task name can't be empty."); return; }
    if (trimmedName === detail.name && description === (detail.description || "")) return;
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("clickup-update-task", {
        body: { task_id: detail.id, org_id: organizationId, name: trimmedName, description },
      });
      if (fnError || data?.ok === false) {
        toast.error(data?.error || fnError?.message || "Failed to save changes");
        return;
      }
      setDetail((prev) => (prev ? { ...prev, name: trimmedName, description } : prev));
      onTaskUpdated?.(detail.id, { name: trimmedName });
      toast.success("Saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading task…
          </div>
        )}

        {error && !loading && (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        )}

        {detail && !loading && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="sr-only">{detail.name}</DialogTitle>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded text-white shrink-0"
                  style={{ backgroundColor: detail.status.color }}
                >
                  {detail.status.name}
                </span>
                <a
                  href={detail.url} target="_blank" rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
                >
                  Open in ClickUp <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={save}
                className="text-base font-semibold h-auto py-1.5 px-2 -mx-2"
                placeholder="Task name"
              />

              {detail.parent && (
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenTask(detail.parent!)}
                >
                  <ListTree className="h-3 w-3" /> View parent task
                </button>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={save}
                  placeholder="Add a description…"
                  className="min-h-24 text-sm"
                />
              </div>

              {detail.dependencies.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Dependencies</p>
                  <div className="space-y-1">
                    {detail.dependencies.map((dep) => (
                      <button
                        key={dep.id}
                        className="w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted/40 transition-colors text-left"
                        onClick={() => onOpenTask(dep.id)}
                      >
                        {dep.relation === "waiting_on" ? (
                          <span title="Waiting on"><ArrowDownRight className="h-3.5 w-3.5 text-amber-600 shrink-0" /></span>
                        ) : (
                          <span title="Blocking"><ArrowUpRight className="h-3.5 w-3.5 text-destructive shrink-0" /></span>
                        )}
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white shrink-0"
                          style={{ backgroundColor: dep.status.color }}
                        >
                          {dep.status.name}
                        </span>
                        <span className="flex-1 truncate">{dep.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {dep.relation === "waiting_on" ? "Waiting on" : "Blocking"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {detail.subtasks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                    Subtasks ({detail.subtasks.length})
                  </p>
                  <div className="space-y-1">
                    {detail.subtasks.map((s) => (
                      <button
                        key={s.id}
                        className="w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted/40 transition-colors text-left"
                        onClick={() => onOpenTask(s.id)}
                      >
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white shrink-0"
                          style={{ backgroundColor: s.status.color }}
                        >
                          {s.status.name}
                        </span>
                        <span className="flex-1 truncate">{s.name}</span>
                        {s.due_date && (
                          <span className="text-xs text-muted-foreground shrink-0">{format(new Date(s.due_date), "MMM d")}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
