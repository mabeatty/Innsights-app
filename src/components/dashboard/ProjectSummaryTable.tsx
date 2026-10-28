import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";

// The Dashboard's project table, shared by the Project Summary and the Completed tab so the
// two always have the same columns and the same cells.

export const fmtCost = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

export const fmtCents = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const SUMMARY_COLUMN_COUNT = 6;

export interface SummaryProject {
  id: string;
  name: string;
  updated_at: string;
  _projectCost?: number | null;
  _completedToDate?: number | null;
  _constructionStart?: string | null;
  _completionDate?: string | null;
}

export function SummaryColGroup() {
  return (
    <colgroup>
      <col style={{ width: "22%" }} />
      <col style={{ width: "16%" }} />
      <col style={{ width: "18%" }} />
      <col style={{ width: "16%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "16%" }} />
    </colgroup>
  );
}

export function SummaryHead() {
  return (
    <thead className="bg-muted/50">
      <tr>
        <th className="text-center">Project</th>
        <th className="text-center">Project Cost</th>
        <th className="text-center">Completed to Date</th>
        <th className="text-center">Construction Start</th>
        <th className="text-center">Completion Date</th>
        <th className="text-center">Last Updated</th>
      </tr>
    </thead>
  );
}

export function SummaryProjectRow({ project: p, hasAlert, testId }: { project: SummaryProject; hasAlert: boolean; testId?: string }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors" data-testid={testId}>
      <td className="text-center">
        <Link to={`/project/${p.id}`} className="text-primary hover:underline font-medium inline-flex items-center gap-1.5">
          {hasAlert && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          {p.name}
        </Link>
      </td>
      <td className="text-center text-foreground">{p._projectCost != null ? fmtCost(p._projectCost) : "—"}</td>
      <td className="text-center text-foreground">{p._completedToDate != null ? fmtCents(p._completedToDate) : "—"}</td>
      <td className="text-center text-muted-foreground">
        {p._constructionStart ? format(new Date(p._constructionStart + "T00:00:00"), "MMM yyyy") : "—"}
      </td>
      <td className="text-center text-muted-foreground">
        {p._completionDate ? format(new Date(p._completionDate + "T00:00:00"), "MMM yyyy") : "—"}
      </td>
      <td className="text-center text-muted-foreground">{format(new Date(p.updated_at), "MMM d, yyyy")}</td>
    </tr>
  );
}
