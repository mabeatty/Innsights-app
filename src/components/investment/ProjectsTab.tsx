import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { toast } from "sonner";
import InvestorCapitalCallTracker from "@/components/capital-planning/InvestorCapitalCallTracker";
import { fmt } from "@/components/capital-planning/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Project { id: string; name: string; }
interface Position {
  id: string; investing_entity: string; contact_name: string;
  ownership_pct: number; committed: number; contributed: number;
  distributed: number; unreturned_capital: number; source: string;
  project_id: string; notes: string | null; created_at: string; updated_at: string;
}

function getStatus(committed: number, contributed: number) {
  if (committed <= 0) return "Unfunded";
  if (contributed >= committed) return "Funded";
  if (contributed > 0) return "Partial";
  return "Unfunded";
}

export default function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      const list = (data ?? []) as Project[];
      setProjects(list);
      if (list.length > 0) setSelectedId(list[0].id);
      setLoading(false);
    })();
  }, []);

  const loadPositions = useCallback(async () => {
    if (!selectedId) { setPositions([]); return; }
    const { data } = await supabase
      .from("investor_positions").select("*")
      .eq("project_id", selectedId).order("investing_entity") as any;
    setPositions(data ?? []);
    setSelectedIds(new Set());
  }, [selectedId]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  const projectName = useMemo(() => projects.find(p => p.id === selectedId)?.name ?? "", [projects, selectedId]);

  const selectedPositions = useMemo(
    () => positions.filter(p => selectedIds.has(p.id)),
    [positions, selectedIds]
  );

  const buildRows = () => {
    return selectedPositions.map(p => {
      const remaining = Number(p.committed) - Number(p.contributed);
      return {
        "Investor Name": p.investing_entity || "—",
        "Contact Name": p.contact_name || "—",
        "Ownership %": Number(p.ownership_pct).toFixed(2) + "%",
        "Total Committed": Number(p.committed),
        "Called to Date": Number(p.contributed),
        "Remaining": remaining,
        "Distributed": Number(p.distributed),
        "Status": getStatus(Number(p.committed), Number(p.contributed)),
      };
    });
  };

  const buildTotals = (rows: ReturnType<typeof buildRows>) => ({
    "Investor Name": "Totals",
    "Contact Name": "",
    "Ownership %": rows.reduce((s, r) => s + parseFloat(r["Ownership %"]), 0).toFixed(2) + "%",
    "Total Committed": rows.reduce((s, r) => s + r["Total Committed"], 0),
    "Called to Date": rows.reduce((s, r) => s + r["Called to Date"], 0),
    "Remaining": rows.reduce((s, r) => s + r["Remaining"], 0),
    "Distributed": rows.reduce((s, r) => s + r["Distributed"], 0),
    "Status": "",
  });

  const handleExport = (format: "xlsx" | "csv" | "pdf") => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one investor to generate a report");
      return;
    }
    const rows = buildRows();
    const totals = buildTotals(rows);
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text(projectName + " — Investor Report", 14, 16);
      doc.setFontSize(9);
      doc.text("Generated: " + dateStr, 14, 22);

      const headers = ["Investor Name", "Contact Name", "Ownership %", "Total Committed", "Called to Date", "Remaining", "Distributed", "Status"];
      const fmtRow = (r: any) => [
        r["Investor Name"], r["Contact Name"], r["Ownership %"],
        typeof r["Total Committed"] === "number" ? fmt(r["Total Committed"]) : r["Total Committed"],
        typeof r["Called to Date"] === "number" ? fmt(r["Called to Date"]) : r["Called to Date"],
        typeof r["Remaining"] === "number" ? fmt(r["Remaining"]) : r["Remaining"],
        typeof r["Distributed"] === "number" ? fmt(r["Distributed"]) : r["Distributed"],
        r["Status"],
      ];
      const body = rows.map(fmtRow);
      body.push(fmtRow(totals));

      autoTable(doc, {
        startY: 28,
        head: [headers],
        body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
        didParseCell: (data: any) => {
          if (data.row.index === body.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });
      doc.save(`${projectName}_Investor_Report.pdf`);
      toast.success("PDF report downloaded");
    } else if (format === "csv") {
      const headers = ["Investor Name", "Contact Name", "Ownership %", "Total Committed", "Called to Date", "Remaining", "Distributed", "Status"];
      const csvRows = [
        `"${projectName} — Investor Report"`,
        `"Generated: ${dateStr}"`,
        "",
        headers.map(h => `"${h}"`).join(","),
        ...rows.map(r => headers.map(h => {
          const v = (r as any)[h];
          return typeof v === "number" ? v : `"${v}"`;
        }).join(",")),
        headers.map(h => {
          const v = (totals as any)[h];
          return typeof v === "number" ? v : `"${v}"`;
        }).join(","),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}_Investor_Report.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV report downloaded");
    } else {
      const headers = ["Investor Name", "Contact Name", "Ownership %", "Total Committed", "Called to Date", "Remaining", "Distributed", "Status"];
      const wsData: any[][] = [
        [projectName + " — Investor Report"],
        ["Generated: " + dateStr],
        [],
        headers,
        ...rows.map(r => headers.map(h => (r as any)[h])),
        headers.map(h => (totals as any)[h]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Bold headers row (row index 3)
      headers.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 3, c: i })];
        if (cell) cell.s = { font: { bold: true } };
      });
      // Currency format on numeric columns (cols 3-6)
      for (let r = 4; r < 4 + rows.length + 1; r++) {
        for (let c = 3; c <= 6; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && typeof cell.v === "number") cell.z = '"$"#,##0';
        }
      }
      // Bold totals row
      const totalsRow = 4 + rows.length;
      headers.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: totalsRow, c: i })];
        if (cell) cell.s = { font: { bold: true } };
      });
      ws["!cols"] = headers.map(() => ({ wch: 18 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Investor Report");
      XLSX.writeFile(wb, `${projectName}_Investor_Report.xlsx`);
      toast.success("Excel report downloaded");
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center justify-between gap-4">
        <div className="max-w-xs w-full">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedId && positions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={selectedIds.size === 0}>
                <FileDown className="h-3.5 w-3.5" />
                Generate Report{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("xlsx")} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Export as XLS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv")} className="gap-2">
                <FileText className="h-4 w-4" /> Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")} className="gap-2">
                <FileDown className="h-4 w-4" /> Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {selectedId && positions.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No equity data found for this project. Upload an AppFolio CSV or add investors manually in Cash Planning.
        </p>
      ) : selectedId ? (
        <InvestorCapitalCallTracker
          key={selectedId}
          projectId={selectedId}
          positions={positions}
          reload={loadPositions}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : null}
    </div>
  );
}
