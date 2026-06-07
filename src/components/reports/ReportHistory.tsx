import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface GeneratedReport {
  id: string;
  report_period_start: string;
  report_period_end: string;
  delivery_method: string;
  recipients: string[];
  storage_path: string | null;
  created_at: string;
}

interface ReportHistoryProps {
  projectId: string;
  canEdit: boolean;
  refreshTrigger: number;
}

export default function ReportHistory({ projectId, canEdit, refreshTrigger }: ReportHistoryProps) {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    const { data } = await supabase
      .from("generated_reports")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setReports((data ?? []) as GeneratedReport[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchReports(); }, [fetchReports, refreshTrigger]);

  const downloadReport = async (report: GeneratedReport) => {
    if (!report.storage_path) return;
    const { data, error } = await supabase.storage
      .from("generated-reports")
      .download(report.storage_path);
    if (error || !data) {
      toast.error("Failed to download report.");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = report.storage_path.split("/").pop() || "report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteReport = async (report: GeneratedReport) => {
    if (report.storage_path) {
      await supabase.storage.from("generated-reports").remove([report.storage_path]);
    }
    const { error } = await supabase.from("generated_reports").delete().eq("id", report.id);
    if (error) toast.error(error.message);
    else { toast.success("Report deleted."); fetchReports(); }
  };

  if (loading) return null;
  if (reports.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Report History</h3>
      <div className="border rounded-lg divide-y">
        {reports.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {format(new Date(r.report_period_start + "T00:00:00"), "MMM d")} – {format(new Date(r.report_period_end + "T00:00:00"), "MMM d, yyyy")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Generated {format(new Date(r.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {r.delivery_method === "both" ? "Download + Email" : r.delivery_method === "email" ? "Email" : "Download"}
              </Badge>
              {r.storage_path && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadReport(r)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteReport(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
