import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText, ExternalLink, Download, X, Link2, ArrowUpRight, Building2 } from "lucide-react";

interface Attachment {
  id: string;
  storage_path: string | null;
  drive_url: string | null;
  drive_file_id: string | null;
  file_name: string;
  file_size: number;
}

interface Prospect {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  potential_brands: string[];
  notes: string | null;
  converted_project_id: string | null;
  attachments: Attachment[];
}

interface BrandOption {
  id: string;
  name: string;
}

export default function Prospecting() {
  const { user, organizationId } = useAuth();
  const navigate = useNavigate();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [driveUrlInput, setDriveUrlInput] = useState("");
  const [pendingDriveLinks, setPendingDriveLinks] = useState<{ url: string; fileId: string | null; name: string }[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<Attachment[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [pushTarget, setPushTarget] = useState<Prospect | null>(null);
  const [pushHotelName, setPushHotelName] = useState("");
  const [pushBrandId, setPushBrandId] = useState("");
  const [pushing, setPushing] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: brandRows }, { data: prospectRows }] = await Promise.all([
      supabase.from("brands").select("id, name").order("name"),
      supabase.from("prospects").select("id, name, city, state, potential_brands, notes, converted_project_id").order("created_at", { ascending: false }),
    ]);
    setBrands((brandRows as BrandOption[]) ?? []);

    const prospectIds = (prospectRows ?? []).map((p: any) => p.id);
    let attachmentsByProspect = new Map<string, Attachment[]>();
    if (prospectIds.length > 0) {
      const { data: attRows } = await supabase
        .from("prospect_attachments")
        .select("id, prospect_id, storage_path, drive_url, drive_file_id, file_name, file_size")
        .in("prospect_id", prospectIds);
      (attRows ?? []).forEach((a: any) => {
        if (!attachmentsByProspect.has(a.prospect_id)) attachmentsByProspect.set(a.prospect_id, []);
        attachmentsByProspect.get(a.prospect_id)!.push(a);
      });
    }

    setProspects(
      (prospectRows ?? []).map((p: any) => ({ ...p, attachments: attachmentsByProspect.get(p.id) ?? [] }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditing(null);
    setName(""); setCity(""); setState(""); setSelectedBrands(new Set()); setNotes("");
    setPendingFiles([]); setDriveUrlInput(""); setPendingDriveLinks([]);
    setExistingAttachments([]); setAttachmentsToDelete([]);
    setDialogOpen(true);
  };

  const openEdit = (p: Prospect) => {
    setEditing(p);
    setName(p.name); setCity(p.city ?? ""); setState(p.state ?? "");
    setSelectedBrands(new Set(p.potential_brands));
    setNotes(p.notes ?? "");
    setPendingFiles([]); setDriveUrlInput(""); setPendingDriveLinks([]);
    setExistingAttachments([...p.attachments]); setAttachmentsToDelete([]);
    setDialogOpen(true);
  };

  const toggleBrand = (brandName: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      next.has(brandName) ? next.delete(brandName) : next.add(brandName);
      return next;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length !== files.length) toast.error("Only PDF files are allowed.");
    setPendingFiles((prev) => [...prev, ...pdfs]);
    e.target.value = "";
  };

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

  const removePendingFile = (idx: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  const removePendingDriveLink = (idx: number) => setPendingDriveLinks((prev) => prev.filter((_, i) => i !== idx));
  const removeExistingAttachment = (att: Attachment) => {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
    setAttachmentsToDelete((prev) => [...prev, att]);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    try {
      let prospectId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("prospects").update({
          name: name.trim(), city: city.trim() || null, state: state.trim() || null,
          potential_brands: Array.from(selectedBrands), notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("prospects").insert({
          organization_id: organizationId, name: name.trim(), city: city.trim() || null, state: state.trim() || null,
          potential_brands: Array.from(selectedBrands), notes: notes.trim() || null, created_by: user?.id ?? null,
        }).select("id").single();
        if (error) throw error;
        prospectId = data.id;
      }

      for (const att of attachmentsToDelete) {
        if (att.storage_path) await supabase.storage.from("prospect-attachments").remove([att.storage_path]);
        await supabase.from("prospect_attachments").delete().eq("id", att.id);
      }
      for (const file of pendingFiles) {
        const path = `${prospectId}/${crypto.randomUUID()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("prospect-attachments").upload(path, file);
        if (uploadError) { toast.error(`Failed to upload ${file.name}`); continue; }
        await supabase.from("prospect_attachments").insert({
          prospect_id: prospectId, storage_path: path, file_name: file.name, file_size: file.size, uploaded_by: user?.id ?? null,
        });
      }
      for (const link of pendingDriveLinks) {
        await supabase.from("prospect_attachments").insert({
          prospect_id: prospectId, drive_url: link.url, drive_file_id: link.fileId, file_name: link.name,
          file_size: 0, uploaded_by: user?.id ?? null,
        });
      }

      toast.success(editing ? "Prospect updated." : "Prospect added.");
      setDialogOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save prospect.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    for (const att of deleteTarget.attachments) {
      if (att.storage_path) await supabase.storage.from("prospect-attachments").remove([att.storage_path]);
    }
    const { error } = await supabase.from("prospects").delete().eq("id", deleteTarget.id);
    if (error) toast.error("Failed to delete prospect.");
    else { toast.success("Prospect deleted."); fetchAll(); }
    setDeleteTarget(null);
    setDeleting(false);
  };

  const openPush = (p: Prospect) => {
    setPushTarget(p);
    setPushHotelName(p.name);
    // Pre-select the brand if there's exactly one candidate; otherwise leave
    // it for the person to choose, since a project needs exactly one.
    const matchingBrand = p.potential_brands.length === 1
      ? brands.find((b) => b.name === p.potential_brands[0])
      : null;
    setPushBrandId(matchingBrand?.id ?? "");
  };

  const handlePush = async () => {
    if (!pushTarget || !user) return;
    if (!pushHotelName.trim()) { toast.error("Hotel name is required."); return; }
    if (!pushBrandId) { toast.error("Select a brand."); return; }
    setPushing(true);
    try {
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          name: pushHotelName.trim(), hotel_name: pushHotelName.trim(), brand_id: pushBrandId,
          user_id: user.id, organization_id: organizationId, project_type: "Development",
        })
        .select()
        .single();
      if (error || !project) throw error;

      await supabase.from("project_info").insert({
        project_id: project.id,
        project_status: "Pre-Construction",
        property_name: pushTarget.name,
        city: pushTarget.city,
        state: pushTarget.state,
      });

      await supabase.from("prospects").update({ converted_project_id: project.id }).eq("id", pushTarget.id);

      toast.success("Pushed to Pre-Construction.");
      setPushTarget(null);
      navigate(`/project/${project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create project.");
    }
    setPushing(false);
  };

  const downloadAttachment = async (att: Attachment) => {
    if (att.drive_url) { window.open(att.drive_url, "_blank", "noopener,noreferrer"); return; }
    if (!att.storage_path) return;
    const { data, error } = await supabase.storage.from("prospect-attachments").download(att.storage_path);
    if (error || !data) { toast.error("Download failed."); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = att.file_name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prospecting</h1>
          <p className="text-sm text-muted-foreground">Track prospective development projects and markets.</p>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Prospect
        </Button>
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Potential Brands</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Attachments</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : prospects.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No prospects yet.</TableCell></TableRow>
            ) : prospects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.city || "—"}</TableCell>
                <TableCell>{p.state || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.potential_brands.length === 0 ? <span className="text-muted-foreground text-sm">—</span> :
                      p.potential_brands.map((b) => <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{p.notes || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {p.attachments.length === 0 ? <span className="text-muted-foreground text-sm">—</span> :
                      p.attachments.map((att) => (
                        <Button key={att.id} size="sm" variant="link" className="h-auto py-0 px-0 gap-1 justify-start text-xs" onClick={() => downloadAttachment(att)}>
                          {att.drive_url ? <ExternalLink className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                          {att.file_name}
                        </Button>
                      ))}
                  </div>
                </TableCell>
                <TableCell>
                  {p.converted_project_id ? (
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate(`/project/${p.converted_project_id}`)}>
                      <Building2 className="h-3.5 w-3.5" /> View Project
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" className="gap-1.5 text-xs" onClick={() => openPush(p)}>
                      <ArrowUpRight className="h-3.5 w-3.5" /> Push to Pre-Dev
                    </Button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Prospect" : "Add Prospect"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Downtown Springfield Site" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Potential Brands</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2 border rounded-md p-3 max-h-32 overflow-y-auto">
                {brands.map((b) => (
                  <div key={b.id} className="flex items-center gap-1.5">
                    <Checkbox id={`brand-${b.id}`} checked={selectedBrands.has(b.name)} onCheckedChange={() => toggleBrand(b.name)} />
                    <Label htmlFor={`brand-${b.id}`} className="text-sm font-normal cursor-pointer">{b.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </div>

            <div className="space-y-2">
              <Label>Attachments (pamphlets, materials)</Label>
              <Input type="file" accept="application/pdf" multiple onChange={handleFileSelect} />
              <div className="flex gap-2">
                <Input
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  placeholder="Or paste a Google Drive link…"
                  className="text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDriveLink(); } }}
                />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={addDriveLink}>
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {existingAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  {att.drive_url ? <ExternalLink className="h-4 w-4 text-primary shrink-0" /> : <FileText className="h-4 w-4 text-destructive shrink-0" />}
                  <span className="text-sm flex-1 truncate">{att.file_name}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={() => removeExistingAttachment(att)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={() => removePendingFile(i)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              {pendingDriveLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <ExternalLink className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{link.name}</span>
                  <span className="text-xs text-muted-foreground">Google Drive</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive" onClick={() => removePendingDriveLink(i)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the prospect and its attachments. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!pushTarget} onOpenChange={(open) => !open && setPushTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Push "{pushTarget?.name}" to Pre-Construction</DialogTitle>
            <DialogDescription>
              This creates a real project in Pre-Construction status. You can change the stage anytime from Project Info.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Hotel Name</Label>
              <Input value={pushHotelName} onChange={(e) => setPushHotelName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={pushBrandId} onValueChange={setPushBrandId}>
                <SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {pushTarget && pushTarget.potential_brands.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  This prospect lists multiple potential brands ({pushTarget.potential_brands.join(", ")}) — pick the one to move forward with.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushTarget(null)}>Cancel</Button>
            <Button onClick={handlePush} disabled={pushing}>{pushing ? "Creating…" : "Push to Pre-Construction"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
