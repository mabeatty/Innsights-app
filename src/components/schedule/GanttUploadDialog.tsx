import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Upload, Sparkles, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DraftTask } from "./criticalPathTypes";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export default function GanttUploadDialog({ projectId, open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [criticalPathIndicated, setCriticalPathIndicated] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setDrafts([]);
    setError(null);
    setCriticalPathIndicated(true);
  };

  const handleFile = async (f: File) => {
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF of the Gantt chart.");
      return;
    }
    setFile(f);
    setError(null);
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const { data } = await supabase.functions.invoke("extract-gantt-claude", {
        body: { pdfBase64: b64, mimeType: "application/pdf" },
      });
      if (data?.ok && Array.isArray(data.tasks)) {
        setDrafts(
          data.tasks.map((t: any) => ({
            task_name: t.task_name ?? "",
            workflow_group: t.workflow_group ?? "",
            trade: t.trade ?? "",
            start_date: t.start_date ?? null,
            end_date: t.end_date ?? null,
            duration_days: t.duration_days ?? null,
            is_critical: t.is_critical ?? true,
            predecessor_task_name: t.predecessor_task_name ?? null,
          })),
        );
        setCriticalPathIndicated(data.critical_path_indicated ?? true);
        if ((data.tasks as any[]).length === 0) {
          toast.warning("No tasks could be read from this PDF — you can add rows manually below.");
        } else {
          toast.success(`Extracted ${data.tasks.length} tasks — review and edit before saving.`);
        }
      } else {
        setError(data?.error || "Extraction failed. You can still add tasks manually below.");
      }
    } catch (err: any) {
      setError(err?.message || "Extraction failed. You can still add tasks manually below.");
    } finally {
      setExtracting(false);
    }
  };

  const updateDraft = (idx: number, patch: Partial<DraftTask>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const addBlankDraft = () => {
    setDrafts((prev) => [
      ...prev,
      { task_name: "", workflow_group: "", trade: "", start_date: null, end_date: null, duration_days: null, is_critical: true, predecessor_task_name: null },
    ]);
  };

  const handleSave = async () => {
    const validDrafts = drafts.filter((d) => d.task_name.trim());
    if (validDrafts.length === 0) {
      toast.error("Add at least one task before saving.");
      return;
    }
    setSaving(true);
    try {
      // 1. Upload the source PDF for reference, if provided.
      let ganttUploadId: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${projectId}/schedule/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("project-documents")
          .upload(path, file, { contentType: "application/pdf", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("project-documents").getPublicUrl(path);
        const { data: uploadRow, error: insErr } = await supabase
          .from("schedule_gantt_uploads")
          .insert({ project_id: projectId, file_name: file.name, file_url: pub.publicUrl, file_path: path })
          .select()
          .single();
        if (insErr) throw insErr;
        ganttUploadId = uploadRow.id;
      }

      // 2. Insert tasks first (without predecessor links), then resolve
      //    predecessor_task_name -> predecessor_task_id in a second pass,
      //    since names may not have DB ids until after insert.
      const inserted: { id: string; task_name: string }[] = [];
      for (let i = 0; i < validDrafts.length; i++) {
        const d = validDrafts[i];
        const { data: row, error: insErr } = await supabase
          .from("critical_path_tasks")
          .insert({
            project_id: projectId,
            gantt_upload_id: ganttUploadId,
            task_name: d.task_name.trim(),
            workflow_group: d.workflow_group?.trim() || null,
            trade: d.trade?.trim() || null,
            start_date: d.start_date,
            end_date: d.end_date,
            duration_days: d.duration_days,
            is_critical: d.is_critical,
            source: file ? "upload" : "manual",
            sort_order: i,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        inserted.push({ id: row.id, task_name: row.task_name });
      }

      const updates = validDrafts
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => d.predecessor_task_name)
        .map(({ d, i }) => {
          const pred = inserted.find((r) => r.task_name === d.predecessor_task_name);
          return pred ? { id: inserted[i].id, predecessor_task_id: pred.id } : null;
        })
        .filter(Boolean) as { id: string; predecessor_task_id: string }[];

      for (const u of updates) {
        await supabase.from("critical_path_tasks").update({ predecessor_task_id: u.predecessor_task_id }).eq("id", u.id);
      }

      toast.success(`Saved ${inserted.length} critical path tasks.`);
      reset();
      onOpenChange(false);
      onImported();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save tasks.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Contractor Gantt Chart</DialogTitle>
          <DialogDescription>
            Upload the GC's Gantt chart PDF. Claude will read it and draft a critical path task list below —
            review and correct anything before saving.
          </DialogDescription>
        </DialogHeader>

        {!file && (
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <Label htmlFor="gantt-pdf" className="cursor-pointer text-sm text-primary hover:underline">
              Choose a PDF file
            </Label>
            <Input
              id="gantt-pdf"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {file && (
          <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> {file.name}
            </span>
            {extracting && <span className="text-muted-foreground">Reading chart…</span>}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {!criticalPathIndicated && drafts.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            This chart didn't visually distinguish a critical path, so every task was marked critical by default — uncheck any that aren't.
          </div>
        )}

        {(drafts.length > 0 || (!extracting && file)) && (
          <div className="space-y-2">
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium min-w-[160px]">Task</th>
                    <th className="px-2 py-1.5 text-left font-medium min-w-[120px]">Workflow Group</th>
                    <th className="px-2 py-1.5 text-left font-medium min-w-[100px]">Trade</th>
                    <th className="px-2 py-1.5 text-left font-medium">Start</th>
                    <th className="px-2 py-1.5 text-left font-medium">End</th>
                    <th className="px-2 py-1.5 text-center font-medium">Critical</th>
                    <th className="px-2 py-1.5 text-left font-medium min-w-[140px]">Predecessor</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">
                        <Input className="h-7 text-xs" value={d.task_name} onChange={(e) => updateDraft(idx, { task_name: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-7 text-xs" value={d.workflow_group ?? ""} onChange={(e) => updateDraft(idx, { workflow_group: e.target.value })} placeholder="e.g. Sitework" />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-7 text-xs" value={d.trade ?? ""} onChange={(e) => updateDraft(idx, { trade: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="date" className="h-7 text-xs" value={d.start_date ?? ""} onChange={(e) => updateDraft(idx, { start_date: e.target.value || null })} />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="date" className="h-7 text-xs" value={d.end_date ?? ""} onChange={(e) => updateDraft(idx, { end_date: e.target.value || null })} />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <Checkbox checked={d.is_critical} onCheckedChange={(c) => updateDraft(idx, { is_critical: !!c })} />
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-7 text-xs" value={d.predecessor_task_name ?? ""} onChange={(e) => updateDraft(idx, { predecessor_task_name: e.target.value || null })} placeholder="Task name" />
                      </td>
                      <td className="px-2 py-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDraft(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={addBlankDraft}>+ Add row</Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || extracting || drafts.length === 0}>
            {saving ? "Saving…" : `Save ${drafts.filter((d) => d.task_name.trim()).length} Tasks`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
