import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { BudgetRow, BudgetTransaction, fmtDecimal } from "./types";

interface ExportParams {
  projectName: string;
  projectInfo?: {
    owner_name?: string | null;
    general_contractor?: string | null;
    architect?: string | null;
    street_address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    property_name?: string | null;
  } | null;
  budgetRows: BudgetRow[];
  transactions: BudgetTransaction[];
  periodStart: Date;
  periodEnd: Date;
  materialsStored: Record<string, number>;
}

const fmtCur = (v: number) => {
  if (v === 0) return "$-";
  if (v < 0) return `$(${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function exportBudgetPDF({
  projectName,
  projectInfo,
  budgetRows,
  transactions,
  periodStart,
  periodEnd,
  materialsStored,
}: ExportParams) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 36; // margin
  const rEdge = pageW - m;
  const cW = rEdge - m; // content width
  const info = projectInfo || {};
  const periodTo = format(periodEnd, "M/d/yyyy");

  const address = [info.street_address, info.city, info.state, info.zip_code].filter(Boolean).join(", ");

  // ── Calculations ──
  const approvedTxns = transactions.filter((t) => t.status === "Approved" || t.status === "Paid");
  const changeOrders = transactions.filter((t) => t.transaction_type === "Change Order");
  const originalContractSum = budgetRows.reduce((s, r) => s + Number(r.scheduled_value), 0);
  const netChangeOrders = changeOrders
    .filter((t) => t.status === "Approved" || t.status === "Paid")
    .reduce((s, t) => s + Number(t.amount), 0);
  const contractSumToDate = originalContractSum + netChangeOrders;
  const totalMaterials = Object.values(materialsStored).reduce((s, v) => s + v, 0);
  const totalPreviousCompleted = approvedTxns
    .filter((t) => new Date(t.date) < periodStart)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalThisPeriod = approvedTxns
    .filter((t) => { const d = new Date(t.date); return d >= periodStart && d <= periodEnd; })
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalCompletedStored = totalPreviousCompleted + totalThisPeriod + totalMaterials;
  const totalRetainage = approvedTxns.reduce((s, t) => s + Number(t.retainage_amount), 0);
  const totalEarnedLessRetainage = totalCompletedStored - totalRetainage;
  const currentPaymentDue = totalCompletedStored - totalRetainage - totalPreviousCompleted;
  const balanceToFinish = contractSumToDate - totalEarnedLessRetainage;

  // ── Helpers ──
  const drawLine = (x1: number, y1: number, x2: number, y2: number, w = 0.5) => {
    doc.setLineWidth(w);
    doc.setDrawColor(0);
    doc.line(x1, y1, x2, y2);
  };

  const txt = (text: string, x: number, y: number, opts?: { align?: "left" | "right" | "center"; bold?: boolean; size?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size || 7.5);
    doc.setTextColor(0);
    doc.text(text, x, y, { align: opts?.align || "left" });
  };

  // ═══════════════════════════════════════
  // PAGE 1: G702
  // ═══════════════════════════════════════
  let y = m;

  // Title
  txt("Application and Certificate for Payment", m, y, { bold: true, size: 12 });
  y += 4;
  drawLine(m, y, rEdge, y, 1.5);
  y += 12;

  // ── Header Grid (two panels) ──
  const midX = m + cW * 0.55;
  const rightPanel = m + cW * 0.62;
  const lh = 11; // line height

  // Left panel
  txt("OWNER:", m, y, { bold: true, size: 7 });
  txt(info.owner_name || "—", m + 50, y, { size: 8 });
  txt("PROJECT:", midX, y, { bold: true, size: 7 });
  txt(projectName, midX + 55, y, { size: 8 });
  y += lh;
  txt(info.street_address || "", m + 50, y, { size: 7 });
  txt(address || "", midX + 55, y, { size: 7 });
  y += lh;

  // APPLICATION NO / PERIOD TO on right
  txt("APPLICATION NO:", rightPanel, y, { bold: true, size: 7 });
  txt("1", rightPanel + 85, y, { size: 8 });
  y += lh;
  txt("PERIOD TO:", rightPanel, y, { bold: true, size: 7 });
  txt(periodTo, rightPanel + 60, y, { size: 8 });
  y += lh;

  txt("CONTRACTOR:", m, y, { bold: true, size: 7 });
  txt(info.general_contractor || "TBD", m + 75, y, { size: 8 });
  txt("VIA ARCHITECT:", midX, y, { bold: true, size: 7 });
  txt(info.architect || "", midX + 80, y, { size: 8 });
  y += lh;
  txt("CONTRACT FOR:", rightPanel, y, { bold: true, size: 7 });
  txt(info.property_name || projectName, rightPanel + 80, y, { size: 7 });
  y += lh * 2;

  drawLine(m, y, rEdge, y, 0.75);
  y += 10;

  // ── CONTRACTOR'S APPLICATION FOR PAYMENT ──
  txt("CONTRACTOR'S APPLICATION FOR PAYMENT", m, y, { bold: true, size: 9 });
  y += lh;
  txt("Application is made for payment, as shown below, in connection with the Contract.", m, y, { size: 7 });
  y += lh;
  txt("Continuation Sheet, AIA Document G703, is attached.", m, y, { size: 7 });
  y += 14;

  // Line items
  const valCol = m + cW * 0.5;
  const certCol = m + cW * 0.62;
  const lineH = 14;

  const drawLineItem = (num: string, label: string, value: string, certLabel?: string) => {
    txt(num, m, y, { bold: true, size: 8 });
    txt(label, m + (num ? 14 : 20), y, { size: 7.5 });
    if (value) txt(value, valCol, y, { align: "right", size: 8, bold: true });
    if (certLabel) txt(certLabel, certCol, y, { size: 7 });
    y += lineH;
  };

  drawLineItem("1.", "ORIGINAL CONTRACT SUM", fmtCur(originalContractSum));
  drawLineItem("2.", "NET CHANGE BY CHANGE ORDERS", fmtCur(netChangeOrders), "CONTRACTOR:");
  drawLineItem("3.", "CONTRACT SUM TO DATE (Line 1+2)", fmtCur(contractSumToDate), "By: ___________________  Date: ________");
  drawLineItem("4.", "TOTAL COMPLETED & STORED TO DATE (Column G on G703)", fmtCur(totalCompletedStored), "State of: ___________________");
  drawLineItem("5.", "RETAINAGE", "", "County of: ___________________");
  drawLineItem("", "a. ___% of Completed Work (Column D + E on G703)", "", "Subscribed and sworn to before");
  drawLineItem("", "b. ___% of Stored Material (Column F on G703) = " + fmtCur(0), "", "me this _____ day of _________, 20____");
  drawLineItem("", "Total Retainage (Lines 5a + 5b)", fmtCur(totalRetainage));
  y += 2;
  txt("Notary Public: ___________________", certCol, y, { size: 7 });
  y += lineH;
  txt("My Commission Expires: ___________________", certCol, y, { size: 7 });
  y += 4;
  txt("ARCHITECT'S CERTIFICATE FOR PAYMENT", certCol, y + lineH, { bold: true, size: 7 });
  drawLineItem("6.", "TOTAL EARNED LESS RETAINAGE", fmtCur(totalEarnedLessRetainage));
  drawLineItem("", "(Line 4 Less Line 5 Total)", "");
  drawLineItem("7.", "LESS PREVIOUS CERTIFICATES FOR PAYMENT", fmtCur(totalPreviousCompleted));
  drawLineItem("", "(Line 6 from prior Certificate)", "");
  drawLineItem("8.", "CURRENT PAYMENT DUE", fmtCur(currentPaymentDue));
  drawLineItem("9.", "BALANCE TO FINISH, INCLUDING RETAINAGE", "");
  txt("(Line 3 less Line 6)", m + 20, y, { size: 7 });
  txt(fmtCur(balanceToFinish), valCol, y, { align: "right", size: 8, bold: true });
  txt("AMOUNT CERTIFIED", certCol, y, { bold: true, size: 7 });
  txt(fmtCur(0), rEdge, y, { align: "right", size: 8 });
  y += lineH * 2;

  drawLine(m, y, rEdge, y, 0.5);
  y += 10;

  // ── CHANGE ORDER SUMMARY ──
  txt("CHANGE ORDER SUMMARY", m, y, { bold: true, size: 8 });
  txt("ADDITIONS", m + cW * 0.42, y, { bold: true, size: 7 });
  txt("DEDUCTIONS", m + cW * 0.55, y, { bold: true, size: 7 });
  txt("ARCHITECT:", certCol, y, { bold: true, size: 7 });
  y += lineH;
  txt("Total changes approved in previous months by Owner", m, y, { size: 7 });
  txt("By: ___________________  Date: ________", certCol, y, { size: 7 });
  y += lineH;
  txt("Total approved this Month", m, y, { size: 7 });
  y += lineH;
  txt("TOTALS", m, y, { bold: true, size: 7 });
  txt(fmtCur(netChangeOrders > 0 ? netChangeOrders : 0), m + cW * 0.48, y, { align: "right", size: 7 });
  txt(fmtCur(netChangeOrders < 0 ? Math.abs(netChangeOrders) : 0), m + cW * 0.6, y, { align: "right", size: 7 });

  // Footer
  doc.setFontSize(6);
  doc.setTextColor(150);
  doc.text(`Generated ${format(new Date(), "MM/dd/yyyy")}`, m, pageH - 20);
  doc.text(projectName, rEdge, pageH - 20, { align: "right" });

  // ═══════════════════════════════════════
  // PAGE 2: G703 — Continuation Sheet
  // ═══════════════════════════════════════
  doc.addPage("letter", "landscape");
  const lW = doc.internal.pageSize.getWidth();
  const lH = doc.internal.pageSize.getHeight();
  const lM = 30;

  y = lM;
  txt("Continuation Sheet", lM, y, { bold: true, size: 12 });
  txt("AIA DOCUMENT G703", lW - lM, y, { align: "right", size: 8 });
  y += 4;
  drawLine(lM, y, lW - lM, y, 1.5);
  y += 14;

  // Header info
  txt("APPLICATION NO: 1", lM + 420, y, { size: 7 });
  y += lh;
  txt("APPLICATION DATE:", lM + 420, y, { size: 7 });
  y += lh;
  txt(`PERIOD TO: ${periodTo}`, lM + 420, y, { size: 7 });
  y += lh;
  txt("ARCHITECT'S PROJECT NO:", lM + 420, y, { size: 7 });
  y += 10;

  // SOV Table
  const buildRow = (div: BudgetRow) => {
    const dTxns = approvedTxns.filter((t) => t.division_number === div.division_number);
    const prev = dTxns.filter((t) => new Date(t.date) < periodStart).reduce((s, t) => s + Number(t.amount), 0);
    const tp = dTxns.filter((t) => { const d = new Date(t.date); return d >= periodStart && d <= periodEnd; }).reduce((s, t) => s + Number(t.amount), 0);
    const mat = materialsStored[div.division_number] ?? 0;
    const sched = Number(div.scheduled_value);
    const tc = prev + tp + mat;
    const pct = sched > 0 ? `${((tc / sched) * 100).toFixed(2)}%` : "0.00%";
    const bal = sched - tc;
    const ret = dTxns.reduce((s, t) => s + Number(t.retainage_amount), 0);
    return [div.division_number, div.division_name, fmtCur(sched), fmtCur(prev), fmtCur(tp), mat ? fmtCur(mat) : "", fmtCur(tc), pct, fmtCur(bal), fmtCur(ret)];
  };

  const sumDivs = (divs: BudgetRow[]) => {
    let sS = 0, sP = 0, sT = 0, sM = 0, sC = 0, sB = 0, sR = 0;
    divs.forEach((div) => {
      const dTxns = approvedTxns.filter((t) => t.division_number === div.division_number);
      const p = dTxns.filter((t) => new Date(t.date) < periodStart).reduce((s, t) => s + Number(t.amount), 0);
      const tp = dTxns.filter((t) => { const d = new Date(t.date); return d >= periodStart && d <= periodEnd; }).reduce((s, t) => s + Number(t.amount), 0);
      const mat = materialsStored[div.division_number] ?? 0;
      const s = Number(div.scheduled_value);
      sS += s; sP += p; sT += tp; sM += mat; sC += p + tp + mat; sB += s - (p + tp + mat);
      sR += dTxns.reduce((ss, t) => ss + Number(t.retainage_amount), 0);
    });
    const pct = sS > 0 ? `${((sC / sS) * 100).toFixed(2)}%` : "0.00%";
    return { row: ["", "", fmtCur(sS), fmtCur(sP), fmtCur(sT), fmtCur(sM), fmtCur(sC), pct, fmtCur(sB), fmtCur(sR)], sS, sC };
  };

  const hardDivs = budgetRows.filter((r) => r.cost_type === "hard");
  const softDivs = budgetRows.filter((r) => r.cost_type === "soft");
  const body: string[][] = [];

  // Hard costs
  body.push(["", "CONSTRUCTION HARD COSTS", "", "", "", "", "", "", "", ""]);
  body.push(["", "", "", "", "", "", "", "", "", ""]);
  hardDivs.forEach((d) => body.push(buildRow(d)));
  body.push(["", "", "", "", "", "", "", "", "", ""]);
  const hSub = sumDivs(hardDivs);
  hSub.row[1] = "HARD COSTS SUBTOTAL";
  body.push(hSub.row);
  body.push(["", "", "", "", "", "", "", "", "", ""]);

  // Soft costs
  body.push(["", "CONSTRUCTION SOFT COSTS", "", "", "", "", "", "", "", ""]);
  softDivs.forEach((d) => body.push(buildRow(d)));
  body.push(["", "", "", "", "", "", "", "", "", ""]);
  const sSub = sumDivs(softDivs);
  sSub.row[1] = "SOFT COSTS SUBTOTAL";
  body.push(sSub.row);
  body.push(["", "", "", "", "", "", "", "", "", ""]);

  // Grand total
  const allSub = sumDivs(budgetRows);
  allSub.row[1] = "TOTAL COSTS";
  body.push(allSub.row);

  autoTable(doc, {
    startY: y,
    head: [[
      "A\nITEM\nNO.",
      "B\nDESCRIPTION OF WORK",
      "C\nSCHEDULED\nVALUE",
      "D\nWORK COMPLETED\nFROM PREVIOUS\nAPPLICATION (D+E)",
      "E\nTHIS\nPERIOD",
      "F\nMATERIALS\nPRESENTLY STORED\n(NOT IN D OR E)",
      "G\nTOTAL COMPLETED\nAND STORED TO\nDATE (D+E+F)",
      "H\n%\n(G÷C)",
      "I\nBALANCE\nTO FINISH\n(C-G)",
      "J\nRETAINAGE\n(IF VARIABLE\nRATE)",
    ]],
    body,
    theme: "grid",
    margin: { left: lM, right: lM },
    styles: { fontSize: 6.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] },
    headStyles: {
      fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold",
      fontSize: 5.5, halign: "center", valign: "bottom", lineColor: [0, 0, 0], lineWidth: 0.75,
    },
    columnStyles: {
      0: { cellWidth: 35, halign: "center" },
      1: { cellWidth: 155 },
      2: { halign: "right", cellWidth: 72 },
      3: { halign: "right", cellWidth: 72 },
      4: { halign: "right", cellWidth: 60 },
      5: { halign: "right", cellWidth: 72 },
      6: { halign: "right", cellWidth: 78 },
      7: { halign: "center", cellWidth: 38 },
      8: { halign: "right", cellWidth: 72 },
      9: { halign: "right", cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const rowArr = data.row.raw as string[] | undefined;
      if (!rowArr) return;
      const desc = rowArr[1];
      if (desc === "CONSTRUCTION HARD COSTS" || desc === "CONSTRUCTION SOFT COSTS") {
        data.cell.styles.fontStyle = "bold";
      }
      if (desc === "HARD COSTS SUBTOTAL" || desc === "SOFT COSTS SUBTOTAL" || desc === "TOTAL COSTS") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = desc === "TOTAL COSTS" ? [220, 220, 220] : [240, 240, 240];
      }
    },
  });

  // Footer
  doc.setFontSize(6);
  doc.setTextColor(150);
  doc.text(`Generated ${format(new Date(), "MM/dd/yyyy")}`, lM, lH - 16);
  doc.text(projectName, lW - lM, lH - 16, { align: "right" });

  // ═══════════════════════════════════════
  // PAGE 3: Detail
  // ═══════════════════════════════════════
  const periodTxns = transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= periodStart && d <= periodEnd;
  });

  if (periodTxns.length > 0) {
    doc.addPage("letter", "landscape");
    y = lM;
    txt("Detail", lM, y, { bold: true, size: 12 });
    y += 4;
    drawLine(lM, y, lW - lM, y, 1.5);
    y += 14;

    const detailBody = periodTxns.map((t) => [
      t.payee, String(t.transaction_number), t.date, "",
      t.division_number, t.description,
      fmtCur(Number(t.amount)), fmtCur(Number(t.retainage_amount)),
      fmtCur(Number(t.net_amount)), t.status, t.notes || "",
    ]);

    // Totals
    const tAmt = periodTxns.reduce((s, t) => s + Number(t.amount), 0);
    const tRet = periodTxns.reduce((s, t) => s + Number(t.retainage_amount), 0);
    const tNet = periodTxns.reduce((s, t) => s + Number(t.net_amount), 0);
    detailBody.push(["", "", "", "", "", "TOTAL", fmtCur(tAmt), fmtCur(tRet), fmtCur(tNet), "", ""]);

    autoTable(doc, {
      startY: y,
      head: [["Vendor", "Invoice", "Invoice Date", "Draw #", "AIA Item", "Cost Type", "Cost", "Retainage", "Total", "Status", "Comments"]],
      body: detailBody,
      theme: "grid",
      margin: { left: lM, right: lM },
      styles: { fontSize: 7, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 7, lineColor: [0, 0, 0], lineWidth: 0.75 },
      columnStyles: {
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
      },
    });

    doc.setFontSize(6);
    doc.setTextColor(150);
    doc.text(`Generated ${format(new Date(), "MM/dd/yyyy")}`, lM, lH - 16);
    doc.text(projectName, lW - lM, lH - 16, { align: "right" });
  }

  doc.save(`${projectName.replace(/\s+/g, "_")}_G702_G703.pdf`);
}
