import { useEffect, useState } from "react";
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
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";

const STATUSES = ["Franchise Signed", "Site Control", "PIP In Progress", "Financing", "Under Construction", "Converted to Project"];
const FRANCHISORS = ["Hilton", "IHG", "Marriott", "Hyatt"];

function statusBadgeClasses(status: string) {
  switch (status) {
    case "Franchise Signed": return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900";
    case "Site Control": return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900";
    case "PIP In Progress": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    case "Financing": return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900";
    case "Under Construction": return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900";
    case "Converted to Project": return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
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
  projected_opening_date: string | null;
  status: string;
  notes: string | null;
  converted_project_id: string | null;
}

export default function Pipeline() {
  const { user, organizationId } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
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
  const [agreementDate, setAgreementDate] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [status, setStatus] = useState("Franchise Signed");
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
        .select("id, property_name, city, state, brand_id, brands(name), franchisor, franchise_agreement_date, projected_opening_date, status, notes, converted_project_id")
        .eq("organization_id", organizationId)
        .order("franchise_agreement_date", { ascending: false }),
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
    setAgreementDate(""); setOpeningDate(""); setStatus("Franchise Signed"); setNotes("");
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (e: PipelineEntry) => {
    setEditing(e);
    setPropertyName(e.property_name); setCity(e.city ?? ""); setState(e.state ?? "");
    setBrandId(e.brand_id ?? ""); setFranchisor(e.franchisor ?? "");
    setAgreementDate(e.franchise_agreement_date ?? ""); setOpeningDate(e.projected_opening_date ?? "");
    setStatus(e.status); setNotes(e.notes ?? "");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!propertyName.trim()) { toast.error("Property name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        property_name: propertyName.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        brand_id: brandId || null,
        franchisor: franchisor.trim() || null,
        franchise_agreement_date: agreementDate || null,
        projected_opening_date: openingDate || null,
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
    const { error } = await supabase.from("franchise_pipeline").update({
      converted_project_id: linkProjectId || null,
      status: linkProjectId ? "Converted to Project" : linkTarget.status,
    }).eq("id", linkTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success(linkProjectId ? "Linked to project." : "Link removed.");
    setLinkTarget(null);
    load();
  };

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
              <TableHead>Property</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Franchisor</TableHead>
              <TableHead>Franchise Signed</TableHead>
              <TableHead>Projected Opening</TableHead>
              <TableHead>Status</TableHead>
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
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium text-sm">
                  {e.converted_project_id ? (
                    <button className="text-primary hover:underline text-left" onClick={() => navigate(`/project/${e.converted_project_id}`)}>
                      {e.property_name}
                    </button>
                  ) : e.property_name}
                  {e.notes && <p className="text-xs text-muted-foreground line-clamp-1 font-normal mt-0.5">{e.notes}</p>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{[e.city, e.state].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell className="text-sm">{e.brands?.name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.franchisor || "—"}</TableCell>
                <TableCell className="text-sm">{e.franchise_agreement_date ? format(new Date(e.franchise_agreement_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.projected_opening_date ? format(new Date(e.projected_opening_date), "MMM d, yyyy") : "—"}</TableCell>
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
                Linked to a project — property, location, and brand are read-only here and reflect the project record.
                Franchisor, dates, status, and notes are still pipeline-specific and editable.
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
                <Label>Franchise signed date</Label>
                <Input type="date" value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Projected opening date</Label>
                <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
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
