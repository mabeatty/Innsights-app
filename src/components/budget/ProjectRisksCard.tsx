import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Risk {
  id: string;
  risk_type: "Budget" | "Schedule" | "Compliance" | "Report";
  severity: "Low" | "Medium" | "High";
  title: string;
  description: string;
  status: "open" | "acknowledged" | "resolved";
  first_detected_at: string;
  last_confirmed_at: string;
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
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState(true);

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

  const acknowledge = async (id: string) => {
    const { error } = await supabase.from("project_risks").update({ status: "acknowledged" }).eq("id", id);
    if (error) toast.error("Failed to update.");
    else load();
  };

  const reopen = async (id: string) => {
    const { error } = await supabase.from("project_risks").update({ status: "open" }).eq("id", id);
    if (error) toast.error("Failed to update.");
    else load();
  };

  if (loading) return null;
  if (risks.length === 0) return null; // nothing detected — don't clutter the summary with an empty card

  return (
    <Card className={cn(openRisks.some((r) => r.severity === "High") ? "border-red-300 dark:border-red-900" : undefined)}>
      <CardContent className="pt-4 pb-4 px-4 space-y-3">
        <button className="flex items-center justify-between w-full" onClick={() => setExpanded((e) => !e)}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className={cn("h-4 w-4", openRisks.length > 0 ? "text-red-600" : "text-green-600")} />
            Project Risks {openRisks.length > 0 && <span className="text-xs font-normal text-muted-foreground">({openRisks.length} open)</span>}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="space-y-2">
            {openRisks.length === 0 && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> No open risks detected as of the last automated check.
              </p>
            )}
            {openRisks.map((r) => (
              <div key={r.id} className="rounded-md border p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="shrink-0" title={r.risk_type}>{typeIcon(r.risk_type)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Detected {formatDistanceToNow(new Date(r.first_detected_at), { addSuffix: true })} · last confirmed {formatDistanceToNow(new Date(r.last_confirmed_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", severityClass(r.severity))}>{r.severity}</span>
                    {r.status === "open" && (
                      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" title="Acknowledge" onClick={() => acknowledge(r.id)}>
                        Ack
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {resolvedRisks.length > 0 && (
              <div className="pt-1">
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowResolved((s) => !s)}>
                  {showResolved ? "Hide" : "Show"} {resolvedRisks.length} resolved risk{resolvedRisks.length === 1 ? "" : "s"}
                </button>
                {showResolved && (
                  <div className="space-y-1.5 mt-2">
                    {resolvedRisks.map((r) => (
                      <div key={r.id} className="rounded-md border border-dashed p-2 flex items-center justify-between gap-2 opacity-70">
                        <p className="text-xs">{r.title}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Reopen" onClick={() => reopen(r.id)}>
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground pt-1">
              Automatically detected from budget, schedule, and extracted weekly reports — refreshed nightly and whenever a new report is processed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
