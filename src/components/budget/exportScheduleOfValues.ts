// Lightweight Schedule of Values export — hard/soft cost budget only.
//
// Unlike exportPDF.tsx (which produces the full G702/G703 pay-application
// package with draw-by-draw calculations), this export is just the static
// budget: division number, division name, cost type, and scheduled value.
// No transactions, no "this period"/"to date" math, no retainage.

import * as XLSX from "xlsx";
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

export function exportScheduleOfValuesXLSX(projectName: string, budgetRows: BudgetRow[]) {
  const { hard, soft, other, hardTotal, softTotal, otherTotal, grandTotal } = buildSections(budgetRows);

  const sheetRows: (string | number)[][] = [
    ["Schedule of Values"],
    [projectName],
    [`Generated ${format(new Date(), "MM/dd/yyyy")}`],
    [],
    ["Division No.", "Division Name", "Cost Type", "Scheduled Value"],
  ];

  const pushSection = (label: string, rows: BudgetRow[], total: number) => {
    if (rows.length === 0) return;
    sheetRows.push([label, "", "", ""]);
    rows.forEach((r) =>
      sheetRows.push([r.division_number, r.division_name, r.cost_type, Number(r.scheduled_value)])
    );
    sheetRows.push([`${label} Subtotal`, "", "", total]);
    sheetRows.push([]);
  };

  pushSection("HARD COSTS", hard, hardTotal);
  pushSection("SOFT COSTS", soft, softTotal);
  pushSection("OTHER", other, otherTotal);

  sheetRows.push(["TOTAL", "", "", grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws["!cols"] = [{ wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule of Values");
  XLSX.writeFile(wb, `${projectName.replace(/\s+/g, "_")}_Schedule_of_Values.xlsx`);
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
