import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Navigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface InternalDoc {
  id: string;
  name: string;
  link: string;
  notes: string | null;
}

export default function InternalDocuments() {
  const { organizationId, accessLevel } = useAuth();
  const [docs, setDocs] = useState<InternalDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<InternalDoc | null>(null);
  const [formName, setFormName] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // delete state
  const [deleteDoc, setDeleteDoc] = useState<InternalDoc | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const fetchDocs = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("internal_documents")
      .select("id, name, link, notes")
      .eq("org_id", organizationId)
      .order("created_at", { ascending: false });
    setDocs((data as InternalDoc[]) ?? []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  if (accessLevel === "view") return <Navigate to="/dashboard" replace />;

  const openAdd = () => {
    setEditingDoc(null);
    setFormName(""); setFormLink(""); setFormNotes("");
    setModalOpen(true);
  };

  const openEdit = (doc: InternalDoc) => {
    setEditingDoc(doc);
    setFormName(doc.name); setFormLink(doc.link); setFormNotes(doc.notes ?? "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formLink.trim()) {
      toast.error("Name and Link are required.");
      return;
    }
    setSaving(true);
    if (editingDoc) {
      const { error } = await supabase
        .from("internal_documents")
        .update({ name: formName.trim(), link: formLink.trim(), notes: formNotes.trim() || null })
        .eq("id", editingDoc.id);
      if (error) toast.error("Failed to update document.");
      else toast.success("Document updated.");
    } else {
      const { error } = await supabase
        .from("internal_documents")
        .insert({ org_id: organizationId!, name: formName.trim(), link: formLink.trim(), notes: formNotes.trim() || null });
      if (error) toast.error("Failed to add document.");
      else toast.success("Document added.");
    }
    setSaving(false);
    setModalOpen(false);
    fetchDocs();
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    const { error } = await supabase.from("internal_documents").delete().eq("id", deleteDoc.id);
    if (error) toast.error("Failed to delete document.");
    else toast.success("Document deleted.");
    setDeleteDoc(null);
    setDeleteConfirm("");
    fetchDocs();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Internal Documents</h1>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Document</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents yet. Click "Add Document" to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Name</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <TableRow key={doc.id} className="group">
                <TableCell className="font-medium">{doc.name}</TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={doc.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline max-w-[250px] truncate"
                      >
                        <span className="truncate">{doc.link}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md break-all">{doc.link}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{doc.notes ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(doc)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteDoc(doc)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Document" : "Add Document"}</DialogTitle>
            <DialogDescription>
              {editingDoc ? "Update the document details below." : "Enter the document details below."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Document Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Company Handbook" />
            </div>
            <div className="space-y-1">
              <Label>Link *</Label>
              <Input type="url" value={formLink} onChange={(e) => setFormLink(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => { if (!open) { setDeleteDoc(null); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteDoc?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Type <span className="font-semibold">delete</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder='Type "delete"' />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteConfirm !== "delete"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
