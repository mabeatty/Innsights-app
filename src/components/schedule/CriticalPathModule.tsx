import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Upload, Pencil, Trash2, ArrowRightLeft, FileText, ExternalLink } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCriticalPath } from "./useCriticalPath";
import GanttUploadDialog from "./GanttUploadDialog";
import { TASK_STATUSES, type CriticalPathTask, type TaskStatus } from "./criticalPathTypes";

interface Props {
  projectId: string;
}

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "MM/dd/yy") : "—");

const statusPillClasses = (status: TaskStatus) =>
  cn(
    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
    status === "Not Started" && "bg-muted text-muted-foreground",
    status === "In Progress" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    status === "Complete" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "At Risk" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    status === "Delayed" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  );

export default function CriticalPathModule({ projectId }: Props) {
  const { tasks, uploads, loading, addTask, updateTask, deleteTask, shiftTask, refetch } = useCriticalPath(projectId);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CriticalPathTask | null>(null);

  const [shiftTarget, setShiftTarget] = useState<CriticalPathTask | null>(null);
  const [shiftDays, setShiftDays] = useState<number>(0);

  // Form state
  const [formName, setFormName] = useState("");
  const [formTrade, setFormTrade] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formDuration, setFormDuration] = useState<number | "">("");
  const [formCritical, setFormCritical] = useState(true);
  const [formStatus, setFormStatus] = useState<TaskStatus>("Not Started");
  const [formPredecessorId, setFormPredecessorId] = useState<string>("");
  const [formNotes, setFormNotes] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setFormName("");
    setFormTrade("");
    setFormStart("");
    setFormEnd("");
    setFormDuration("");
    setFormCritical(true);
    setFormStatus("Not Started");
    setFormPredecessorId("");
    setFormNotes("");
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (t: CriticalPathTask) => {
    setEditingId(t.id);
    setFormName(t.task_name);
    setFormTrade(t.trade ?? "");
    setFormStart(t.start_date ?? "");
    setFormEnd(t.end_date ?? "");
    setFormDuration(t.duration_days ?? "");
    setFormCritical(t.is_critical);
    setFormStatus(t.status);
    setFormPredecessorId(t.predecessor_task_id ?? "");
    setFormNotes(t.notes ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Task name is required.");
      return;
    }
    setSaving(true);
    const payload = {
      task_name: formName.trim(),
      trade: formTrade.trim() || null,
      start_date: formStart || null,
      end_date: formEnd || null,
      duration_days: formDuration === "" ? null : Number(formDuration),
      is_critical: formCritical,
      status: formStatus,
      predecessor_task_id: formPredecessorId || null,
      notes: formNotes.trim() || null,
    };
    const ok = editingId ? await updateTask(editingId, payload) : await addTask({ ...payload, source: "manual", sort_order: tasks.length });
    if (ok) {
      toast.success(editingId ? "Task updated." : "Task added.");
      setDialogOpen(false);
      resetForm();
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteTask(deleteTarget.id);
    if (ok) toast.success("Task removed.");
    setDeleteTarget(null);
  };

  const openShiftDialog = (t: CriticalPathTask) => {
    setShiftTarget(t);
    setShiftDays(0);
  };

  const confirmShift = async () => {
    if (!shiftTarget) return;
    const ok = await shiftTask(shiftTarget.id, shiftDays);
    if (ok) toast.success(`Shifted ${shiftTarget.task_name}${shiftDays >= 0 ? " +" : " "}${shiftDays} days (and critical successors).`);
    setShiftTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Critical Path</h3>
          {uploads.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <FileText className="h-3 w-3" /> Source: {uploads[0].file_name}
              {uploads[0].file_url && (
                <a href={uploads[0].file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5" /> Add Task
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Upload Gantt Chart
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Task</th>
              <th className="px-3 py-2 text-left font-medium">Trade</th>
              <th className="px-3 py-2 text-left font-medium">Start</th>
              <th className="px-3 py-2 text-left font-medium">End</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-center font-medium">Critical</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No critical path tasks yet. Upload the contractor's Gantt chart to get started.
                </td>
              </tr>
            )}
            {!loading && tasks.map((t) => {
              const duration = t.duration_days ?? (t.start_date && t.end_date ? differenceInCalendarDays(new Date(t.end_date), new Date(t.start_date)) : null);
              return (
                <tr key={t.id} className={cn("border-t", t.is_critical && "bg-red-50/40 dark:bg-red-950/10")}>
                  <td className="px-3 py-2">
                    <span className={cn(t.is_critical && "font-medium")}>{t.task_name}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.trade || "—"}</td>
                  <td className="px-3 py-2">{fmtDate(t.start_date)}</td>
                  <td className="px-3 py-2">{fmtDate(t.end_date)}</td>
                  <td className="px-3 py-2 text-right">{duration != null ? `${duration}d` : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {t.is_critical && <span className="inline-block h-2 w-2 rounded-full bg-red-500" title="On critical path" />}
                  </td>
                  <td className="px-3 py-2"><span className={statusPillClasses(t.status)}>{t.status}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Shift dates" onClick={() => openShiftDialog(t)}>
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditDialog(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeleteTarget(t)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <GanttUploadDialog projectId={projectId} open={uploadOpen} onOpenChange={setUploadOpen} onImported={refetch} />

      {/* Add/Edit Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Task" : "Add Task"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 col-span-2">
              <Label>Task Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Trade</Label>
              <Input value={formTrade} onChange={(e) => setFormTrade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (days)</Label>
              <Input type="number" value={formDuration} onChange={(e) => setFormDuration(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-1.5 flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={formCritical} onCheckedChange={(c) => setFormCritical(!!c)} />
                On critical path
              </label>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Predecessor Task</Label>
              <Select value={formPredecessorId} onValueChange={setFormPredecessorId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {tasks.filter((t) => t.id !== editingId).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.task_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Task</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove "{deleteTarget?.task_name}" from the critical path? This can't be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Shift Dialog */}
      <Dialog open={!!shiftTarget} onOpenChange={(o) => !o && setShiftTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Shift Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Shift "{shiftTarget?.task_name}" and cascade the same shift to any critical tasks that follow it.
          </p>
          <div className="space-y-1.5">
            <Label>Days to shift (negative pulls earlier)</Label>
            <Input type="number" value={shiftDays} onChange={(e) => setShiftDays(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftTarget(null)}>Cancel</Button>
            <Button onClick={confirmShift} disabled={shiftDays === 0}>Apply Shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
