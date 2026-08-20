// Lightweight Schedule of Values export — hard/soft cost budget only.
//
// Unlike exportPDF.tsx (which produces the full G702/G703 pay-application
// package with draw-by-draw calculations), this export is just the static
// budget: division number, division name, cost type, and scheduled value.
// No transactions, no "this period"/"to date" math, no retainage.

import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { BudgetRow } from "./types";

const fmtCur = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function sortedRows(budgetRows: BudgetRow[]) {
  return [...budgetRows].sort((a, b) => a.division_number.localeCompare(b.division_number));
}

function buildSections(budgetRows: BudgetRow[]) {
  const rows = sortedRows(budgetRows);
  const hard = rows.filter((r) => r.cost_type === "hard");
  const soft = rows.filter((r) => r.cost_type === "soft");
  const other = rows.filter((r) => r.cost_type !== "hard" && r.cost_type !== "soft");
  const sum = (rs: BudgetRow[]) => rs.reduce((s, r) => s + Number(r.scheduled_value), 0);
  return {
    hard, soft, other,
    hardTotal: sum(hard),
    softTotal: sum(soft),
    otherTotal: sum(other),
    grandTotal: sum(rows),
  };
}

export async function exportScheduleOfValuesXLSX(projectName: string, budgetRows: BudgetRow[]) {
  const { hard, soft, other, hardTotal, softTotal, otherTotal, grandTotal } = buildSections(budgetRows);

  const CUR_FMT = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)';
  const thinBorder = { style: "thin" as const, color: { argb: "FF000000" } };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Schedule of Values");
  ws.columns = [
    { width: 4.5 },  // A (spacer, matches reference layout starting at B)
    { width: 15 },   // B — Division No.
    { width: 43 },   // C — Division Name
    { width: 13 },   // D — Cost Type
    { width: 19 },   // E — Scheduled Value
    { width: 61 },   // F — Notes
  ];

  type BorderSides = { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean };
  const applyBorder = (cell: ExcelJS.Cell, sides: BorderSides) => {
    cell.border = {
      top: sides.top ? thinBorder : undefined,
      bottom: sides.bottom ? thinBorder : undefined,
      left: sides.left ? thinBorder : undefined,
      right: sides.right ? thinBorder : undefined,
    };
  };

  const setCell = (
    col: string,
    row: number,
    value: string | number,
    opts?: {
      bold?: boolean; size?: number; align?: "center" | "left" | "right"; fill?: boolean; currency?: boolean;
      border?: BorderSides;
    }
  ) => {
    const cell = ws.getCell(`${col}${row}`);
    cell.value = value;
    cell.font = { name: "Calibri", size: opts?.size ?? 12, bold: !!opts?.bold };
    cell.alignment = { horizontal: opts?.align ?? (typeof value === "number" ? "right" : "left"), vertical: "middle" };
    if (opts?.currency) cell.numFmt = CUR_FMT;
    if (opts?.fill) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    }
    if (opts?.border) applyBorder(cell, opts.border);
    return cell;
  };

  // Title block
  setCell("B", 2, projectName, { bold: true, size: 16, align: "center" });
  setCell("B", 3, "Schedule of Values", { bold: true, size: 12, align: "center" });
  setCell("B", 4, `Last Updated: ${format(new Date(), "M/d/yy")}`, { size: 12, fill: true });
  ws.mergeCells("B2:F2");
  ws.mergeCells("B3:F3");
  ws.getRow(2).height = 21;

  // Header row
  const headerRow = 5;
  ["Division No.", "Division Name", "Cost Type", "Scheduled Value", "Notes"].forEach((label, i) => {
    const col = ["B", "C", "D", "E", "F"][i];
    setCell(col, headerRow, label, {
      bold: true, align: "center",
      border: { top: true, left: col === "B", right: col === "F" },
    });
  });

  let r = headerRow + 2;

  const writeSectionHeader = (label: string) => {
    setCell("B", r, label, { bold: true, align: "center", border: { top: true, left: true, right: true } });
    ws.mergeCells(`B${r}:F${r}`);
    r += 1;
  };

  const writeRow = (row: BudgetRow) => {
    setCell("B", r, row.division_number, { border: { left: true } });
    setCell("C", r, row.division_name, { align: "left" });
    setCell("D", r, row.cost_type, { align: "left" });
    setCell("E", r, Number(row.scheduled_value), { currency: true });
    setCell("F", r, row.notes ?? "", { border: { right: true }, align: "left" });
    r += 1;
  };

  const writeSubtotal = (label: string, total: number) => {
    setCell("B", r, label, { bold: true, align: "left", border: { top: true, bottom: true, left: true } });
    ws.mergeCells(`B${r}:C${r}`);
    setCell("D", r, "", { border: { top: true, bottom: true } });
    setCell("E", r, total, { currency: true, bold: true, border: { top: true, bottom: true } });
    setCell("F", r, "", { border: { top: true, bottom: true, right: true } });
    r += 1;
  };

  if (hard.length > 0) {
    writeSectionHeader("HARD COSTS");
    hard.forEach(writeRow);
    writeSubtotal("HARD COSTS Subtotal", hardTotal);
    r += 1;
  }
  if (soft.length > 0) {
    writeSectionHeader("SOFT COSTS");
    soft.forEach(writeRow);
    writeSubtotal("SOFT COSTS Subtotal", softTotal);
    r += 1;
  }
  if (other.length > 0) {
    writeSectionHeader("OTHER");
    other.forEach(writeRow);
    writeSubtotal("OTHER Subtotal", otherTotal);
    r += 1;
  }

  // Grand total
  setCell("B", r, "TOTAL", { bold: true, border: { top: true, bottom: true, left: true } });
  setCell("C", r, "", { border: { top: true, bottom: true } });
  setCell("D", r, "", { border: { top: true, bottom: true } });
  setCell("E", r, grandTotal, { currency: true, bold: true, border: { top: true, bottom: true } });
  setCell("F", r, "", { border: { top: true, bottom: true, right: true } });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.replace(/\s+/g, "_")}_Schedule_of_Values.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportScheduleOfValuesPDF(projectName: string, budgetRows: BudgetRow[]) {
  const { hard, soft, other, hardTotal, softTotal, otherTotal, grandTotal } = buildSections(budgetRows);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Schedule of Values", m, m);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(projectName, m, m + 16);
  doc.text(`Generated ${format(new Date(), "MM/dd/yyyy")}`, pageW - m, m, { align: "right" });

  const body: string[][] = [];
  const pushSection = (label: string, rows: BudgetRow[], total: number) => {
    if (rows.length === 0) return;
    body.push([label, "", ""]);
    rows.forEach((r) => body.push([r.division_number, r.division_name, fmtCur(Number(r.scheduled_value))]));
    body.push([`${label} Subtotal`, "", fmtCur(total)]);
    body.push(["", "", ""]);
  };

  pushSection("HARD COSTS", hard, hardTotal);
  pushSection("SOFT COSTS", soft, softTotal);
  pushSection("OTHER", other, otherTotal);
  body.push(["TOTAL", "", fmtCur(grandTotal)]);

  autoTable(doc, {
    startY: m + 32,
    head: [["Division", "Description", "Scheduled Value"]],
    body,
    theme: "grid",
    margin: { left: m, right: m },
    styles: { fontSize: 8.5, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.75 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 300 },
      2: { halign: "right", cellWidth: 100 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const rowArr = data.row.raw as string[] | undefined;
      if (!rowArr) return;
      const desc = rowArr[0];
      if (desc === "HARD COSTS" || desc === "SOFT COSTS" || desc === "OTHER") {
        data.cell.styles.fontStyle = "bold";
      }
      if (desc.endsWith("Subtotal") || desc === "TOTAL") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = desc === "TOTAL" ? [220, 220, 220] : [240, 240, 240];
      }
    },
  });

  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Generated ${format(new Date(), "MM/dd/yyyy")}`, m, pageH - 20);
  doc.text(projectName, pageW - m, pageH - 20, { align: "right" });

  doc.save(`${projectName.replace(/\s+/g, "_")}_Schedule_of_Values.pdf`);
}
