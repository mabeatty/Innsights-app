import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PROJECT_OPTION_SELECT, projectOptions, type ProjectOptionSource } from "@/lib/projectLabel";

// Each project's own vendor list: what the payee dropdown on a project's transactions
// and its contracts pick from. Separate from the organization-wide directory on the
// "All Vendors" view (global_vendors).
interface ProjectVendor {
  id: string;
  project_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}
type ProjectRow = ProjectOptionSource & { id: string };

const emptyForm = { project_id: "", name: "", contact_name: "", email: "", phone: "", notes: "" };
const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

export default function ProjectVendorsPanel() {
  const [vendors, setVendors] = useState<ProjectVendor[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [contractCounts, setContractCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectVendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProjectVendor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [vRes, pRes, cRes] = await Promise.all([
      supabase.from("vendors").select("*").order("name"),
      supabase.from("projects").select(PROJECT_OPTION_SELECT).order("name"),
      supabase.from("contracts").select("vendor_id").not("vendor_id", "is", null),
    ]);
    if (vRes.error) toast.error("Failed to load project vendors.");
    setVendors((vRes.data ?? []) as unknown as ProjectVendor[]);
    setProjects((pRes.data ?? []) as unknown as ProjectRow[]);
    const counts: Record<string, number> = {};
    for (const c of (cRes.data ?? []) as { vendor_id: string }[]) counts[c.vendor_id] = (counts[c.vendor_id] ?? 0) + 1;
    setContractCounts(counts);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => projectOptions(projects), [projects]);
  const projectLabel = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => projectFilter === "all" || v.project_id === projectFilter)
      .filter((v) => !q || [v.name, v.contact_name, v.email, v.phone].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => (projectLabel.get(a.project_id) ?? "").localeCompare(projectLabel.get(b.project_id) ?? "") || a.name.localeCompare(b.name));
  }, [vendors, projectFilter, search, projectLabel]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, project_id: projectFilter !== "all" ? projectFilter : "" });
    setDialogOpen(true);
  };
  const openEdit = (v: ProjectVendor) => {
    setEditing(v);
    setForm({ project_id: v.project_id, name: v.name, contact_name: v.contact_name ?? "", email: v.email ?? "", phone: v.phone ?? "", notes: v.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Vendor name is required."); return; }
    const projectId = editing ? editing.project_id : form.project_id;
    if (!projectId) { toast.error("Choose a project for this vendor."); return; }
    // The payee dropdown identifies a vendor by name, so two with the same name on one project would collide.
    const clash = vendors.some((v) => v.project_id === projectId && v.id !== editing?.id && v.name.trim().toLowerCase() === name.toLowerCase());
    if (clash) { toast.error(`${name} is already on this project's vendor list.`); return; }

    setSaving(true);
    const payload = { name, contact_name: blankToNull(form.contact_name), email: blankToNull(form.email), phone: blankToNull(form.phone), notes: blankToNull(form.notes) };
    const { error } = editing
      ? await supabase.from("vendors").update(payload).eq("id", editing.id)
      : await supabase.from("vendors").insert({ ...payload, project_id: projectId });
    setSaving(false);
    if (error) { toast.error(error.message || "Failed to save vendor."); return; }
    toast.success(editing ? "Vendor updated." : "Vendor added.");
    setDialogOpen(false);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("vendors").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message || "Failed to delete vendor."); return; }
    toast.success(`${deleteTarget.name} deleted.`);
    setDeleteTarget(null);
    await load();
  };

  const linked = deleteTarget ? contractCounts[deleteTarget.id] ?? 0 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search project vendors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[260px]" aria-label="Filter by project"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto gap-1.5" onClick={openCreate}><Plus className="h-4 w-4" /> Add Vendor</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The vendors each project picks payees from on its transactions and contracts. These are separate from the organization-wide directory under All Vendors.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Contracts</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {vendors.length === 0 ? "No project vendors yet." : "No vendors match."}
                </TableCell>
              </TableRow>
            ) : rows.map((v) => (
              <TableRow key={v.id} data-testid="project-vendor-row">
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{projectLabel.get(v.project_id) ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v.contact_name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v.email || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v.phone || "—"}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{contractCounts[v.id] ?? 0}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" aria-label={`Edit ${v.name}`} onClick={() => openEdit(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" aria-label={`Delete ${v.name}`} onClick={() => setDeleteTarget(v)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Project Vendor" : "Add Project Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Project *</Label>
              {editing ? (
                <p className="text-sm" data-testid="project-readonly">{projectLabel.get(editing.project_id) ?? "—"}</p>
              ) : (
                <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v }))}>
                  <SelectTrigger aria-label="Project"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-name">Vendor Name *</Label>
              <Input id="pv-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              {editing && <p className="text-[11px] text-muted-foreground">Renaming doesn't change the payee name on transactions already recorded.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-contact">Contact</Label>
                <Input id="pv-contact" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-phone">Phone</Label>
                <Input id="pv-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-email">Email</Label>
              <Input id="pv-email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-notes">Notes</Label>
              <Textarea id="pv-notes" className="min-h-[60px]" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This removes it from the vendor list for {deleteTarget ? projectLabel.get(deleteTarget.project_id) ?? "the project" : "the project"}. Transactions already recorded keep their payee name.
            </DialogDescription>
          </DialogHeader>
          {linked > 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-300/10" data-testid="delete-linked-warning">
              {linked} contract{linked === 1 ? " is" : "s are"} linked to this vendor. {linked === 1 ? "It" : "They"} will be kept but unlinked from the vendor.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
