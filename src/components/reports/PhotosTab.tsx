import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X, ImageIcon, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface Album {
  id: string;
  name: string;
  created_at: string;
  cover_url: string | null;
  photo_count: number;
}

interface Photo {
  id: string;
  storage_path: string;
  file_name: string;
  url: string;
}

interface PhotosTabProps {
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

export default function PhotosTab({ projectId, projectName, canEdit }: PhotosTabProps) {
  const { user } = useAuth();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [albumName, setAlbumName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [deleteAlbum, setDeleteAlbum] = useState<Album | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [lightboxAlbum, setLightboxAlbum] = useState<Album | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<Photo[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  // Download states
  const [downloadingAlbumId, setDownloadingAlbumId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);

  const fetchAlbums = useCallback(async () => {
    const { data: albumRows } = await supabase
      .from("photo_albums")
      .select("id, name, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!albumRows) { setAlbums([]); setLoading(false); return; }

    const enriched: Album[] = await Promise.all(
      albumRows.map(async (a) => {
        const { data: photos } = await supabase
          .from("photo_album_photos")
          .select("storage_path")
          .eq("album_id", a.id)
          .order("sort_order", { ascending: true })
          .limit(1);

        const coverPath = photos?.[0]?.storage_path;
        let cover_url: string | null = null;
        if (coverPath) {
          const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(coverPath);
          cover_url = urlData.publicUrl;
        }

        const { count } = await supabase
          .from("photo_album_photos")
          .select("id", { count: "exact", head: true })
          .eq("album_id", a.id);

        return { ...a, cover_url, photo_count: count ?? 0 };
      })
    );

    setAlbums(enriched);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchAlbums(); }, [fetchAlbums]);

  const openAddAlbum = () => {
    setEditingAlbum(null);
    setAlbumName(`Week of ${format(new Date(), "MMM d, yyyy")}`);
    setSelectedFiles([]);
    setAlbumDialogOpen(true);
  };

  const openEditAlbum = (album: Album) => {
    setEditingAlbum(album);
    setAlbumName(album.name);
    setSelectedFiles([]);
    setAlbumDialogOpen(true);
  };

  const handleSaveAlbum = async () => {
    if (!albumName.trim()) { toast.error("Album name is required."); return; }
    setUploading(true);

    try {
      if (editingAlbum) {
        await supabase.from("photo_albums").update({ name: albumName.trim() }).eq("id", editingAlbum.id);
        if (selectedFiles.length > 0) {
          const { count } = await supabase.from("photo_album_photos")
            .select("id", { count: "exact", head: true }).eq("album_id", editingAlbum.id);
          let sortOrder = count ?? 0;
          for (const file of selectedFiles) {
            const path = `${projectId}/${editingAlbum.id}/${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage.from("project-photos").upload(path, file);
            if (uploadError) { toast.error(`Failed to upload ${file.name}`); continue; }
            await supabase.from("photo_album_photos").insert({
              album_id: editingAlbum.id, project_id: projectId,
              storage_path: path, file_name: file.name,
              sort_order: sortOrder++, uploaded_by: user!.id,
            });
          }
        }
        toast.success("Album updated.");
      } else {
        const { data: newAlbum, error } = await supabase.from("photo_albums").insert({
          project_id: projectId, name: albumName.trim(), created_by: user!.id,
        }).select("id").single();
        if (error || !newAlbum) { toast.error("Failed to create album."); setUploading(false); return; }
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const path = `${projectId}/${newAlbum.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("project-photos").upload(path, file);
          if (uploadError) { toast.error(`Failed to upload ${file.name}`); continue; }
          await supabase.from("photo_album_photos").insert({
            album_id: newAlbum.id, project_id: projectId,
            storage_path: path, file_name: file.name,
            sort_order: i, uploaded_by: user!.id,
          });
        }
        toast.success("Album created.");
      }
      setAlbumDialogOpen(false);
      fetchAlbums();
    } catch (err: any) {
      toast.error(err?.message ?? "Error saving album.");
    }
    setUploading(false);
  };

  const handleDeleteAlbum = async () => {
    if (!deleteAlbum) return;
    setDeleting(true);
    try {
      const { data: photos } = await supabase
        .from("photo_album_photos").select("storage_path").eq("album_id", deleteAlbum.id);
      if (photos && photos.length > 0) {
        await supabase.storage.from("project-photos").remove(photos.map(p => p.storage_path));
      }
      await supabase.from("photo_album_photos").delete().eq("album_id", deleteAlbum.id);
      await supabase.from("photo_albums").delete().eq("id", deleteAlbum.id);
      toast.success("Album deleted.");
      setDeleteAlbum(null);
      setDeleteConfirm("");
      fetchAlbums();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete album.");
    }
    setDeleting(false);
  };

  const openLightbox = async (album: Album) => {
    const { data: photos } = await supabase
      .from("photo_album_photos").select("id, storage_path, file_name")
      .eq("album_id", album.id).order("sort_order", { ascending: true });
    if (!photos || photos.length === 0) { toast.info("No photos in this album."); return; }
    const enriched: Photo[] = photos.map(p => {
      const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(p.storage_path);
      return { ...p, url: urlData.publicUrl };
    });
    setLightboxPhotos(enriched);
    setLightboxIdx(0);
    setLightboxAlbum(album);
  };

  // --- Download handlers ---

  const handleDownloadAlbum = async (album: Album, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (album.photo_count === 0) { toast.info("No photos to download."); return; }
    setDownloadingAlbumId(album.id);
    try {
      const photos = await getAlbumPhotos(album.id);
      const zip = new JSZip();
      await Promise.all(photos.map(async (p) => {
        const blob = await fetchPhotoBlob(p.storage_path);
        if (blob) zip.file(p.file_name, blob);
      }));
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${sanitizeFileName(album.name)}.zip`);
    } catch {
      toast.error("Failed to download album.");
    }
    setDownloadingAlbumId(null);
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

  const handleDownloadAll = async () => {
    if (albums.length === 0) { toast.info("No albums to download."); return; }
    setDownloadingAll(true);
    try {
      const zip = new JSZip();
      await Promise.all(albums.map(async (album) => {
        const photos = await getAlbumPhotos(album.id);
        if (photos.length === 0) return;
        const folder = zip.folder(sanitizeFileName(album.name));
        await Promise.all(photos.map(async (p) => {
          const blob = await fetchPhotoBlob(p.storage_path);
          if (blob && folder) folder.file(p.file_name, blob);
        }));
      }));
      const name = projectName ? sanitizeFileName(projectName) : "Project";
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${name}_Photos.zip`);
    } catch {
      toast.error("Failed to download all albums.");
    }
    setDownloadingAll(false);
  };

  if (loading) return <p className="text-muted-foreground text-sm py-8">Loading photos…</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{albums.length} album{albums.length !== 1 ? "s" : ""}</h3>
        <div className="flex items-center gap-2">
          {albums.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleDownloadAll} disabled={downloadingAll} className="gap-1.5">
              {downloadingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {downloadingAll ? "Preparing…" : "Download All"}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={openAddAlbum} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Album
            </Button>
          )}
        </div>
      </div>

      {/* Album grid */}
      {albums.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No photo albums yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {albums.map((album) => (
            <div
              key={album.id}
              className="group relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
              style={{ borderRadius: 12 }}
              onClick={() => openLightbox(album)}
            >
              <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
                {album.cover_url ? (
                  <img src={album.cover_url} alt={album.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{album.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(album.created_at), "MMM d, yyyy")} · {album.photo_count} photo{album.photo_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon" variant="secondary" className="h-7 w-7"
                  disabled={downloadingAlbumId === album.id}
                  onClick={(e) => handleDownloadAlbum(album, e)}
                >
                  {downloadingAlbumId === album.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Download className="h-3 w-3" />}
                </Button>
                {canEdit && (
                  <>
                    <Button size="icon" variant="secondary" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditAlbum(album); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="secondary" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteAlbum(album); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Album Dialog */}
      <Dialog open={albumDialogOpen} onOpenChange={setAlbumDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingAlbum ? "Edit Album" : "New Album"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Album Name</Label>
              <Input value={albumName} onChange={(e) => setAlbumName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Upload Photos</Label>
              <Input type="file" multiple accept="image/*" onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))} />
              {selectedFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlbumDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAlbum} disabled={uploading}>
              {uploading ? "Uploading…" : editingAlbum ? "Save" : "Create Album"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAlbum} onOpenChange={(open) => { if (!open) { setDeleteAlbum(null); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Album</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteAlbum?.name}" and all its photos. Type <strong>delete</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type 'delete'" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAlbum}
              disabled={deleteConfirm !== "delete" || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxAlbum && lightboxPhotos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxAlbum(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightboxAlbum(null)}>
            <X className="h-6 w-6" />
          </button>
          <p className="absolute top-4 left-4 text-white/70 text-sm">
            {lightboxAlbum.name} — {lightboxIdx + 1} / {lightboxPhotos.length}
          </p>
          {/* Download button in lightbox */}
          <button
            className="absolute top-4 right-14 text-white/70 hover:text-white disabled:opacity-50"
            onClick={(e) => { e.stopPropagation(); handleDownloadPhoto(); }}
            disabled={downloadingPhoto}
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
