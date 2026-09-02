import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, MessageSquare, Send, FileText,
  Download, X, ExternalLink, Link2, Loader2, Sparkles, AlertTriangle,
  ChevronDown, ChevronRight, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Attachment {
  id: string;
  storage_path: string | null;
  drive_url: string | null;
  drive_file_id: string | null;
  file_name: string;
  file_size: number;
  extracted_text?: string | null;
  extraction_status?: string;
  extraction_error?: string | null;
}

interface Meeting {
  id: string;
  meeting_date: string;
  title: string | null;
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

interface Props {
  projectId: string;
  projectName?: string;
  canEdit: boolean;
}

export default function OACMeetingsTab({ projectId, projectName, canEdit }: Props) {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formTitle, setFormTitle] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingDriveLinks, setPendingDriveLinks] = useState<{ url: string; fileId: string | null; name: string }[]>([]);
  const [driveUrlInput, setDriveUrlInput] = useState("");
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteMeeting, setDeleteMeeting] = useState<Meeting | null>(null);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [summaryDialogAtt, setSummaryDialogAtt] = useState<Attachment | null>(null);

  const [commentsByMeeting, setCommentsByMeeting] = useState<Map<string, Comment[]>>(new Map());
  const [commentDrafts, setCommentDrafts] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const { data: meetingRows, error } = await supabase
      .from("oac_meetings")
      .select("id, meeting_date, title, created_at, created_by")
      .eq("project_id", projectId)
      .order("meeting_date", { ascending: false });
    if (error || !meetingRows) { setLoading(false); return; }

    const meetingIds = meetingRows.map((m) => m.id);
    const userIds = Array.from(new Set(meetingRows.map((m) => m.created_by).filter(Boolean)));

    const [attachmentsResult, commentsResult, profilesResult] = await Promise.all([
      meetingIds.length > 0
        ? supabase.from("oac_meeting_attachments").select("id, meeting_id, storage_path, drive_url, drive_file_id, file_name, file_size, extracted_text, extraction_status, extraction_error").in("meeting_id", meetingIds)
        : Promise.resolve({ data: [] as any[] }),
      meetingIds.length > 0
        ? supabase.from("oac_meeting_comments").select("id, meeting_id, user_id, content, created_at").in("meeting_id", meetingIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      userIds.length > 0
        ? supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const nameByUser = new Map<string, string>();
    (profilesResult.data ?? []).forEach((p: any) => {
      nameByUser.set(p.user_id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown");
    });

    const attachmentsByMeeting = new Map<string, Attachment[]>();
    (attachmentsResult.data ?? []).forEach((a: any) => {
      const rid = a.meeting_id;
      if (!attachmentsByMeeting.has(rid)) attachmentsByMeeting.set(rid, []);
      attachmentsByMeeting.get(rid)!.push({
        id: a.id, storage_path: a.storage_path, drive_url: a.drive_url, drive_file_id: a.drive_file_id,
        file_name: a.file_name, file_size: a.file_size, extracted_text: a.extracted_text,
        extraction_status: a.extraction_status, extraction_error: a.extraction_error,
      });
    });

    const commentCounts = new Map<string, number>();
    const cByMeeting = new Map<string, Comment[]>();
    (commentsResult.data ?? []).forEach((c: any) => {
      commentCounts.set(c.meeting_id, (commentCounts.get(c.meeting_id) || 0) + 1);
      if (!cByMeeting.has(c.meeting_id)) cByMeeting.set(c.meeting_id, []);
      cByMeeting.get(c.meeting_id)!.push({
        id: c.id, user_id: c.user_id, content: c.content, created_at: c.created_at,
        author_name: nameByUser.get(c.user_id) ?? "Unknown",
      });
    });
    setCommentsByMeeting(cByMeeting);

    const enriched: Meeting[] = meetingRows.map((m) => ({
      id: m.id, meeting_date: m.meeting_date, title: m.title, created_at: m.created_at, created_by: m.created_by,
      author_name: nameByUser.get(m.created_by) ?? "Unknown",
      comment_count: commentCounts.get(m.id) ?? 0,
      attachments: attachmentsByMeeting.get(m.id) ?? [],
    }));
    setMeetings(enriched);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const openAddDialog = () => {
    setEditingId(null);
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormTitle("");
    setPendingFiles([]);
    setPendingDriveLinks([]);
    setDriveUrlInput("");
    setExistingAttachments([]);
    setAttachmentsToDelete([]);
    setDialogOpen(true);
  };

  const openEditDialog = (m: Meeting) => {
    setEditingId(m.id);
    setFormDate(m.meeting_date);
    setFormTitle(m.title ?? "");
    setPendingFiles([]);
    setPendingDriveLinks([]);
    setDriveUrlInput("");
    setExistingAttachments(m.attachments);
    setAttachmentsToDelete([]);
    setDialogOpen(true);
  };

  const extractDriveFileId = (url: string): string | null => {
    const patterns = [/\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const addDriveLink = () => {
    const url = driveUrlInput.trim();
    if (!url) return;
    if (!url.includes("drive.google.com") && !url.includes("docs.google.com")) {
      toast.error("That doesn't look like a Google Drive link.");
      return;
    }
    const fileId = extractDriveFileId(url);
    const name = fileId ? `Drive file (${fileId.slice(0, 8)}…)` : "Drive file";
    setPendingDriveLinks((prev) => [...prev, { url, fileId, name }]);
    setDriveUrlInput("");
  };

  const removePendingDriveLink = (idx: number) => setPendingDriveLinks((prev) => prev.filter((_, i) => i !== idx));
  const removePendingFile = (idx: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  const removeExistingAttachment = (att: Attachment) => {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
    setAttachmentsToDelete((prev) => [...prev, att]);
  };

  const uploadFiles = async (meetingId: string): Promise<void> => {
    for (const file of pendingFiles) {
      const path = `${projectId}/${meetingId}/${crypto.randomUUID()}_${file.name}`;
      const { error } = await supabase.storage.from("project-reports").upload(path, file);
      if (error) { toast.error(`Failed to upload ${file.name}`); continue; }
      await supabase.from("oac_meeting_attachments").insert({
        meeting_id: meetingId, project_id: projectId, storage_path: path,
        file_name: file.name, file_size: file.size, uploaded_by: user!.id,
      });
    }
    for (const link of pendingDriveLinks) {
      await supabase.from("oac_meeting_attachments").insert({
        meeting_id: meetingId, project_id: projectId, storage_path: null,
        drive_url: link.url, drive_file_id: link.fileId, file_name: link.name,
        file_size: 0, uploaded_by: user!.id,
      });
    }
  };

  const handleSave = async () => {
    if (!formDate) { toast.error("Meeting date is required."); return; }
    setSaving(true);
    try {
      let meetingId = editingId;
      if (editingId) {
        const { error } = await supabase.from("oac_meetings").update({
          meeting_date: formDate, title: formTitle.trim() || null,
        }).eq("id", editingId);
        if (error) throw error;
        for (const att of attachmentsToDelete) {
          if (att.storage_path) await supabase.storage.from("project-reports").remove([att.storage_path]);
          await supabase.from("oac_meeting_attachments").delete().eq("id", att.id);
        }
      } else {
        const { data: row, error } = await supabase.from("oac_meetings").insert({
          project_id: projectId, meeting_date: formDate, title: formTitle.trim() || null, created_by: user!.id,
        }).select().single();
        if (error) throw error;
        meetingId = row.id;
      }
      if (meetingId) await uploadFiles(meetingId);
      toast.success(editingId ? "Meeting updated." : "Meeting added.");
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteMeeting) return;
    for (const att of deleteMeeting.attachments) {
      if (att.storage_path) await supabase.storage.from("project-reports").remove([att.storage_path]);
    }
    const { error } = await supabase.from("oac_meetings").delete().eq("id", deleteMeeting.id);
    if (error) toast.error(error.message);
    else { toast.success("Meeting deleted."); await load(); }
    setDeleteMeeting(null);
  };

  const downloadAttachment = async (att: Attachment) => {
    if (att.drive_url) { window.open(att.drive_url, "_blank", "noopener,noreferrer"); return; }
    if (!att.storage_path) { toast.error("No file source for this attachment."); return; }
    const { data, error } = await supabase.storage.from("project-reports").download(att.storage_path);
    if (error || !data) { toast.error("Download failed."); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = att.file_name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const extractAttachment = async (att: Attachment) => {
    setExtractingIds((prev) => new Set(prev).add(att.id));
    try {
      const { data, error } = await supabase.functions.invoke("extract-oac-meeting-text", { body: { attachmentId: att.id } });
      if (error) throw error;
      if (!data?.ok) toast.error(data?.error || "Extraction failed.");
      else toast.success("Meeting content extracted — the assistant can now use it.");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Extraction failed.");
    } finally {
      setExtractingIds((prev) => { const next = new Set(prev); next.delete(att.id); return next; });
    }
  };

  const postComment = async (meetingId: string) => {
    const draft = (commentDrafts.get(meetingId) ?? "").trim();
    if (!draft) return;
    const { error } = await supabase.from("oac_meeting_comments").insert({ meeting_id: meetingId, user_id: user!.id, content: draft });
    if (error) { toast.error("Failed to post comment."); return; }
    setCommentDrafts((prev) => { const next = new Map(prev); next.set(meetingId, ""); return next; });
    await load();
  };

  // Group meetings by month, most-recent-first (meetings already sorted
  // that way) — matches Weekly Reports' monthly rollup exactly.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, { label: string; meetings: Meeting[] }>();
    for (const m of meetings) {
      const d = new Date(m.meeting_date + "T00:00:00");
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMMM yyyy");
      if (!groups.has(key)) groups.set(key, { label, meetings: [] });
      groups.get(key)!.meetings.push(m);
    }
    return Array.from(groups.entries()).map(([key, v]) => ({ key, ...v }));
  }, [meetings]);

  // Default to the most recent month expanded once meetings first load.
  useEffect(() => {
    if (monthGroups.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([monthGroups[0].key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthGroups.length]);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading OAC meetings…</p>;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">OAC Meetings</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Owner-Architect-Contractor meeting recap PDFs for {projectName || "this project"}.</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5" /> Add Meeting
          </Button>
        )}
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No OAC meetings yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monthGroups.map((group) => {
            const monthOpen = expandedMonths.has(group.key);
            return (
              <div key={group.key} className="border rounded-lg bg-card overflow-hidden">
                <div
                  className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleMonth(group.key)}
                >
                  {monthOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <p className="text-sm font-semibold flex-1">{group.label}</p>
                  <Badge variant="secondary" className="shrink-0">{group.meetings.length}</Badge>
                </div>

                {monthOpen && (
                  <div className="border-t divide-y">
                    {group.meetings.map((m) => {
                      const comments = commentsByMeeting.get(m.id) ?? [];
                      return (
                        <div key={m.id}>
                          <div className="flex items-center gap-2 pl-9 pr-3 py-1.5 hover:bg-muted/30 transition-colors">
                            <p className="text-sm flex-1 min-w-0 truncate">
                              {format(new Date(`${m.meeting_date}T00:00:00`), "MMM d, yyyy")}{m.title ? ` — ${m.title}` : ""}
                            </p>

                            {m.attachments.length === 0 && (
                              <span className="text-xs text-muted-foreground shrink-0">No file</span>
                            )}
                            {m.attachments.map((att) => (
                              <div key={att.id} className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm" variant="link" className="h-auto py-0 px-1 gap-1 shrink-0 text-xs"
                                  onClick={() => downloadAttachment(att)}
                                >
                                  {att.drive_url ? <ExternalLink className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                                  View Recap
                                </Button>
                                {att.extraction_status === "done" ? (
                                  <Button
                                    size="sm" variant="link" className="h-auto py-0 px-1 gap-1 shrink-0 text-xs text-primary"
                                    title="View extracted summary" onClick={() => setSummaryDialogAtt(att)}
                                  >
                                    <Sparkles className="h-3 w-3" /> Summary
                                  </Button>
                                ) : att.extraction_status === "unsupported" ? (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1" title={att.extraction_error ?? undefined}>
                                    <AlertTriangle className="h-3 w-3" /> Can't extract
                                  </span>
                                ) : (
                                  <Button
                                    size="sm" variant="link" className="h-auto py-0 px-1 gap-1 shrink-0 text-xs"
                                    title={att.extraction_status === "failed" ? `Extraction failed: ${att.extraction_error ?? ""} — click to retry` : "Extract content for the AI assistant"}
                                    disabled={extractingIds.has(att.id)} onClick={() => extractAttachment(att)}
                                  >
                                    {extractingIds.has(att.id) ? (
                                      <><Loader2 className="h-3 w-3 animate-spin" /> Extracting…</>
                                    ) : att.extraction_status === "failed" ? (
                                      <><AlertTriangle className="h-3 w-3 text-destructive" /> Retry Extract</>
                                    ) : (
                                      <><Sparkles className="h-3 w-3" /> Extract</>
                                    )}
                                  </Button>
                                )}
                              </div>
                            ))}

                            {m.comment_count > 0 && (
                              <Badge variant="secondary" className="gap-1 shrink-0 h-5 text-xs">
                                <MessageSquare className="h-2.5 w-2.5" /> {m.comment_count}
                              </Badge>
                            )}
                            {canEdit && (
                              <div className="flex gap-0.5 shrink-0">
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit" onClick={() => openEditDialog(m)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Delete" onClick={() => setDeleteMeeting(m)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Expand" onClick={() => toggleExpand(m.id)}>
                              {expandedId === m.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          </div>

                          {expandedId === m.id && (
                            <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
                              <div className="space-y-3">
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
                                    value={commentDrafts.get(m.id) ?? ""}
                                    onChange={(e) => setCommentDrafts((prev) => { const next = new Map(prev); next.set(m.id, e.target.value); return next; })}
                                    placeholder="Add a comment…" className="h-8 text-sm"
                                    onKeyDown={(e) => { if (e.key === "Enter") postComment(m.id); }}
                                  />
                                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => postComment(m.id)}><Send className="h-3.5 w-3.5" /></Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit OAC Meeting" : "Add OAC Meeting"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meeting Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Title (optional)</Label>
                <Input placeholder="e.g. Weekly OAC #12" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Attachments</Label>
              {existingAttachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between border rounded-md px-2 py-1.5 text-sm">
                  <span className="truncate">{att.file_name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeExistingAttachment(att)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between border rounded-md px-2 py-1.5 text-sm">
                  <span className="truncate">{f.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePendingFile(i)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              {pendingDriveLinks.map((l, i) => (
                <div key={i} className="flex items-center justify-between border rounded-md px-2 py-1.5 text-sm">
                  <span className="truncate flex items-center gap-1"><Link2 className="h-3 w-3" /> {l.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePendingDriveLink(i)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Input type="file" accept=".pdf" multiple onChange={(e) => setPendingFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
              <div className="flex items-center gap-2">
                <Input placeholder="Paste a Google Drive link" className="h-8 text-sm" value={driveUrlInput} onChange={(e) => setDriveUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addDriveLink(); }} />
                <Button size="sm" variant="outline" onClick={addDriveLink}>Add Link</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Meeting"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteMeeting} onOpenChange={(o) => !o && setDeleteMeeting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
            <AlertDialogDescription>This removes the meeting record, its attachments, and any comments. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!summaryDialogAtt} onOpenChange={(o) => !o && setSummaryDialogAtt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> {summaryDialogAtt?.file_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{summaryDialogAtt?.extracted_text}</p>
          <p className="text-xs text-muted-foreground">This summary is what the AI project assistant sees for this meeting — not the full document text.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryDialogAtt(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
