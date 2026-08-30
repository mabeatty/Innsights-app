import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

interface Risk {
  id: string;
  risk_type: "Budget" | "Schedule" | "Compliance" | "Report";
  severity: "Low" | "Medium" | "High";
  title: string;
  description: string;
  status: "open" | "acknowledged" | "resolved";
  first_detected_at: string;
  last_confirmed_at: string;
  resolved_at: string | null;
  resolution_type: "auto" | "manual" | null;
  current_metric: number | null;
}

interface Props {
  projectId: string;
}

const severityOrder: Record<Risk["severity"], number> = { High: 0, Medium: 1, Low: 2 };

const severityClass = (s: Risk["severity"]) =>
  s === "High"
    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    : s === "Medium"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-muted text-muted-foreground";

const typeIcon = (t: Risk["risk_type"]) => (t === "Budget" ? "$" : t === "Schedule" ? "\ud83d\udcc5" : t === "Compliance" ? "\ud83d\udccb" : "\ud83d\udcc4");

// Automatically populated — see detect-project-risks (nightly + triggered
// right after a weekly report is extracted). Nothing here requires the
// person to run an analysis; this card just displays whatever the most
// recent automated pass found.
export default function ProjectRisksCard({ projectId }: Props) {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_risks")
      .select("*")
      .eq("project_id", projectId)
      .order("severity", { ascending: true })
      .order("first_detected_at", { ascending: false });
    if (!error) setRisks((data ?? []) as Risk[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const openRisks = risks.filter((r) => r.status !== "resolved").sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const resolvedRisks = risks.filter((r) => r.status === "resolved");
  const highCount = openRisks.filter((r) => r.severity === "High").length;
  const mediumCount = openRisks.filter((r) => r.severity === "Medium").length;
  const lowCount = openRisks.filter((r) => r.severity === "Low").length;

  const acknowledge = async (id: string) => {
    const { error } = await supabase.from("project_risks").update({ status: "acknowledged" }).eq("id", id);
    if (error) toast.error("Failed to update.");
    else load();
  };

  // Manual resolve: snapshots the risk's current metric so a later automated
  // detection run can tell whether the situation has gotten meaningfully
  // worse (and should be reopened) or is basically unchanged (and should
  // stay quietly resolved). See detect-project-risks' isMeaningfullyWorse.
  const resolve = async (r: Risk) => {
    const { error } = await supabase.from("project_risks").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_type: "manual",
      resolved_metric: r.current_metric,
    }).eq("id", r.id);
    if (error) toast.error("Failed to resolve.");
    else { toast.success("Risk resolved."); load(); }
  };

  const reopen = async (id: string) => {
    const { error } = await supabase.from("project_risks").update({
      status: "open", resolved_at: null, resolution_type: null, resolved_metric: null,
    }).eq("id", id);
    if (error) toast.error("Failed to update.");
    else load();
  };

  if (loading) return null;
  if (risks.length === 0) return null; // nothing detected — don't clutter the summary with an empty card

  return (
    <Card className="border-border/60">
      <CardContent className="py-2.5 px-4">
        <button className="flex items-center justify-between w-full gap-2" onClick={() => setExpanded((e) => !e)}>
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className={cn("h-3.5 w-3.5", openRisks.length > 0 ? "text-red-600" : "text-green-600")} />
            Project Risks
            {openRisks.length === 0 ? (
              <span className="text-muted-foreground font-normal">— none open</span>
            ) : (
              <span className="flex items-center gap-1.5">
                {highCount > 0 && <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{highCount} High</span>}
                {mediumCount > 0 && <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{mediumCount} Med</span>}
                {lowCount > 0 && <span className="rounded-full px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">{lowCount} Low</span>}
              </span>
            )}
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="space-y-1.5 mt-3">
            {openRisks.length === 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> No open risks detected as of the last automated check.
              </p>
            )}
            {openRisks.map((r) => (
              <div key={r.id} className="rounded-md border px-2.5 py-2 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="shrink-0 text-xs" title={r.risk_type}>{typeIcon(r.risk_type)}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{r.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn("inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium", severityClass(r.severity))}>{r.severity}</span>
                  {r.status === "open" && (
                    <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" title="Acknowledge" onClick={() => acknowledge(r.id)}>
                      Ack
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" title="Mark resolved" onClick={() => resolve(r)}>
                    Resolve
                  </Button>
                </div>
              </div>
            ))}

            {resolvedRisks.length > 0 && (
              <button className="text-[11px] text-muted-foreground hover:underline pt-1" onClick={() => setHistoryOpen(true)}>
                {resolvedRisks.length} resolved risk{resolvedRisks.length === 1 ? "" : "s"} — view history
              </button>
            )}

            <div className="flex items-center justify-between pt-0.5">
              <p className="text-[10px] text-muted-foreground">
                Automatically detected from budget, schedule, and extracted weekly reports — refreshed nightly and whenever a new report is processed.
              </p>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-1 shrink-0" onClick={() => setHistoryOpen(true)}>
                <History className="h-3 w-3" /> History
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Risk History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {risks.length === 0 && <p className="text-sm text-muted-foreground">No risks recorded for this project yet.</p>}
            {risks
              .slice()
              .sort((a, b) => new Date(b.first_detected_at).getTime() - new Date(a.first_detected_at).getTime())
              .map((r) => (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{r.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", severityClass(r.severity))}>{r.severity}</span>
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        r.status === "resolved" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : r.status === "acknowledged" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      )}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <p className="text-[11px] text-muted-foreground">
                      Detected {format(new Date(r.first_detected_at), "MMM d, yyyy")}
                      {r.status === "resolved" && r.resolved_at && (
                        <> · Resolved {format(new Date(r.resolved_at), "MMM d, yyyy")} ({r.resolution_type === "manual" ? "manually" : "automatically"})</>
                      )}
                      {r.status !== "resolved" && <> · Last confirmed {format(new Date(r.last_confirmed_at), "MMM d, yyyy")}</>}
                    </p>
                    {r.status === "resolved" && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => reopen(r.id)}>
                        <RotateCcw className="h-3 w-3" /> Reopen
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
