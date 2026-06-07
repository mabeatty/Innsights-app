import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

/* ── Interfaces ── */

interface ProjectData {
  projectName: string;
  entityName: string;
  brandName: string;
  status: string;
  projectType: string;
}

interface BudgetLineItem {
  division_number: string;
  division_name: string;
  cost_type: string;
  scheduled_value: number;
  actual_spent: number;
  variance: number;
  pct_complete: number;
}

interface DrawItem {
  draw_number: number;
  draw_month: string;
  total_amount: number;
  cumulative: number;
  status: string;
}

interface EquitySourceItem {
  source_name: string;
  equity_type: string;
  total_commitment: number;
  equity_called: number;
}

interface DebtTrancheItem {
  lender_name: string;
  loan_type: string;
  loan_amount: number;
  interest_rate: number;
  rate_type: string;
  maturity_date: string | null;
}

export interface MonthlyReportData {
  project: ProjectData;
  periodStart: string;
  periodEnd: string;
  budgetLines: BudgetLineItem[];
  draws: DrawItem[];
  constructionStart?: string | null;
  projectedCompletion?: string | null;
  includeProjectSnapshot?: boolean;
  equitySources?: EquitySourceItem[];
  debtTranches?: DebtTrancheItem[];
  activityBullets?: string[];
  activityDateRanges?: string[];
}

/* ── Constants ── */

const NAVY: [number, number, number] = [15, 23, 42];
const LIGHT_GRAY: [number, number, number] = [245, 245, 250];
const ACCENT: [number, number, number] = [59, 130, 246];

const fmtCurrency = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d + "T00:00:00"), "MMM d, yyyy") : "—";

/* ── Helpers ── */

function drawHeader(doc: jsPDF, projectName: string, extras: string[], pageLabel: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(projectName, 10, 9);
  // Right side: extras + page label
  const rightText = [...extras, pageLabel].filter(Boolean).join("  |  ");
  doc.text(rightText, w - 10, 9, { align: "right" });
}

function drawFooter(doc: jsPDF, generatedDate: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200, 200, 210);
  doc.line(10, h - 12, w - 10, h - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 140);
  doc.text("Confidential — Witness Investments", 10, h - 7);
  doc.text(generatedDate, w - 10, h - 7, { align: "right" });
}

function drawStatBox(doc: jsPDF, x: number, y: number, bw: number, bh: number, label: string, value: string) {
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(x, y, bw, bh, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 120);
  doc.text(label, x + bw / 2, y + 6, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(value, x + bw / 2, y + 14, { align: "center" });
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(title, 10, y);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(10, y + 1.5, 60, y + 1.5);
  return y + 6;
}

/* ── Main export ── */

export function generateMonthlyPDF(data: MonthlyReportData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const generatedDate = format(new Date(), "MMMM d, yyyy");
  const periodStr = `${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`;

  // ════════════════════════════════════════════════
  // PAGE 1 — Project Snapshot + Financial Summary
  // ════════════════════════════════════════════════

  const headerExtras = [
    data.project.entityName,
    data.project.brandName,
    periodStr,
  ].filter(Boolean);
  drawHeader(doc, data.project.projectName, headerExtras, "Page 1 of 2");
  drawFooter(doc, generatedDate);

  let y = 20;

  // ── Top row: Three stat boxes ──
  const boxW = (w - 30) / 3;
  const boxH = 18;
  drawStatBox(doc, 10, y, boxW, boxH, "Construction Start", fmtDate(data.constructionStart));
  drawStatBox(doc, 10 + boxW + 5, y, boxW, boxH, "Projected Completion", fmtDate(data.projectedCompletion));
  drawStatBox(doc, 10 + (boxW + 5) * 2, y, boxW, boxH, "Current Status", data.project.status || "Active");
  y += boxH + 6;

  // ── Financial highlights ──
  const totalBudget = data.budgetLines.reduce((s, r) => s + r.scheduled_value, 0);
  const totalSpent = data.budgetLines.reduce((s, r) => s + r.actual_spent, 0);
  const remaining = totalBudget - totalSpent;
  const pctComplete = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const finW = (w - 25) / 4;
  drawStatBox(doc, 10, y, finW, boxH, "Total Budget", fmtCurrency(totalBudget));
  drawStatBox(doc, 10 + finW + 5 / 3, y, finW, boxH, "Spent to Date", fmtCurrency(totalSpent));
  drawStatBox(doc, 10 + (finW + 5 / 3) * 2, y, finW, boxH, "Remaining", fmtCurrency(remaining));
  drawStatBox(doc, 10 + (finW + 5 / 3) * 3, y, finW, boxH, "% Complete", `${pctComplete.toFixed(1)}%`);
  y += boxH + 6;

  // ── Category table ──
  y = sectionTitle(doc, "Budget by Category", y);

  // Group by cost_type
  const categories = new Map<string, { budget: number; spent: number }>();
  for (const line of data.budgetLines) {
    const cat = line.cost_type || "Other";
    const existing = categories.get(cat) || { budget: 0, spent: 0 };
    existing.budget += line.scheduled_value;
    existing.spent += line.actual_spent;
    categories.set(cat, existing);
  }

  const catBody: (string | number)[][] = [];
  for (const [cat, vals] of categories) {
    const variance = vals.budget - vals.spent;
    const pct = vals.budget > 0 ? (vals.spent / vals.budget) * 100 : 0;
    catBody.push([cat, fmtCurrency(vals.budget), fmtCurrency(vals.spent), fmtCurrency(variance), `${pct.toFixed(1)}%`]);
  }
  // Totals row
  catBody.push(["TOTAL", fmtCurrency(totalBudget), fmtCurrency(totalSpent), fmtCurrency(remaining), `${pctComplete.toFixed(1)}%`]);

  if (catBody.length > 1) {
    autoTable(doc, {
      startY: y,
      head: [["Category", "Budget", "Spent", "Variance", "% Complete"]],
      body: catBody,
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: [...NAVY] as any, textColor: [255, 255, 255] as any, fontStyle: "bold", fontSize: 7, cellPadding: 1.5 },
      bodyStyles: { fontSize: 7, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [...LIGHT_GRAY] as any },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      didParseCell: (hookData: any) => {
        if (hookData.section === "body" && hookData.row.index === catBody.length - 1) {
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fillColor = [220, 225, 240];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 160);
    doc.text("No budget data available.", 10, y);
    y += 6;
  }

  // ── Detailed line items table ──
  y = sectionTitle(doc, "Line Item Detail", y);
  const lineBody = data.budgetLines
    .filter(r => r.scheduled_value !== 0 || r.actual_spent !== 0)
    .map(r => [
      `${r.division_number} ${r.division_name}`,
      fmtCurrency(r.scheduled_value),
      fmtCurrency(r.actual_spent),
      fmtCurrency(r.variance),
      `${r.pct_complete.toFixed(1)}%`,
    ]);

  if (lineBody.length > 0) {
    lineBody.push(["TOTAL", fmtCurrency(totalBudget), fmtCurrency(totalSpent), fmtCurrency(remaining), `${pctComplete.toFixed(1)}%`]);
    autoTable(doc, {
      startY: y,
      head: [["Line Item", "Budget", "Spent", "Variance", "% Complete"]],
      body: lineBody,
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: [...NAVY] as any, textColor: [255, 255, 255] as any, fontStyle: "bold", fontSize: 6.5, cellPadding: 1.2 },
      bodyStyles: { fontSize: 6.5, cellPadding: 1.2 },
      alternateRowStyles: { fillColor: [...LIGHT_GRAY] as any },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      didParseCell: (hookData: any) => {
        if (hookData.section === "body" && hookData.row.index === lineBody.length - 1) {
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fillColor = [220, 225, 240];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Draw Status (single line per draw) ──
  if (data.draws.length > 0) {
    y = sectionTitle(doc, "Draw Status", y);
    const latestDraw = data.draws[data.draws.length - 1];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 80);
    const drawLine = `Draw #${latestDraw.draw_number}  |  Period: ${fmtDate(latestDraw.draw_month)}  |  Amount Requested: ${fmtCurrency(latestDraw.total_amount)}  |  Cumulative to Date: ${fmtCurrency(latestDraw.cumulative)}`;
    doc.text(drawLine, 10, y);
    y += 5;

    // If more draws, show a compact summary table
    if (data.draws.length > 1) {
      autoTable(doc, {
        startY: y,
        head: [["Draw #", "Period", "Amount", "Cumulative", "Status"]],
        body: data.draws.map(d => [
          `#${d.draw_number}`,
          fmtDate(d.draw_month),
          fmtCurrency(d.total_amount),
          fmtCurrency(d.cumulative),
          d.status,
        ]),
        margin: { left: 10, right: 10 },
        headStyles: { fillColor: [...NAVY] as any, textColor: [255, 255, 255] as any, fontStyle: "bold", fontSize: 6.5, cellPadding: 1.2 },
        bodyStyles: { fontSize: 6.5, cellPadding: 1.2 },
        alternateRowStyles: { fillColor: [...LIGHT_GRAY] as any },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
      });
    }
  }

  // ════════════════════════════════════════════════
  // PAGE 2 — Capital Summary + Monthly Activity
  // ════════════════════════════════════════════════

  doc.addPage();
  drawHeader(doc, data.project.projectName, [], "Page 2 of 2");
  drawFooter(doc, generatedDate);

  y = 20;

  // ── Capital Summary ──
  y = sectionTitle(doc, "Capital Summary", y);

  const eqCommitted = (data.equitySources ?? []).reduce((s, e) => s + e.total_commitment, 0);
  const eqCalled = (data.equitySources ?? []).reduce((s, e) => s + e.equity_called, 0);
  const eqRemaining = eqCommitted - eqCalled;

  const debtCommitted = (data.debtTranches ?? []).reduce((s, d) => s + d.loan_amount, 0);
  // We don't have "drawn" for debt, show committed as full amount
  const debtDrawn = 0; // placeholder — could be computed if we had draw data per tranche
  const debtRemaining = debtCommitted - debtDrawn;

  const capBoxW = (w - 30) / 3;
  const capBoxH = 16;

  // Equity row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text("Equity", 10, y);
  y += 3;
  drawStatBox(doc, 10, y, capBoxW, capBoxH, "Committed", fmtCurrency(eqCommitted));
  drawStatBox(doc, 10 + capBoxW + 5, y, capBoxW, capBoxH, "Called", fmtCurrency(eqCalled));
  drawStatBox(doc, 10 + (capBoxW + 5) * 2, y, capBoxW, capBoxH, "Remaining", fmtCurrency(eqRemaining));
  y += capBoxH + 4;

  // Debt row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text("Debt", 10, y);
  y += 3;
  drawStatBox(doc, 10, y, capBoxW, capBoxH, "Committed", fmtCurrency(debtCommitted));
  drawStatBox(doc, 10 + capBoxW + 5, y, capBoxW, capBoxH, "Drawn", fmtCurrency(debtDrawn));
  drawStatBox(doc, 10 + (capBoxW + 5) * 2, y, capBoxW, capBoxH, "Remaining", fmtCurrency(debtRemaining));
  y += capBoxH + 6;

  // Equity detail table if sources exist
  if ((data.equitySources ?? []).length > 0) {
    const eqBody = data.equitySources!.map(e => [
      e.source_name || "—",
      e.equity_type,
      fmtCurrency(e.total_commitment),
      fmtCurrency(e.equity_called),
      fmtCurrency(e.total_commitment - e.equity_called),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Source", "Type", "Commitment", "Called", "Remaining"]],
      body: eqBody,
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: [...NAVY] as any, textColor: [255, 255, 255] as any, fontStyle: "bold", fontSize: 7, cellPadding: 1.2 },
      bodyStyles: { fontSize: 7, cellPadding: 1.2 },
      alternateRowStyles: { fillColor: [...LIGHT_GRAY] as any },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Debt detail table if tranches exist
  if ((data.debtTranches ?? []).length > 0) {
    const debtBody = data.debtTranches!.map(d => [
      d.lender_name || "—",
      d.loan_type,
      fmtCurrency(d.loan_amount),
      `${d.interest_rate}% ${d.rate_type}`,
      fmtDate(d.maturity_date),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Lender", "Type", "Amount", "Rate", "Maturity"]],
      body: debtBody,
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: [...NAVY] as any, textColor: [255, 255, 255] as any, fontStyle: "bold", fontSize: 7, cellPadding: 1.2 },
      bodyStyles: { fontSize: 7, cellPadding: 1.2 },
      alternateRowStyles: { fillColor: [...LIGHT_GRAY] as any },
      columnStyles: { 2: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Monthly Activity Summary ──
  y = sectionTitle(doc, "Monthly Activity Summary", y);

  const bullets = data.activityBullets ?? [];
  const dateRanges = data.activityDateRanges ?? [];

  if (bullets.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 160);
    doc.text("No weekly reports submitted for this period.", 10, y);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 60);

    for (const bullet of bullets) {
      if (y > 265) break; // safety
      const lines = doc.splitTextToSize(`•  ${bullet}`, w - 24);
      doc.text(lines, 12, y);
      y += lines.length * 3.5 + 1.5;
    }

    // Source date ranges
    if (dateRanges.length > 0) {
      y += 2;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 140);
      const rangeText = `Sources: ${dateRanges.join("; ")}`;
      const rangeLines = doc.splitTextToSize(rangeText, w - 20);
      doc.text(rangeLines, 10, y);
    }
  }

  return doc;
}
