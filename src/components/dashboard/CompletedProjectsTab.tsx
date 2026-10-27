import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import KindTag from "./KindTag";

export interface CompletedProject {
  id: string;
  name: string;
  brand: string | null;               // "Hampton Inn" or "Hampton Inn / Tapestry"
  kind: "Dev" | "PIP" | null;
  opening: string | null;             // target opening date, yyyy-MM-dd
}

// Where completed projects live once they're off the Dashboard: still one click from
// their project page. (To reopen one, change its status in Project Info.)
export default function CompletedProjectsTab({ projects }: { projects: CompletedProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground" data-testid="completed-empty">
        <p>No completed projects yet.</p>
        <p className="mt-1 text-sm">Set a project's status to Completed in Project Info and it will move here, off the Dashboard.</p>
      </div>
    );
  }
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Completed projects are hidden from the Project Summary and Master Calendar. Open one to see all of its records, or change its status in Project Info to reopen it.
      </p>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Target opening</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} data-testid="completed-row">
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <Link to={`/project/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link>
                    {p.kind && <KindTag kind={p.kind} />}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.brand ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.opening ? format(new Date(`${p.opening}T00:00:00`), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                    <Link to={`/project/${p.id}`} aria-label={`Open ${p.name}`}>Open project</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
