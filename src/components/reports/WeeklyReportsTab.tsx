import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MessageSquare, ChevronDown, ChevronUp, FileText, Send, Download, X } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek } from "date-fns";

interface Attachment {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
}

interface Report {
  id: string;
  date_range_start: string;
  date_range_end: string;
  content: string;
  created_at: string;
  created_by: string;
  author_name: string;
  comment_count: number;
  attachments: Attachment[];
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
}

interface WeeklyReportsTabProps {
  projectId: string;
  canEdit: boolean;
}

export default function WeeklyReportsTab({ projectId, canEdit }: WeeklyReportsTabProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<Attachment[]>([]);

  // Delete
  const [deleteReport, setDeleteReport] = useState<Report | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Expanded report
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("user_id, first_name, last_name");
    const map = new Map<string, string>();
    data?.forEach((p) => map.set(p.user_id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown"));
    setProfiles(map);
    return map;
  }, []);

  const fetchReports = useCallback(async (profileMap?: Map<string, string>) => {
    const map = profileMap || profiles;
    const { data: reportRows } = await supabase
      .from("weekly_reports")
      .select("id, date_range_start, date_range_end, content, created_at, created_by")
      .eq("project_id", projectId)
      .order("date_range_start", { ascending: false });

    if (!reportRows) { setReports([]); setLoading(false); return; }

    const reportIds = reportRows.map((r) => r.id);

    // Fetch comments counts and attachments in parallel
    const [commentsResult, attachmentsResult] = await Promise.all([
      supabase.from("weekly_report_comments").select("report_id").in("report_id", reportIds),
      supabase.from("weekly_report_attachments").select("id, report_id, storage_path, file_name, file_size").in("report_id", reportIds),
    ]);

    const commentCounts = new Map<string, number>();
    commentsResult.data?.forEach((c) => {
      commentCounts.set(c.report_id, (commentCounts.get(c.report_id) || 0) + 1);
    });

    const attachmentsByReport = new Map<string, Attachment[]>();
    attachmentsResult.data?.forEach((a) => {
      const rid = (a as any).report_id;
      if (!attachmentsByReport.has(rid)) attachmentsByReport.set(rid, []);
      attachmentsByReport.get(rid)!.push({ id: a.id, storage_path: a.storage_path, file_name: a.file_name, file_size: a.file_size });
    });

    const enriched: Report[] = reportRows.map((r) => ({
      ...r,
      author_name: map.get(r.created_by) || "Unknown",
      comment_count: commentCounts.get(r.id) ?? 0,
      attachments: attachmentsByReport.get(r.id) ?? [],
    }));

    setReports(enriched);
    setLoading(false);
  }, [projectId, profiles]);

  useEffect(() => {
    fetchProfiles().then((map) => fetchReports(map));
  }, [fetchProfiles, fetchReports]);

  const openAddReport = () => {
    setEditingReport(null);
    const now = new Date();
    setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setContent("");
    setPendingFiles([]);
    setExistingAttachments([]);
    setAttachmentsToDelete([]);
    setDialogOpen(true);
  };

  const openEditReport = (r: Report) => {
    setEditingReport(r);
    setStartDate(r.date_range_start);
    setEndDate(r.date_range_end);
    setContent(r.content);
    setPendingFiles([]);
    setExistingAttachments([...r.attachments]);
    setAttachmentsToDelete([]);
    setDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length !== files.length) toast.error("Only PDF files are allowed.");
    setPendingFiles((prev) => [...prev, ...pdfs]);
    e.target.value = "";
  };

  const removeExistingAttachment = (att: Attachment) => {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
    setAttachmentsToDelete((prev) => [...prev, att]);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadFiles = async (reportId: string): Promise<void> => {
    for (const file of pendingFiles) {
      const path = `${projectId}/${reportId}/${crypto.randomUUID()}_${file.name}`;
      const { error } = await supabase.storage.from("project-reports").upload(path, file);
      if (error) { toast.error(`Failed to upload ${file.name}`); continue; }
      await supabase.from("weekly_report_attachments").insert({
        report_id: reportId,
        project_id: projectId,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: user!.id,
      });
    }
  };

  const deleteAttachments = async () => {
    for (const att of attachmentsToDelete) {
      await supabase.storage.from("project-reports").remove([att.storage_path]);
      await supabase.from("weekly_report_attachments").delete().eq("id", att.id);
    }
  };

  const handleSave = async () => {
    if (!startDate || !endDate) {
      toast.error("Please fill in start and end dates.");
      return;
    }
    setSaving(true);
    try {
      let reportId: string;
      if (editingReport) {
        reportId = editingReport.id;
        await supabase.from("weekly_reports").update({
          date_range_start: startDate, date_range_end: endDate, content: content.trim(),
        }).eq("id", reportId);
      } else {
        const { data } = await supabase.from("weekly_reports").insert({
          project_id: projectId, date_range_start: startDate,
          date_range_end: endDate, content: (content || "").trim(), created_by: user!.id,
        }).select("id").single();
        reportId = data!.id;
      }

      await deleteAttachments();
      await uploadFiles(reportId);

      toast.success(editingReport ? "Report updated." : "Report created.");
      setDialogOpen(false);
      fetchReports();
    } catch (err: any) {
      toast.error(err?.message ?? "Error saving report.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteReport) return;
    setDeleting(true);
    try {
      // Delete storage files
      for (const att of deleteReport.attachments) {
        await supabase.storage.from("project-reports").remove([att.storage_path]);
      }
      await supabase.from("weekly_report_attachments").delete().eq("report_id", deleteReport.id);
      await supabase.from("weekly_report_comments").delete().eq("report_id", deleteReport.id);
      await supabase.from("weekly_reports").delete().eq("id", deleteReport.id);
      toast.success("Report deleted.");
      setDeleteReport(null);
      setDeleteConfirm("");
      if (expandedId === deleteReport.id) setExpandedId(null);
      fetchReports();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete report.");
    }
    setDeleting(false);
  };

  const downloadAttachment = async (att: Attachment) => {
    const { data, error } = await supabase.storage.from("project-reports").download(att.storage_path);
    if (error || !data) { toast.error("Download failed."); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = async (reportId: string) => {
    if (expandedId === reportId) { setExpandedId(null); return; }
    setExpandedId(reportId);
    const { data } = await supabase
      .from("weekly_report_comments")
      .select("id, user_id, content, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    setComments(
      (data ?? []).map((c) => ({ ...c, author_name: profiles.get(c.user_id) || "Unknown" }))
    );
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !expandedId) return;
    setSubmittingComment(true);
    await supabase.from("weekly_report_comments").insert({
      report_id: expandedId, user_id: user!.id, content: newComment.trim(),
    });
    setNewComment("");
    setSubmittingComment(false);
    toggleExpand(expandedId);
    fetchReports();
  };

  const formatRange = (start: string, end: string) => {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <p className="text-muted-foreground text-sm py-8">Loading reports…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{reports.length} report{reports.length !== 1 ? "s" : ""}</h3>
        {canEdit && (
          <Button size="sm" onClick={openAddReport} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Report
          </Button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No weekly reports yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="border rounded-lg bg-card">
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpand(r.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatRange(r.date_range_start, r.date_range_end)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.author_name} · {r.content.slice(0, 100)}{r.content.length > 100 ? "…" : ""}
                    {r.attachments.length > 0 && <span className="ml-2">📎 {r.attachments.length}</span>}
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <MessageSquare className="h-3 w-3" /> {r.comment_count}
                </Badge>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditReport(r); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteReport(r); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {expandedId === r.id ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>

              {expandedId === r.id && (
                <div className="border-t px-4 py-4 space-y-4">
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">{r.content}</div>

                  {/* Attachments */}
                  {r.attachments.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Attachments</p>
                      {r.attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                          <FileText className="h-4 w-4 text-destructive shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{att.file_name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(att.file_size)}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={() => downloadAttachment(att)}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comments */}
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comments</p>
                    {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
                    {comments.map((c) => (
                      <div key={c.id} className="text-sm space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-xs">{c.author_name}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, yyyy h:mm a")}</span>
                        </div>
                        <p className="text-sm text-foreground">{c.content}</p>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Input
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment…"
                        className="text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                      />
                      <Button size="icon" variant="secondary" className="shrink-0" onClick={handleAddComment} disabled={submittingComment || !newComment.trim()}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingReport ? "Edit Report" : "New Weekly Report"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Report Content</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="What happened this week…" />
            </div>
            <div className="space-y-2">
              <Label>PDF Attachments</Label>
              <Input type="file" accept="application/pdf" multiple onChange={handleFileSelect} />

              {/* Existing attachments (edit mode) */}
              {existingAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <FileText className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-sm flex-1 truncate">{att.file_name}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={() => removeExistingAttachment(att)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* Pending new files */}
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={() => removePendingFile(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingReport ? "Save Changes" : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReport} onOpenChange={(open) => { if (!open) { setDeleteReport(null); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this report and all its comments. Type <strong>delete</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type 'delete'" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirm !== "delete" || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
