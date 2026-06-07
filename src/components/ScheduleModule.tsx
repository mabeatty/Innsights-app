import { useState } from "react";
import { useScheduleData } from "./schedule/useScheduleData";
import GanttTimeline from "./schedule/GanttTimeline";
import MilestoneDialog from "./schedule/MilestoneDialog";
import { exportSchedulePDF } from "./schedule/exportSchedulePDF";
import { Button } from "@/components/ui/button";
import { FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ScheduleMilestone } from "./schedule/types";

interface Props {
  projectId: string;
  projectName?: string;
}

export default function ScheduleModule({ projectId, projectName }: Props) {
  const { phases, milestones, loading, updateMilestone, addMilestone, deleteMilestone, updatePhase, addSubPhase, deleteSubPhase, refetch } = useScheduleData(projectId);
  const [editingMilestone, setEditingMilestone] = useState<ScheduleMilestone | null>(null);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncClickUp = async () => {
    setSyncing(true);
    // Mock sync — will call ClickUp API when connected
    await new Promise((r) => setTimeout(r, 1500));
    await refetch();
    setSyncing(false);
    toast.success("Schedule synced with ClickUp.");
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportSchedulePDF(projectName || "Project", phases, milestones);
      toast.success("Schedule exported to PDF.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export PDF.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading schedule…</p>;
  }

  return (
    <section className="space-y-4 pt-2 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Project Schedule
        </h2>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSyncClickUp} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPDF} disabled={exporting}>
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      <GanttTimeline
        phases={phases}
        milestones={milestones}
        onMilestoneClick={(m) => setEditingMilestone(m)}
        onAddMilestone={addMilestone}
        onUpdatePhase={updatePhase}
        onAddSubPhase={addSubPhase}
        onDeleteSubPhase={deleteSubPhase}
      />

      <MilestoneDialog
        milestone={editingMilestone}
        open={!!editingMilestone}
        onOpenChange={(open) => !open && setEditingMilestone(null)}
        onSave={updateMilestone}
        onDelete={deleteMilestone}
      />
    </section>
  );
}
