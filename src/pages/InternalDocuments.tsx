import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Navigate } from "react-router-dom";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Plus, Pencil, Trash2, Download, Search, Eye } from "lucide-react";
import { toast } from "sonner";

export const DOCUMENT_CATEGORIES = [
  "Franchise Documents",
  "Form Agreements",
  "Corporate Documents",
  "Miscellaneous",
] as const;
type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

// Google Drive file links (.../file/d/{ID}/view...) are embeddable via the
// /preview variant of the same URL. Anything else (a non-Drive link someone
// pasted in) has no reliable universal preview, so those just open directly.
function getDrivePreviewUrl(link: string): string | null {
  const match = link.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  const docsMatch = link.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
  if (docsMatch) return `https://docs.google.com/${docsMatch[1]}/d/${docsMatch[2]}/preview`;
  return null;
}

interface InternalDoc {
  id: string;
  name: string;
  link: string;
  notes: string | null;
  category: DocumentCategory;
  brand_id: string | null;
}

interface Brand {
  id: string;
  name: string;
}

export default function InternalDocuments() {
  const { organizationId, accessLevel } = useAuth();
  const [docs, setDocs] = useState<InternalDoc[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DocumentCategory>("Franchise Documents");
  const [search, setSearch] = useState("");

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<InternalDoc | null>(null);
  const [formName, setFormName] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formCategory, setFormCategory] = useState<DocumentCategory>("Franchise Documents");
  const [formBrandId, setFormBrandId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // delete state
  const [deleteDoc, setDeleteDoc] = useState<InternalDoc | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // preview state
  const [previewDoc, setPreviewDoc] = useState<InternalDoc | null>(null);

  const fetchDocs = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("internal_documents")
      .select("id, name, link, notes, category, brand_id")
      .eq("org_id", organizationId)
      .order("created_at", { ascending: false });
    setDocs((data as InternalDoc[]) ?? []);
    setLoading(false);
  }, [organizationId]);

  const fetchBrands = useCallback(async () => {
    const { data } = await supabase.from("brands").select("id, name").order("name");
    setBrands((data as Brand[]) ?? []);
  }, []);

  useEffect(() => { fetchDocs(); fetchBrands(); }, [fetchDocs, fetchBrands]);

  if (accessLevel === "view") return <Navigate to="/dashboard" replace />;

  const openAdd = () => {
    setEditingDoc(null);
    setFormName(""); setFormLink(""); setFormNotes(""); setFormCategory(activeTab); setFormBrandId("");
    setModalOpen(true);
  };

  const openEdit = (doc: InternalDoc) => {
    setEditingDoc(doc);
    setFormName(doc.name); setFormLink(doc.link); setFormNotes(doc.notes ?? ""); setFormCategory(doc.category); setFormBrandId(doc.brand_id ?? "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formLink.trim()) {
      toast.error("Name and Link are required.");
      return;
    }
    if (formCategory === "Franchise Documents" && !formBrandId) {
      toast.error("Select a brand for franchise documents.");
      return;
    }
    setSaving(true);
    const brandIdToSave = formCategory === "Franchise Documents" ? formBrandId : null;
    if (editingDoc) {
      const { error } = await supabase
        .from("internal_documents")
        .update({ name: formName.trim(), link: formLink.trim(), notes: formNotes.trim() || null, category: formCategory, brand_id: brandIdToSave })
        .eq("id", editingDoc.id);
      if (error) toast.error("Failed to update document.");
      else toast.success("Document updated.");
    } else {
      const { error } = await supabase
        .from("internal_documents")
        .insert({ org_id: organizationId!, name: formName.trim(), link: formLink.trim(), notes: formNotes.trim() || null, category: formCategory, brand_id: brandIdToSave });
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

  // Search matches name and notes, and applies within the active tab's
  // category — searching isn't meant to cut across categories, so switching
  // tabs while a search is active narrows within that new category instead
  // of clearing the search term. The brand filter only has an effect on the
  // Franchise Documents tab, since brand_id is null for every other category.
  const filteredDocs = useMemo(() => {
    let inCategory = docs.filter((d) => d.category === activeTab);
    if (activeTab === "Franchise Documents" && brandFilter !== "all") {
      inCategory = inCategory.filter((d) => d.brand_id === brandFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return inCategory;
    return inCategory.filter((d) => d.name.toLowerCase().includes(q) || (d.notes ?? "").toLowerCase().includes(q));
  }, [docs, activeTab, search, brandFilter]);

  const countFor = (cat: DocumentCategory) => docs.filter((d) => d.category === cat).length;
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? "Unknown" : "—");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Document Library</h1>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Document</Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocumentCategory)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="gap-1.5">
                {cat}
                <span className="text-xs text-muted-foreground">({countFor(cat)})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {activeTab === "Franchise Documents" && (
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Brands" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search this category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {DOCUMENT_CATEGORIES.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4">
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : filteredDocs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {search
                  ? `No documents matching "${search}" in ${cat}.`
                  : `No documents in ${cat} yet. Click "Add Document" to get started.`}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Name</TableHead>
                    {cat === "Franchise Documents" && <TableHead>Brand</TableHead>}
                    <TableHead className="w-16">Link</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => (
                    <TableRow key={doc.id} className="group">
                      <TableCell className="font-medium">
                        <button
                          className="inline-flex items-center gap-1.5 text-left hover:text-primary hover:underline"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {doc.name}
                        </button>
                      </TableCell>
                      {cat === "Franchise Documents" && <TableCell className="text-sm">{brandName(doc.brand_id)}</TableCell>}
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={doc.link} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Open / Download">
                                <Download className="h-4 w-4 text-primary" />
                              </Button>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md break-all">{doc.link}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{doc.notes ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(doc)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteDoc(doc)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        ))}
      </Tabs>

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
              <Label>Category *</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as DocumentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {formCategory === "Franchise Documents" && (
              <div className="space-y-1">
                <Label>Brand *</Label>
                <Select value={formBrandId} onValueChange={setFormBrandId}>
                  <SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4 pr-6">
              <span className="truncate">{previewDoc?.name}</span>
              {previewDoc && (
                <a href={previewDoc.link} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                    <Download className="h-3.5 w-3.5" /> Open / Download
                  </Button>
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {previewDoc && getDrivePreviewUrl(previewDoc.link) ? (
              <iframe
                src={getDrivePreviewUrl(previewDoc.link)!}
                className="w-full h-full rounded-md border"
                allow="autoplay"
                title={previewDoc.name}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm border rounded-md">
                <p>No inline preview available for this link.</p>
                {previewDoc && (
                  <a href={previewDoc.link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Open in a new tab
                  </a>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
