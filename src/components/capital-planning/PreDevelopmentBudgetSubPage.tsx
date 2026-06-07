import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, FileSpreadsheet, FileText } from "lucide-react";
const fmt = (v: number) =>
  v < 0
    ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
import { toast } from "sonner";
import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const DEFAULT_LINE_ITEMS = [
  "Earnest Money",
  "Title",
  "Survey",
  "Environmental",
  "Geotechnical",
  "Entitlements",
  "Permitting Fees",
  "Architecture",
  "Pre-Construction",
  "Civil Engineering",
  "Franchise Fees",
  "Legal",
  "Travel",
  "Miscellaneous",
  "Development Fee",
];

interface PreDevRow {
  id: string;
  project_id: string;
  line_item: string;
  sort_order: number;
  budget_amount: number;
  actual_amount: number;
  notes: string | null;
}

function CurrencyInput({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  const num = parseFloat(value) || 0;
  return (
    <Input
      className="h-7 text-right text-sm w-32"
      value={focused ? value : (num > 0 ? fmt(num) : "")}
      onChange={e => onChange(e.target.value.replace(/[^0-9.-]/g, ""))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder="$0.00"
      disabled={disabled}
    />
  );
}

interface Props {
  projectId: string;
}

export default function PreDevelopmentBudgetSubPage({ projectId }: Props) {
  const [rows, setRows] = useState<PreDevRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [projectMeta, setProjectMeta] = useState<{ name: string; entity: string; city: string; state: string }>({ name: "", entity: "", city: "", state: "" });

  useEffect(() => {
    (async () => {
      const { data: proj } = await (supabase as any)
        .from("projects")
        .select("name, hotel_name")
        .eq("id", projectId)
        .maybeSingle();
      const { data: info } = await (supabase as any)
        .from("project_info")
        .select("property_name, entity_name, owner_name, city, state")
        .eq("project_id", projectId)
        .maybeSingle();
      const meta = {
        name: info?.property_name || proj?.hotel_name || proj?.name || "",
        entity: info?.entity_name || info?.owner_name || "",
        city: info?.city || "",
        state: info?.state || "",
      };
      console.log("[PreDevBudget] project meta:", { projectId, proj, info, meta });
      setProjectMeta(meta);
    })();
  }, [projectId]);

  const locationStr = [projectMeta.city, projectMeta.state].filter(Boolean).join(", ");
  const nameLine = projectMeta.name && locationStr
    ? `${projectMeta.name} — ${locationStr}`
    : (projectMeta.name || locationStr || "—");

  // Draft state
  const [draftBudget, setDraftBudget] = useState<Record<string, string>>({});
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("pre_development_budget")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order");

    if (error) {
      toast.error("Failed to load pre-development budget");
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      setRows(data as PreDevRow[]);
      setLoading(false);
      return;
    }

    // Seed default rows
    const seeds = DEFAULT_LINE_ITEMS.map((name, idx) => ({
      project_id: projectId,
      line_item: name,
      sort_order: idx,
      budget_amount: 0,
      actual_amount: 0,
      notes: null,
    }));

    const { data: inserted, error: insertErr } = await (supabase as any)
      .from("pre_development_budget")
      .insert(seeds)
      .select();

    if (insertErr) toast.error("Failed to initialize pre-development budget");
    else setRows((inserted as PreDevRow[]).sort((a, b) => a.sort_order - b.sort_order));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Sync drafts from rows
  useEffect(() => {
    if (!dirty && rows.length > 0) {
      const b: Record<string, string> = {};
      const a: Record<string, string> = {};
      const n: Record<string, string> = {};
      rows.forEach(r => {
        b[r.id] = Number(r.budget_amount) > 0 ? String(Number(r.budget_amount)) : "";
        a[r.id] = Number(r.actual_amount) > 0 ? String(Number(r.actual_amount)) : "";
        n[r.id] = r.notes ?? "";
      });
      setDraftBudget(b);
      setDraftActual(a);
      setDraftNotes(n);
    }
  }, [rows, dirty]);

  const totals = useMemo(() => {
    const budget = Object.values(draftBudget).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const actual = Object.values(draftActual).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    return { budget, actual, variance: budget - actual };
  }, [draftBudget, draftActual]);

  const handleSaveAll = async () => {
    for (const row of rows) {
      const budgetAmt = parseFloat(draftBudget[row.id] || "0") || 0;
      const actualAmt = parseFloat(draftActual[row.id] || "0") || 0;
      const notes = draftNotes[row.id] || null;

      if (
        Number(row.budget_amount) !== budgetAmt ||
        Number(row.actual_amount) !== actualAmt ||
        (row.notes ?? "") !== (notes ?? "")
      ) {
        const { error } = await (supabase as any)
          .from("pre_development_budget")
          .update({ budget_amount: budgetAmt, actual_amount: actualAmt, notes })
          .eq("id", row.id);
        if (error) { toast.error(error.message); return; }
      }
    }
    setDirty(false);
    await load();
    toast.success("Pre-development budget saved");
  };

  const buildExportRows = () => rows.map(r => {
    const budget = parseFloat(draftBudget[r.id] || "0") || 0;
    const actual = parseFloat(draftActual[r.id] || "0") || 0;
    return {
      lineItem: r.line_item,
      budget,
      actual,
      variance: budget - actual,
      notes: draftNotes[r.id] || "",
    };
  });

  const fileBase = () => {
    const name = (projectMeta.name || "Project").replace(/[^\w\-]+/g, "_");
    return `${name}_PreDev_Budget_${format(new Date(), "yyyy-MM-dd")}`;
  };

  const handleExportXLS = () => {
    console.log("[PreDevBudget XLS] meta:", projectMeta);
    const data = buildExportRows();
    const fmtCur = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)';
    const navy = "0F1B3D";
    const navyLight = "1E2F5C";
    const headerRow = ["Line Item", "Budget Amount", "Actual Amount", "Remaining", "Notes"];

    const aoa: any[][] = [
      ["Pre-Development Budget", "", "", "", ""],
      [`Project: ${projectMeta.name || "—"}    Location: ${locationStr || "—"}    Entity: ${projectMeta.entity || "—"}    ${format(new Date(), "MM/dd/yyyy")}`, "", "", "", ""],
      ["", "", "", "", ""],
      headerRow,
      ...data.map(d => [d.lineItem, d.budget, d.actual, d.variance, d.notes]),
      ["Total", totals.budget, totals.actual, totals.variance, ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 44 }];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    ];
    ws["!rows"] = [{ hpt: 32 }, { hpt: 20 }, { hpt: 8 }, { hpt: 22 }];

    const thin = { style: "thin", color: { rgb: "B8BCC8" } };
    const thick = { style: "medium", color: { rgb: navy } };
    const border = { top: thin, bottom: thin, left: thin, right: thin };

    // Title row
    (ws["A1"] as any).s = {
      font: { name: "Calibri", bold: true, sz: 18, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: navy } },
      alignment: { horizontal: "left", vertical: "center", indent: 1 },
    };
    // Subtitle row
    (ws["A2"] as any).s = {
      font: { name: "Calibri", bold: true, sz: 12, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: navy } },
      alignment: { horizontal: "left", vertical: "center", indent: 1 },
    };
    // Fill merged cells too (so background spans)
    for (const addr of ["B1","C1","D1","E1"]) {
      ws[addr] = ws[addr] || { t: "s", v: "" };
      (ws[addr] as any).s = { fill: { fgColor: { rgb: navy } } };
    }
    for (const addr of ["B2","C2","D2","E2"]) {
      ws[addr] = ws[addr] || { t: "s", v: "" };
      (ws[addr] as any).s = { fill: { fgColor: { rgb: navy } } };
    }

    // Header row (row 4 / index 3)
    for (let c = 0; c < 5; c++) {
      const addr = XLSX.utils.encode_cell({ r: 3, c });
      (ws[addr] as any).s = {
        font: { name: "Calibri", bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: navy } },
        alignment: { horizontal: "center", vertical: "center" },
        border,
      };
    }

    // Data rows
    const dataStart = 4;
    const dataEnd = dataStart + data.length - 1;
    for (let r = dataStart; r <= dataEnd; r++) {
      const zebra = (r - dataStart) % 2 === 1;
      const fill = zebra ? { fgColor: { rgb: "F8F9FA" } } : { fgColor: { rgb: "FFFFFF" } };
      for (let c = 0; c < 5; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        const isNum = c >= 1 && c <= 3;
        const isNotes = c === 4;
        (ws[addr] as any).s = {
          font: {
            name: "Calibri",
            sz: 11,
            italic: isNotes,
            color: { rgb: isNotes ? "6B7280" : "111111" },
          },
          fill,
          alignment: {
            horizontal: isNum ? "right" : (c === 0 ? "left" : "left"),
            vertical: "center",
            indent: c === 0 ? 1 : 0,
            wrapText: isNotes,
          },
          border,
        };
        if (isNum) (ws[addr] as any).z = fmtCur;
      }
    }

    // Totals row
    const totalsR = dataEnd + 1;
    for (let c = 0; c < 5; c++) {
      const addr = XLSX.utils.encode_cell({ r: totalsR, c });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      (ws[addr] as any).s = {
        font: { name: "Calibri", bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: navyLight } },
        alignment: { horizontal: c >= 1 && c <= 3 ? "right" : "left", vertical: "center", indent: c === 0 ? 1 : 0 },
        border: { top: thick, bottom: thick, left: thin, right: thin },
      };
      if (c >= 1 && c <= 3) (ws[addr] as any).z = fmtCur;
    }

    // Thick outer border around full table
    const tableTop = 3, tableBot = totalsR;
    for (let r = tableTop; r <= tableBot; r++) {
      for (let c = 0; c < 5; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as any;
        if (!cell.s) cell.s = {};
        if (!cell.s.border) cell.s.border = { ...border };
        const b = { ...cell.s.border };
        if (r === tableTop) b.top = thick;
        if (r === tableBot) b.bottom = thick;
        if (c === 0) b.left = thick;
        if (c === 4) b.right = thick;
        cell.s.border = b;
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pre-Development Budget");
    XLSX.writeFile(wb, `${fileBase()}.xlsx`);
  };

  const fmtCur = (v: number) =>
    v < 0
      ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
      : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleExportPDF = () => {
    const data = buildExportRows();
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const dateStr = format(new Date(), "MM/dd/yyyy");
    const navy: [number, number, number] = [15, 27, 61];
    const navyLight: [number, number, number] = [30, 47, 92];
    const lightGrey: [number, number, number] = [248, 249, 250];
    const greyText: [number, number, number] = [107, 114, 128];

    const drawHeader = () => {
      console.log("[PreDevBudget PDF] meta:", projectMeta);
      // Navy header bar
      doc.setFillColor(...navy);
      doc.rect(0, 0, pageW, 72, "F");

      // Logo placeholder (top-left circle + monogram)
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1);
      doc.circle(52, 36, 18, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("WI", 52, 41, { align: "center" });

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Pre-Development Budget", 84, 28);

      // Project name — City, State
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(nameLine, 84, 45);

      // Entity name
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(projectMeta.entity || "", 84, 58);

      // Date right-aligned
      doc.setFontSize(9);
      doc.text(`Generated ${dateStr}`, pageW - 36, 32, { align: "right" });
    };

    drawHeader();
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 90,
      head: [["Line Item", "Budget", "Actual", "Remaining", "Notes"]],
      body: data.map(d => [d.lineItem, fmtCur(d.budget), fmtCur(d.actual), fmtCur(d.variance), d.notes]),
      foot: [["Total", fmtCur(totals.budget), fmtCur(totals.actual), fmtCur(totals.variance), ""]],
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
        lineColor: [220, 222, 230],
        lineWidth: 0.5,
        textColor: [25, 25, 25],
      },
      headStyles: {
        fillColor: navy,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
        halign: "center",
        lineColor: navy,
        lineWidth: 0.5,
      },
      footStyles: {
        fillColor: navyLight,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
        lineColor: navyLight,
        lineWidth: 0.5,
      },
      alternateRowStyles: { fillColor: lightGrey },
      columnStyles: {
        0: { cellPadding: { top: 6, right: 8, bottom: 6, left: 14 }, fontStyle: "bold" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { fontSize: 8.5, textColor: greyText },
      },
      didParseCell: (d: any) => {
        if (d.section === "foot") {
          if (d.column.index >= 1 && d.column.index <= 3) d.cell.styles.halign = "right";
          // heavier top border separating totals
          d.cell.styles.lineWidth = { top: 1.5, right: 0.5, bottom: 0.5, left: 0.5 } as any;
          d.cell.styles.lineColor = navy;
        }
      },
      margin: { left: 36, right: 36, top: 90 },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) drawHeader();

        // Footer line
        doc.setDrawColor(...navy);
        doc.setLineWidth(0.75);
        doc.line(36, pageH - 34, pageW - 36, pageH - 34);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...navy);
        doc.text("Confidential — Witness Investments", 36, pageH - 20);
        doc.text(dateStr, pageW / 2, pageH - 20, { align: "center" });
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageW - 36, pageH - 20, { align: "right" });
      },
    });

    // Outer table border
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setDrawColor(...navy);
    doc.setLineWidth(1);
    doc.rect(36, 90, pageW - 72, finalY - 90, "S");

    doc.save(`${fileBase()}.pdf`);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pre-Development Budget</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportXLS}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export XLS
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportPDF}>
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSaveAll} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>


      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-center text-xs">
              <th className="px-3 py-2 w-48">Line Item</th>
              <th className="px-3 py-2 w-36">Budget</th>
              <th className="px-3 py-2 w-36">Actual</th>
              <th className="px-3 py-2 w-28">Remaining</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const budget = parseFloat(draftBudget[row.id] || "0") || 0;
              const actual = parseFloat(draftActual[row.id] || "0") || 0;
              const variance = budget - actual;
              return (
                <tr key={row.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-sm font-medium">{row.line_item}</td>
                  <td className="px-3 py-1.5">
                    <CurrencyInput
                      value={draftBudget[row.id] ?? ""}
                      onChange={v => { setDraftBudget(p => ({ ...p, [row.id]: v })); setDirty(true); }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <CurrencyInput
                      value={draftActual[row.id] ?? ""}
                      onChange={v => { setDraftActual(p => ({ ...p, [row.id]: v })); setDirty(true); }}
                    />
                  </td>
                  <td className={`px-3 py-1.5 text-sm text-right font-medium ${variance < 0 ? "text-destructive" : "text-green-600"}`}>
                    {(budget > 0 || actual > 0) ? fmt(variance) : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      className="h-7 text-sm"
                      value={draftNotes[row.id] ?? ""}
                      onChange={e => { setDraftNotes(p => ({ ...p, [row.id]: e.target.value })); setDirty(true); }}
                      placeholder="Notes…"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/50 font-semibold text-xs">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right pr-6">{fmt(totals.budget)}</td>
              <td className="px-3 py-2 text-right pr-6">{fmt(totals.actual)}</td>
              <td className={`px-3 py-2 text-right ${totals.variance < 0 ? "text-destructive" : "text-green-600"}`}>
                {fmt(totals.variance)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
