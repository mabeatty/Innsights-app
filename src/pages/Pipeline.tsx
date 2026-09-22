import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Link2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { PROJECT_STATUSES } from "@/lib/projectStatus";

const FRANCHISORS = ["Hilton", "IHG", "Marriott", "Hyatt"];

function statusBadgeClasses(status: string) {
  switch (status) {
    case "Prospecting": return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700";
    case "Design": return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900";
    case "Pre-Construction": return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900";
    case "Under Construction": return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900";
    case "On Hold": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    case "Open": return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    default: return "bg-muted text-muted-foreground";
  }
}

interface BrandOption { id: string; name: string }
interface ProjectOption { id: string; name: string }

interface PipelineEntry {
  id: string;
  property_name: string;
  city: string | null;
  state: string | null;
  brand_id: string | null;
  brands: { name: string } | null;
  franchisor: string | null;
  franchise_agreement_date: string | null;
  key_money: number | null;
  development_fee: number | null;
  projected_opening_date: string | null;
  projected_start_date: string | null;
  status: string;
  notes: string | null;
  converted_project_id: string | null;
}

export default function Pipeline() {
  const { user, organizationId } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [sortColumn, setSortColumn] = useState<string>("property_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineEntry | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [brandId, setBrandId] = useState<string>("");
  const [franchisor, setFranchisor] = useState("");
  const [keyMoney, setKeyMoney] = useState("");
  const [developmentFee, setDevelopmentFee] = useState("");
  const [startDate, setStartDate] = useState("");
  const [status, setStatus] = useState<string>(PROJECT_STATUSES[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [linkTarget, setLinkTarget] = useState<PipelineEntry | null>(null);
  const [linkProjectId, setLinkProjectId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PipelineEntry | null>(null);

  const load = async () => {
    if (!organizationId) return;
    setLoading(true);
    const [{ data: pipelineData }, { data: brandData }, { data: projectData }] = await Promise.all([
      supabase.from("franchise_pipeline")
        .select("id, property_name, city, state, brand_id, brands(name), franchisor, projected_start_date, key_money, development_fee, status, notes, converted_project_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase.from("brands").select("id, name").order("name"),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    setEntries((pipelineData as any) ?? []);
    setBrands(brandData ?? []);
    setProjects(projectData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [organizationId]);

  const resetForm = () => {
    setEditing(null);
    setPropertyName(""); setCity(""); setState(""); setBrandId(""); setFranchisor("");
    setKeyMoney(""); setDevelopmentFee(""); setStartDate(""); setStatus(PROJECT_STATUSES[0]); setNotes("");
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (e: PipelineEntry) => {
    setEditing(e);
    setPropertyName(e.property_name); setCity(e.city ?? ""); setState(e.state ?? "");
    setBrandId(e.brand_id ?? ""); setFranchisor(e.franchisor ?? "");
    setKeyMoney(e.key_money != null ? String(e.key_money) : ""); setDevelopmentFee(e.development_fee != null ? String(e.development_fee) : "");
    setStartDate(e.projected_start_date ?? "");
    setStatus(e.status); setNotes(e.notes ?? "");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!propertyName.trim()) { toast.error("Property name is required."); return; }
    if (keyMoney.trim() && Number.isNaN(Number(keyMoney))) { toast.error("Key money must be a number."); return; }
    if (developmentFee.trim() && Number.isNaN(Number(developmentFee))) { toast.error("Development fee must be a number."); return; }
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        property_name: propertyName.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        brand_id: brandId || null,
        franchisor: franchisor.trim() || null,
        key_money: keyMoney.trim() ? Number(keyMoney) : null,
        development_fee: developmentFee.trim() ? Number(developmentFee) : null,
        projected_start_date: startDate || null,
        status,
        notes: notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("franchise_pipeline").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Pipeline entry updated.");
      } else {
        const { error } = await supabase.from("franchise_pipeline").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Added to pipeline.");
      }
      setDialogOpen(false);
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("franchise_pipeline").delete().eq("id", deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from pipeline.");
    setDeleteTarget(null);
    load();
  };

  const openLink = (e: PipelineEntry) => { setLinkTarget(e); setLinkProjectId(e.converted_project_id ?? ""); };
  const saveLink = async () => {
    if (!linkTarget) return;
    let newStatus = linkTarget.status;
    if (linkProjectId) {
      const { data: info } = await supabase.from("project_info").select("project_status").eq("project_id", linkProjectId).maybeSingle();
      if (info?.project_status) newStatus = info.project_status;
    }
    const { error } = await supabase.from("franchise_pipeline").update({
      converted_project_id: linkProjectId || null,
      status: newStatus,
    }).eq("id", linkTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success(linkProjectId ? "Linked to project." : "Link removed.");
    setLinkTarget(null);
    load();
  };

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortAsc((a) => !a);
    } else {
      setSortColumn(column);
      setSortAsc(true);
    }
  };

  const getSortValue = (e: PipelineEntry, column: string): string | number => {
    switch (column) {
      case "property_name": return e.property_name?.toLowerCase() ?? "";
      case "brand": return e.brands?.name?.toLowerCase() ?? "";
      case "franchisor": return e.franchisor?.toLowerCase() ?? "";
      case "key_money": return e.key_money ?? -Infinity;
      case "development_fee": return e.development_fee ?? -Infinity;
      case "projected_start_date": return e.projected_start_date ?? "";
      case "status": return e.status?.toLowerCase() ?? "";
      default: return "";
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const va = getSortValue(a, sortColumn);
    const vb = getSortValue(b, sortColumn);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return sortAsc ? cmp : -cmp;
  });

  const SortableHead = ({ column, children }: { column: string; children: ReactNode }) => (
    <TableHead>
      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(column)}>
        {children}
        {sortColumn === column ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Properties with a signed franchise agreement, tracked through to construction start.</p>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add to Pipeline
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead column="property_name">Property</SortableHead>
              <SortableHead column="brand">Brand</SortableHead>
              <SortableHead column="franchisor">Franchisor</SortableHead>
              <SortableHead column="key_money">Key Money</SortableHead>
              <SortableHead column="development_fee">Development Fee</SortableHead>
              <SortableHead column="projected_start_date">Projected Start</SortableHead>
              <SortableHead column="status">Status</SortableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6 text-sm">Loading…</TableCell></TableRow>}
            {!loading && entries.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                No signed franchises in the pipeline yet.
              </TableCell></TableRow>
            )}
            {sortedEntries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium text-sm">
                  {e.converted_project_id ? (
                    <button className="text-primary hover:underline text-left" onClick={() => navigate(`/project/${e.converted_project_id}`)}>
                      {e.property_name}
                    </button>
                  ) : e.property_name}
                  {e.notes && <p className="text-xs text-muted-foreground line-clamp-1 font-normal mt-0.5">{e.notes}</p>}
                </TableCell>
                <TableCell className="text-sm">{e.brands?.name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.franchisor || "—"}</TableCell>
                <TableCell className="text-sm">{e.key_money != null ? `$${Number(e.key_money).toLocaleString("en-US")}` : "—"}</TableCell>
                <TableCell className="text-sm">{e.development_fee != null ? `$${Number(e.development_fee).toLocaleString("en-US")}` : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.projected_start_date ? format(new Date(e.projected_start_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusBadgeClasses(e.status)}`}>{e.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Link to project" onClick={() => openLink(e)}>
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!e.converted_project_id && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remove" onClick={() => setDeleteTarget(e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Pipeline Entry" : "Add to Pipeline"}</DialogTitle>
            <DialogDescription>A property with a signed franchise agreement, not yet an active Innsights project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editing?.converted_project_id && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                Linked to a project — property, location, brand, and status are read-only here and reflect the project
                record. Franchisor, key money, development fee, start date, and notes are still pipeline-specific and
                editable.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Property name</Label>
              <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="e.g. Springfield HGI" disabled={!!editing?.converted_project_id} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={!!editing?.converted_project_id} />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} placeholder="OH" disabled={!!editing?.converted_project_id} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Select value={brandId} onValueChange={setBrandId} disabled={!!editing?.converted_project_id}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Franchisor</Label>
                <Select value={franchisor} onValueChange={setFranchisor}>
                  <SelectTrigger><SelectValue placeholder="Select franchisor" /></SelectTrigger>
                  <SelectContent>
                    {FRANCHISORS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Key money</Label>
                <Input type="number" step="0.01" value={keyMoney} onChange={(e) => setKeyMoney(e.target.value)} placeholder="e.g. 50000" />
              </div>
              <div className="space-y-1.5">
                <Label>Development fee</Label>
                <Input type="number" step="0.01" value={developmentFee} onChange={(e) => setDevelopmentFee(e.target.value)} placeholder="e.g. 75000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Projected start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={!!editing?.converted_project_id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {editing?.converted_project_id && (
                <p className="text-[11px] text-muted-foreground">Tracks this project's real status automatically — edit it on the project itself.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to project dialog */}
      <Dialog open={!!linkTarget} onOpenChange={(o) => !o && setLinkTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to Project</DialogTitle>
            <DialogDescription>Once this deal becomes an active Innsights project, link it here instead of duplicating data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={linkProjectId} onValueChange={setLinkProjectId}>
              <SelectTrigger><SelectValue placeholder="Select project (or leave blank to unlink)" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkTarget(null)}>Cancel</Button>
            <Button onClick={saveLink}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from pipeline?</AlertDialogTitle>
            <AlertDialogDescription>This removes "{deleteTarget?.property_name}" from the pipeline. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
