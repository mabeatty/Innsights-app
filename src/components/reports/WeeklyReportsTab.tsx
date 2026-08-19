import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Plus, Pencil, Trash2, MessageSquare, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, FileText, Send, Download, X, ExternalLink, Link2, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek } from "date-fns";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface Attachment {
  id: string;
  storage_path: string | null;
  drive_url: string | null;
  drive_file_id: string | null;
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

interface Album {
  id: string;
  report_id: string;
  photo_count: number;
  cover_url: string | null;
}

interface Photo {
  id: string;
  storage_path: string;
  file_name: string;
  url: string;
}

interface WeeklyReportsTabProps {
  projectId: string;
  projectName?: string;
  canEdit: boolean;
}

async function fetchPhotoBlob(storagePath: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from("project-photos").download(storagePath);
  if (error || !data) return null;
  return data;
}

async function getAlbumPhotos(albumId: string): Promise<{ storage_path: string; file_name: string }[]> {
  const { data } = await supabase
    .from("photo_album_photos")
    .select("storage_path, file_name")
    .eq("album_id", albumId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
}

export default function WeeklyReportsTab({ projectId, projectName, canEdit }: WeeklyReportsTabProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [albumsByReport, setAlbumsByReport] = useState<Map<string, Album>>(new Map());
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
  const [driveUrlInput, setDriveUrlInput] = useState("");
  const [pendingDriveLinks, setPendingDriveLinks] = useState<{ url: string; fileId: string | null; name: string }[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<Attachment[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [existingPhotoAlbum, setExistingPhotoAlbum] = useState<Album | null>(null);
  const [deletePhotoAlbum, setDeletePhotoAlbum] = useState(false);

  // Delete
  const [deleteReport, setDeleteReport] = useState<Report | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Expanded report
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Photo lightbox
  const [lightboxReport, setLightboxReport] = useState<Report | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<Photo[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [downloadingAlbum, setDownloadingAlbum] = useState(false);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);

  // Monthly rollup: which "MMMM yyyy" groups are expanded. Starts with just the
  // most recent month open so the list isn't overwhelming.
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

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
      supabase.from("weekly_report_attachments").select("id, report_id, storage_path, drive_url, drive_file_id, file_name, file_size").in("report_id", reportIds),
    ]);

    const commentCounts = new Map<string, number>();
    commentsResult.data?.forEach((c) => {
      commentCounts.set(c.report_id, (commentCounts.get(c.report_id) || 0) + 1);
    });

    const attachmentsByReport = new Map<string, Attachment[]>();
    attachmentsResult.data?.forEach((a) => {
      const rid = (a as any).report_id;
      if (!attachmentsByReport.has(rid)) attachmentsByReport.set(rid, []);
      attachmentsByReport.get(rid)!.push({
        id: a.id, storage_path: a.storage_path, drive_url: (a as any).drive_url,
        drive_file_id: (a as any).drive_file_id, file_name: a.file_name, file_size: a.file_size,
      });
    });

    const enriched: Report[] = reportRows.map((r) => ({
      ...r,
      author_name: map.get(r.created_by) || "Unknown",
      comment_count: commentCounts.get(r.id) ?? 0,
      attachments: attachmentsByReport.get(r.id) ?? [],
    }));

    setReports(enriched);

    // Fetch linked photo albums (one per report, at most) with a cover photo and count
    const { data: albumRows } = await supabase
      .from("photo_albums")
      .select("id, report_id")
      .in("report_id", reportIds);

    if (albumRows && albumRows.length > 0) {
      const albumIds = albumRows.map((a) => a.id);
      const [coverResult, countResult] = await Promise.all([
        supabase.from("photo_album_photos").select("album_id, storage_path, sort_order").in("album_id", albumIds).order("sort_order", { ascending: true }),
        supabase.from("photo_album_photos").select("album_id").in("album_id", albumIds),
      ]);
      const coverByAlbum = new Map<string, string>();
      coverResult.data?.forEach((p) => {
        if (!coverByAlbum.has(p.album_id)) coverByAlbum.set(p.album_id, p.storage_path);
      });
      const countByAlbum = new Map<string, number>();
      countResult.data?.forEach((p) => {
        countByAlbum.set(p.album_id, (countByAlbum.get(p.album_id) ?? 0) + 1);
      });
      const map2 = new Map<string, Album>();
      albumRows.forEach((a) => {
        const coverPath = coverByAlbum.get(a.id);
        const cover_url = coverPath ? supabase.storage.from("project-photos").getPublicUrl(coverPath).data.publicUrl : null;
        map2.set(a.report_id, { id: a.id, report_id: a.report_id, photo_count: countByAlbum.get(a.id) ?? 0, cover_url });
      });
      setAlbumsByReport(map2);
    } else {
      setAlbumsByReport(new Map());
    }

    setLoading(false);
  }, [projectId, profiles]);

  useEffect(() => {
    fetchProfiles().then((map) => fetchReports(map));
  }, [fetchProfiles, fetchReports]);

  // Group reports by the month of date_range_start. `reports` is already sorted
  // most-recent-first, so groups come out most-recent-month-first too.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, { label: string; reports: Report[] }>();
    for (const r of reports) {
      const d = new Date(r.date_range_start + "T00:00:00");
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMMM yyyy");
      if (!groups.has(key)) groups.set(key, { label, reports: [] });
      groups.get(key)!.reports.push(r);
    }
    return Array.from(groups.entries()).map(([key, v]) => ({ key, ...v }));
  }, [reports]);

  // Default to the most recent month expanded once reports first load.
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

  const openAddReport = () => {
    setEditingReport(null);
    const now = new Date();
    setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setContent("");
    setPendingFiles([]);
    setDriveUrlInput("");
    setPendingDriveLinks([]);
    setExistingAttachments([]);
    setAttachmentsToDelete([]);
    setPendingPhotos([]);
    setExistingPhotoAlbum(null);
    setDeletePhotoAlbum(false);
    setDialogOpen(true);
  };

  const openEditReport = (r: Report) => {
    setEditingReport(r);
    setStartDate(r.date_range_start);
    setEndDate(r.date_range_end);
    setContent(r.content);
    setPendingFiles([]);
    setDriveUrlInput("");
    setPendingDriveLinks([]);
    setExistingAttachments([...r.attachments]);
    setAttachmentsToDelete([]);
    setPendingPhotos([]);
    setExistingPhotoAlbum(albumsByReport.get(r.id) ?? null);
    setDeletePhotoAlbum(false);
    setDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length !== files.length) toast.error("Only PDF files are allowed.");
    setPendingFiles((prev) => [...prev, ...pdfs]);
    e.target.value = "";
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length !== files.length) toast.error("Only image files are allowed.");
    setPendingPhotos((prev) => [...prev, ...images]);
    e.target.value = "";
  };

  const removePendingPhoto = (idx: number) => {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Matches the file ID out of common Google Drive URL shapes:
  // /file/d/{id}/view, /drive/folders/{id}, or ?id={id}
  const extractDriveFileId = (url: string): string | null => {
    const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
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

  const removePendingDriveLink = (idx: number) => {
    setPendingDriveLinks((prev) => prev.filter((_, i) => i !== idx));
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
    for (const link of pendingDriveLinks) {
      await supabase.from("weekly_report_attachments").insert({
        report_id: reportId,
        project_id: projectId,
        storage_path: null,
        drive_url: link.url,
        drive_file_id: link.fileId,
        file_name: link.name,
        file_size: 0,
        uploaded_by: user!.id,
      });
    }
  };

  const deleteAttachments = async () => {
    for (const att of attachmentsToDelete) {
      if (att.storage_path) await supabase.storage.from("project-reports").remove([att.storage_path]);
      await supabase.from("weekly_report_attachments").delete().eq("id", att.id);
    }
  };

  // Creates the linked album on first photo upload, or reuses the existing one,
  // then uploads any newly-selected photos into it.
  const uploadPhotos = async (reportId: string): Promise<void> => {
    if (deletePhotoAlbum && existingPhotoAlbum) {
      const photos = await getAlbumPhotos(existingPhotoAlbum.id);
      if (photos.length > 0) await supabase.storage.from("project-photos").remove(photos.map((p) => p.storage_path));
      await supabase.from("photo_album_photos").delete().eq("album_id", existingPhotoAlbum.id);
      await supabase.from("photo_albums").delete().eq("id", existingPhotoAlbum.id);
      return;
    }
    if (pendingPhotos.length === 0) return;

    let albumId = existingPhotoAlbum?.id;
    if (!albumId) {
      const { data: newAlbum, error } = await supabase.from("photo_albums").insert({
        project_id: projectId, report_id: reportId,
        name: `Week of ${format(new Date(startDate + "T00:00:00"), "MMM d, yyyy")}`,
        created_by: user!.id,
      }).select("id").single();
      if (error || !newAlbum) { toast.error("Failed to create photo album."); return; }
      albumId = newAlbum.id;
    }

    const { count } = await supabase.from("photo_album_photos").select("id", { count: "exact", head: true }).eq("album_id", albumId);
    let sortOrder = count ?? 0;
    for (const file of pendingPhotos) {
      const path = `${projectId}/${albumId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("project-photos").upload(path, file);
      if (uploadError) { toast.error(`Failed to upload ${file.name}`); continue; }
      await supabase.from("photo_album_photos").insert({
        album_id: albumId, project_id: projectId,
        storage_path: path, file_name: file.name,
        sort_order: sortOrder++, uploaded_by: user!.id,
      });
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
      await uploadPhotos(reportId);

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
        if (att.storage_path) await supabase.storage.from("project-reports").remove([att.storage_path]);
      }
      await supabase.from("weekly_report_attachments").delete().eq("report_id", deleteReport.id);
      // Delete the linked photo album, if any
      const album = albumsByReport.get(deleteReport.id);
      if (album) {
        const photos = await getAlbumPhotos(album.id);
        if (photos.length > 0) await supabase.storage.from("project-photos").remove(photos.map((p) => p.storage_path));
        await supabase.from("photo_album_photos").delete().eq("album_id", album.id);
        await supabase.from("photo_albums").delete().eq("id", album.id);
      }
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
    if (att.drive_url) {
      window.open(att.drive_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!att.storage_path) { toast.error("No file source for this attachment."); return; }
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

  const openLightbox = async (r: Report) => {
    const album = albumsByReport.get(r.id);
    if (!album) return;
    const { data: photos } = await supabase
      .from("photo_album_photos").select("id, storage_path, file_name")
      .eq("album_id", album.id).order("sort_order", { ascending: true });
    if (!photos || photos.length === 0) { toast.info("No photos in this album."); return; }
    const enriched: Photo[] = photos.map((p) => {
      const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(p.storage_path);
      return { ...p, url: urlData.publicUrl };
    });
    setLightboxPhotos(enriched);
    setLightboxIdx(0);
    setLightboxReport(r);
  };

  const handleDownloadAlbum = async () => {
    if (!lightboxReport) return;
    const album = albumsByReport.get(lightboxReport.id);
    if (!album) return;
    setDownloadingAlbum(true);
    try {
      const photos = await getAlbumPhotos(album.id);
      const zip = new JSZip();
      await Promise.all(photos.map(async (p) => {
        const blob = await fetchPhotoBlob(p.storage_path);
        if (blob) zip.file(p.file_name, blob);
      }));
      const content = await zip.generateAsync({ type: "blob" });
      const label = `Week of ${formatRange(lightboxReport.date_range_start, lightboxReport.date_range_end)}`;
      saveAs(content, `${sanitizeFileName(label)}.zip`);
    } catch {
      toast.error("Failed to download album.");
    }
    setDownloadingAlbum(false);
  };

  const handleDownloadPhoto = async () => {
    const photo = lightboxPhotos[lightboxIdx];
    if (!photo) return;
    setDownloadingPhoto(true);
    try {
      const blob = await fetchPhotoBlob(photo.storage_path);
      if (blob) saveAs(blob, photo.file_name);
      else toast.error("Failed to download photo.");
    } catch {
      toast.error("Failed to download photo.");
    }
    setDownloadingPhoto(false);
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
                  <Badge variant="secondary" className="shrink-0">{group.reports.length}</Badge>
                </div>

                {monthOpen && (
                  <div className="border-t divide-y">
                    {group.reports.map((r) => (
                      <div key={r.id}>
                        <div className="flex items-center gap-2 pl-9 pr-3 py-1.5 hover:bg-muted/30 transition-colors">
                          <p className="text-sm flex-1 min-w-0 truncate">{formatRange(r.date_range_start, r.date_range_end)}</p>

                          {r.attachments.length === 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">No file</span>
                          )}
                          {r.attachments.map((att) => (
                            <Button
                              key={att.id}
                              size="sm"
                              variant="link"
                              className="h-auto py-0 px-1 gap-1 shrink-0 text-xs"
                              onClick={() => downloadAttachment(att)}
                            >
                              {att.drive_url ? <ExternalLink className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                              View Report
                            </Button>
                          ))}

                          {(() => {
                            const album = albumsByReport.get(r.id);
                            return album && album.photo_count > 0 ? (
                              <Button
                                size="sm"
                                variant="link"
                                className="h-auto py-0 px-1 gap-1 shrink-0 text-xs"
                                onClick={() => openLightbox(r)}
                              >
                                <ImageIcon className="h-3 w-3" />
                                Photos ({album.photo_count})
                              </Button>
                            ) : null;
                          })()}

                          {r.comment_count > 0 && (
                            <Badge variant="secondary" className="gap-1 shrink-0 h-5 text-xs">
                              <MessageSquare className="h-2.5 w-2.5" /> {r.comment_count}
                            </Badge>
                          )}
                          {canEdit && (
                            <div className="flex gap-0.5 shrink-0">
                              <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit" onClick={() => openEditReport(r)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Delete" onClick={() => setDeleteReport(r)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Expand" onClick={() => toggleExpand(r.id)}>
                            {expandedId === r.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </Button>
                        </div>

                        {expandedId === r.id && (
                          <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
                            {r.content && (
                              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">{r.content}</div>
                            )}

                            {/* Comments */}
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
                                  value={newComment}
                                  onChange={(e) => setNewComment(e.target.value)}
                                  placeholder="Add a comment…"
                                  className="text-sm"
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                                />
                                <Button size="icon" variant="secondary" className="shrink-0" title="Send comment" onClick={handleAddComment} disabled={submittingComment || !newComment.trim()}>
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
              </div>
            );
          })}
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

              <div className="flex gap-2">
                <Input
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  placeholder="Or paste a Google Drive link…"
                  className="text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDriveLink(); } }}
                />
                <Button type="button" variant="outline" size="icon" className="shrink-0" title="Add link" onClick={addDriveLink}>
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Existing attachments (edit mode) */}
              {existingAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  {att.drive_url ? <ExternalLink className="h-4 w-4 text-primary shrink-0" /> : <FileText className="h-4 w-4 text-destructive shrink-0" />}
                  <span className="text-sm flex-1 truncate">{att.file_name}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" title="Remove" onClick={() => removeExistingAttachment(att)}>
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
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" title="Remove" onClick={() => removePendingFile(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* Pending new Drive links */}
              {pendingDriveLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <ExternalLink className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{link.name}</span>
                  <span className="text-xs text-muted-foreground">Google Drive</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" title="Remove" onClick={() => removePendingDriveLink(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Photos</Label>
              <Input type="file" accept="image/*" multiple onChange={handlePhotoSelect} />

              {existingPhotoAlbum && !deletePhotoAlbum && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{existingPhotoAlbum.photo_count} photo{existingPhotoAlbum.photo_count !== 1 ? "s" : ""} already uploaded</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" title="Remove" onClick={() => setDeletePhotoAlbum(true)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {deletePhotoAlbum && (
                <p className="text-xs text-destructive">Existing photos will be deleted when you save.</p>
              )}

              {pendingPhotos.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" title="Remove" onClick={() => removePendingPhoto(i)}>
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

      {/* Photo Lightbox */}
      {lightboxReport && lightboxPhotos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxReport(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightboxReport(null)}>
            <X className="h-6 w-6" />
          </button>
          <p className="absolute top-4 left-4 text-white/70 text-sm">
            Week of {formatRange(lightboxReport.date_range_start, lightboxReport.date_range_end)} — {lightboxIdx + 1} / {lightboxPhotos.length}
          </p>
          <button
            className="absolute top-4 right-24 text-white/70 hover:text-white disabled:opacity-50"
            onClick={(e) => { e.stopPropagation(); handleDownloadAlbum(); }}
            disabled={downloadingAlbum}
            title="Download all photos"
          >
            {downloadingAlbum ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          </button>
          <button
            className="absolute top-4 right-14 text-white/70 hover:text-white disabled:opacity-50"
            onClick={(e) => { e.stopPropagation(); handleDownloadPhoto(); }}
            disabled={downloadingPhoto}
            title="Download this photo"
          >
            {downloadingPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          </button>
          {lightboxPhotos.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i - 1 + lightboxPhotos.length) % lightboxPhotos.length); }}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i + 1) % lightboxPhotos.length); }}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
          <img
            src={lightboxPhotos[lightboxIdx].url}
            alt={lightboxPhotos[lightboxIdx].file_name}
            className="max-h-[85vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
