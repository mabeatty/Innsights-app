import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Search, Star, Mail, Phone, Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";
import VendorImportDialog from "@/components/vendors/VendorImportDialog";

const CATEGORIES = [
  "General Contractor",
  "Subcontractor",
  "FF&E Supplier",
  "OS&E Supplier",
  "Architect",
  "Civil Engineer",
  "Consultant",
  "Other",
];

interface Vendor {
  id: string;
  vendor_name: string;
  category: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  markets: string | null;
  notes: string | null;
  performance_rating: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

const emptyForm = {
  vendor_name: "",
  category: "",
  contact_name: "",
  phone: "",
  email: "",
  markets: "",
  notes: "",
  performance_rating: 0,
};

function StarRating({ value, onChange, size = 18 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const interactive = !!onChange;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={interactive ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            style={{ width: size, height: size }}
            className={n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
          />
        </button>
      ))}
    </div>
  );
}

export default function Vendors() {
  const { accessLevel, organizationId, isConsultant } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [vendorProjectMap, setVendorProjectMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);

  const [importOpen, setImportOpen] = useState(false);

  const loadAll = async () => {
    if (!organizationId) return;
    setLoading(true);
    const [{ data: vData, error: vErr }, { data: pData }, { data: vpData }] = await Promise.all([
      supabase.from("global_vendors").select("*").eq("org_id", organizationId).order("vendor_name"),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("global_vendor_projects").select("vendor_id, project_id"),
    ]);
    if (vErr) toast.error("Failed to load vendors");
    setVendors((vData as Vendor[]) ?? []);
    setProjects((pData as ProjectOption[]) ?? []);
    const map: Record<string, string[]> = {};
    (vpData ?? []).forEach((row: any) => {
      if (!map[row.vendor_id]) map[row.vendor_id] = [];
      map[row.vendor_id].push(row.project_id);
    });
    setVendorProjectMap(map);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        v.vendor_name.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        (v.contact_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [vendors, search, categoryFilter]);

  if (isConsultant || accessLevel === "view") return <Navigate to="/dashboard" replace />;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      vendor_name: v.vendor_name,
      category: v.category,
      contact_name: v.contact_name ?? "",
      phone: v.phone ?? "",
      email: v.email ?? "",
      markets: v.markets ?? "",
      notes: v.notes ?? "",
      performance_rating: v.performance_rating,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.vendor_name.trim() || !form.category) {
      toast.error("Vendor name and category are required");
      return;
    }
    if (!organizationId) return;
    const payload = {
      vendor_name: form.vendor_name.trim(),
      category: form.category,
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      markets: form.markets.trim() || null,
      notes: form.notes.trim() || null,
      performance_rating: form.performance_rating,
    };
    if (editing) {
      const { error } = await supabase.from("global_vendors").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Vendor updated");
    } else {
      const { error } = await supabase.from("global_vendors").insert({ ...payload, org_id: organizationId });
      if (error) return toast.error(error.message);
      toast.success("Vendor added");
    }
    setDialogOpen(false);
    loadAll();
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteConfirm !== "delete") return;
    const { error } = await supabase.from("global_vendors").delete().eq("id", deleteTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Vendor deleted");
    setDeleteTarget(null);
    setDeleteConfirm("");
    loadAll();
  };

  const toggleVendorProject = async (vendorId: string, projectId: string, checked: boolean) => {
    if (checked) {
      const { error } = await supabase.from("global_vendor_projects").insert({ vendor_id: vendorId, project_id: projectId });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("global_vendor_projects")
        .delete()
        .eq("vendor_id", vendorId)
        .eq("project_id", projectId);
      if (error) return toast.error(error.message);
    }
    setVendorProjectMap((prev) => {
      const next = { ...prev };
      const list = new Set(next[vendorId] ?? []);
      if (checked) list.add(projectId);
      else list.delete(projectId);
      next[vendorId] = Array.from(list);
      return next;
    });
  };

  const handleExport = () => {
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const fmt = (iso: string | null | undefined) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
    };
    const rows = vendors.map((v) => {
      const projectIds = vendorProjectMap[v.id] ?? [];
      const projectNames = projectIds
        .map((pid) => projectNameById.get(pid))
        .filter(Boolean)
        .join(", ");
      return {
        "Vendor Name": v.vendor_name,
        Category: v.category,
        "Contact Name": v.contact_name ?? "",
        Phone: v.phone ?? "",
        Email: v.email ?? "",
        Markets: v.markets ?? "",
        Notes: v.notes ?? "",
        "Performance Rating": v.performance_rating || "",
        "Associated Projects": projectNames,
        "Date Added": fmt((v as any).created_at),
        "Last Updated": fmt((v as any).updated_at),
      };
    });
    const headers = [
      "Vendor Name", "Category", "Contact Name", "Phone", "Email",
      "Markets", "Notes", "Performance Rating", "Associated Projects",
      "Date Added", "Last Updated",
    ];
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    // Auto-size columns
    const colWidths = headers.map((h) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map((r) => String((r as any)[h] ?? "").length),
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
    });
    (ws as any)["!cols"] = colWidths;
    // Bold header row
    headers.forEach((_, i) => {
      const cell = XLSX.utils.encode_cell({ r: 0, c: i });
      if (ws[cell]) ws[cell].s = { font: { bold: true } };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `Witness_Vendor_Database_${dateStr}.xlsx`);
    toast.success("Vendor database exported");
  };

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-1">Organization-wide vendor directory.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Import Vendors
          </Button>
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Contact Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Markets</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No vendors found.</TableCell></TableRow>
            ) : (
              filtered.map((v) => (
                <TableRow key={v.id} className="group cursor-pointer" onClick={() => setDetailVendor(v)}>
                  <TableCell className="font-medium">{v.vendor_name}</TableCell>
                  <TableCell><Badge variant="secondary">{v.category}</Badge></TableCell>
                  <TableCell>{v.contact_name || "—"}</TableCell>
                  <TableCell>{v.phone || "—"}</TableCell>
                  <TableCell>{v.email || "—"}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{v.markets || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {v.notes ? (
                      <Tooltip>
                        <TooltipTrigger asChild><span className="truncate block">{v.notes}</span></TooltipTrigger>
                        <TooltipContent className="max-w-sm">{v.notes}</TooltipContent>
                      </Tooltip>
                    ) : "—"}
                  </TableCell>
                  <TableCell><StarRating value={v.performance_rating} size={14} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => { setDeleteTarget(v); setDeleteConfirm(""); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendor Name *</Label>
              <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Markets / Geographies Served</Label>
              <Input
                placeholder="e.g. New York, Miami, Chicago"
                value={form.markets}
                onChange={(e) => setForm({ ...form, markets: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Performance Rating</Label>
              <StarRating value={form.performance_rating} onChange={(v) => setForm({ ...form, performance_rating: v })} size={24} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete vendor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{deleteTarget?.vendor_name}</strong>. Type <code className="bg-muted px-1 rounded">delete</code> to confirm.
          </p>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="delete" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirm !== "delete"} onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail panel */}
      <Sheet open={!!detailVendor} onOpenChange={(o) => !o && setDetailVendor(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {detailVendor && (
            <>
              <SheetHeader>
                <SheetTitle>{detailVendor.vendor_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{detailVendor.category}</Badge>
                  <StarRating value={detailVendor.performance_rating} size={16} />
                </div>

                {detailVendor.contact_name && (
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Contact</div>
                    <div>{detailVendor.contact_name}</div>
                  </div>
                )}
                {detailVendor.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${detailVendor.phone}`} className="hover:underline">{detailVendor.phone}</a>
                  </div>
                )}
                {detailVendor.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${detailVendor.email}`} className="hover:underline">{detailVendor.email}</a>
                  </div>
                )}
                {detailVendor.markets && (
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Markets</div>
                    <div>{detailVendor.markets}</div>
                  </div>
                )}
                {detailVendor.notes && (
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Notes</div>
                    <div className="whitespace-pre-wrap">{detailVendor.notes}</div>
                  </div>
                )}

                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Associated Projects</div>
                  {projects.length === 0 ? (
                    <div className="text-muted-foreground">No projects available.</div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-md p-3">
                      {projects.map((p) => {
                        const linked = (vendorProjectMap[detailVendor.id] ?? []).includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={linked}
                              onCheckedChange={(c) => toggleVendorProject(detailVendor.id, p.id, !!c)}
                            />
                            <span>{p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setDetailVendor(null); openEdit(detailVendor); }}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <VendorImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        organizationId={organizationId}
        existingVendorNames={vendors.map((v) => v.vendor_name)}
        onImported={loadAll}
      />
    </div>
  );
}
