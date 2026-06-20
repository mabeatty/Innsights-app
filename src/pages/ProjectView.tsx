import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreVertical, Info, FolderOpen, CalendarDays, Gavel, Landmark, ArrowLeft, Receipt, BarChart3, NotebookPen, ListTodo, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { ProjectInfoSummary } from "@/components/ProjectInfoSummary";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertBanner } from "@/components/AlertBanner";
import { ProjectInfoForm } from "@/components/ProjectInfoForm";
import ProjectDocuments from "@/components/ProjectDocuments";
import BudgetModule from "@/components/BudgetModule";
import ScheduleModule from "@/components/ScheduleModule";
import CapitalPlanningModule from "@/components/CapitalPlanningModule";
import ProcurementModule from "@/components/ProcurementModule";
import ReportsModule from "@/components/ReportsModule";
import TasksModule from "@/components/TasksModule";
import InvoicesTable from "@/components/invoices/InvoicesTable";

/* ── Types ── */
interface Project {
  id: string;
  name: string;
  hotel_name: string;
  brand_id: string;
  status: "Draft" | "Complete";
  project_type: "Development" | "Asset Management";
  brands: { name: string } | null;
  clickup_list_id: string | null;
}

/* ── Component ── */
export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const { user, isConsultant, accessLevel, organizationId } = useAuth();
  const { getProjectAlerts, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [roomMatrixCount, setRoomMatrixCount] = useState<number | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHotelName, setEditHotelName] = useState("");
  const [editProjectType, setEditProjectType] = useState<"Development" | "Asset Management">("Development");
  const [editStatus, setEditStatus] = useState<"Draft" | "Complete">("Draft");
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Project Info panel toggle
  const [infoOpen, setInfoOpen] = useState(false);

  const [entityName, setEntityName] = useState<string | null>(null);

  /* ── Fetch project ── */
  const fetchData = useCallback(async () => {
    if (!id) return;
    const [{ data }, { data: matrixRows }, { data: infoRow }] = await Promise.all([
      supabase.from("projects").select("id, name, hotel_name, brand_id, status, project_type, clickup_list_id, brands(name)").eq("id", id).single(),
      supabase.from("room_matrix_entries").select("quantity").eq("project_id", id),
      supabase.from("project_info").select("entity_name").eq("project_id", id).maybeSingle(),
    ]);
    setProject(data as unknown as Project);
    if (matrixRows && matrixRows.length > 0) {
      setRoomMatrixCount(matrixRows.reduce((sum, r) => sum + (r.quantity ?? 0), 0));
    }
    setEntityName(infoRow?.entity_name || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Edit Project ── */
  const openEditDialog = () => {
    if (!project) return;
    setEditName(project.name);
    setEditHotelName(project.hotel_name);
    setEditProjectType(project.project_type);
    setEditStatus(project.status);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!project || !editName || !editHotelName) {
      toast.error("Please fill in all fields.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("projects").update({
      name: editName,
      hotel_name: editHotelName,
      project_type: editProjectType,
      status: editStatus,
    }).eq("id", project.id);
    if (error) toast.error(error.message);
    else { toast.success("Project updated."); setEditOpen(false); await fetchData(); }
    setSaving(false);
  };

  /* ── Delete Project ── */
  const handleDelete = async () => {
    if (!project) return;
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("takeoff_line_items").delete().eq("project_id", project.id),
        supabase.from("project_public_area_items").delete().eq("project_id", project.id),
        supabase.from("room_matrix_entries").delete().eq("project_id", project.id),
        supabase.from("project_documents").delete().eq("project_id", project.id),
      ]);
      await supabase.from("projects").delete().eq("id", project.id);
      toast.success("Project deleted.");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete project.");
      setDeleting(false);
    }
  };

  /* ── Render ── */
  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!project) return <p className="text-destructive">Project not found.</p>;

  const projectAlerts = id ? getProjectAlerts(id) : [];
  const budgetAlerts = projectAlerts.filter(a => ["contract_over_budget", "line_item_over_budget", "spend_threshold"].includes(a.alert_type));
  const scheduleAlerts = projectAlerts.filter(a => ["milestone_overdue", "no_weekly_report", "completion_date_changed"].includes(a.alert_type));
  const capitalAlerts = projectAlerts.filter(a => ["equity_over_commitment", "debt_over_commitment"].includes(a.alert_type));
  const complianceAlerts = projectAlerts.filter(a => ["no_draw_activity"].includes(a.alert_type));

  return (
    <div className="space-y-6">
      {/* Back button — closes Project Info panel */}
      {infoOpen && (
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground" onClick={() => setInfoOpen(false)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{entityName || project.hotel_name}</p>
          <ProjectInfoSummary info={projectInfo} />
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">{project.project_type}</Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInfoOpen(!infoOpen)}>
            <Info className="h-3.5 w-3.5" /> Project Info
          </Button>
          {!isConsultant && accessLevel !== "view" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={openEditDialog}>Edit Project</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive">
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Project Info Panel */}
      {infoOpen && (
        <div className="rounded-lg border p-4 bg-card">
          <ProjectInfoForm
            projectId={id!}
            brandName={project.brands?.name ?? ""}
            roomMatrixCount={roomMatrixCount}
            onInfoChange={setProjectInfo}
          />
        </div>
      )}

      {/* Tabs — hidden while the Project Info panel is open so its content
          (Executive Summary, etc.) doesn't render beneath the panel. */}
      {!infoOpen && (
      <Tabs defaultValue="executive-summary">
        <TabsList>
          <TabsTrigger value="executive-summary" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Executive Summary
          </TabsTrigger>
          <TabsTrigger value="project-accounting" className="gap-1.5">
            <Receipt className="h-3.5 w-3.5" /> Project Accounting
          </TabsTrigger>
          <TabsTrigger value="capital" className="gap-1.5">
            <Landmark className="h-3.5 w-3.5" /> Capital Planning
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="procurement" className="gap-1.5">
            <Gavel className="h-3.5 w-3.5" /> Procurement
          </TabsTrigger>
          {accessLevel !== "view" && !isConsultant && (
            <TabsTrigger value="invoices" className="gap-1.5">
              <FileCheck className="h-3.5 w-3.5" /> Invoices
            </TabsTrigger>
          )}
          <TabsTrigger value="reports" className="gap-1.5">
            <NotebookPen className="h-3.5 w-3.5" /> Reports
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <ListTodo className="h-3.5 w-3.5" /> Tasks
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" /> Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="executive-summary">
          <AlertBanner alerts={budgetAlerts} onDismiss={dismissAlert} />
          <BudgetModule projectId={id!} projectName={project.name} projectInfo={projectInfo} activeTab="executive-summary" />
        </TabsContent>

        <TabsContent value="project-accounting">
          <AlertBanner alerts={complianceAlerts} onDismiss={dismissAlert} />
          <BudgetModule projectId={id!} projectName={project.name} projectInfo={projectInfo} activeTab="project-accounting" />
        </TabsContent>

        <TabsContent value="documents">
          <ProjectDocuments projectId={id!} projectName={project.name} />
        </TabsContent>

        <TabsContent value="schedule">
          <AlertBanner alerts={scheduleAlerts} onDismiss={dismissAlert} />
          <ScheduleModule projectId={id!} projectName={project.name} />
        </TabsContent>

        <TabsContent value="procurement">
          <ProcurementModule projectId={id!} projectName={project.name} brandId={project.brand_id} />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTable projectId={id!} projectName={project.name} hideProjectColumn />
        </TabsContent>

        <TabsContent value="capital">
          <AlertBanner alerts={capitalAlerts} onDismiss={dismissAlert} />
          <CapitalPlanningModule projectId={id!} />
        </TabsContent>


        <TabsContent value="tasks">
          <TasksModule projectId={id!} clickupListId={project.clickup_list_id} organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsModule
            projectId={id!}
            projectName={project.name}
            entityName={entityName || project.hotel_name}
            brandName={project.brands?.name ?? ""}
            projectType={project.project_type}
          />
        </TabsContent>
      </Tabs>
      )}

      {/* ── Edit Project Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hotel Name</Label>
              <Input value={editHotelName} onChange={(e) => setEditHotelName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Brand</Label>
              <p className="text-sm py-2 px-3 rounded-md bg-muted">{project.brands?.name ?? "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Project Type</Label>
              <Select value={editProjectType} onValueChange={(v) => setEditProjectType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Development">Development</SelectItem>
                  <SelectItem value="Asset Management">Asset Management</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{project.name}" and all associated takeoff data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
