// Deterministic parser for AIA G702/G703 pay applications delivered as .xlsx.
//
// When the GC provides the AIA as Excel we can read the exact cells instead of
// relying on AI vision over a PDF. The workbook has sheets named '702' and '703'.
//
// G703 line items start at row 11 and run through the hard- and soft-cost
// sections. We read:
//   Column B (index 1)  = description
//   Column G (index 6)  = THIS PERIOD amount  <-- the amount billed in this draw
//   Column L (index 11) = retainage for that line
// We deliberately ignore Column C (Scheduled Value), F (From Previous), and
// I (Total Completed). Subtotal / section-header rows are skipped, and only
// rows with a non-zero numeric Column G are kept.

import * as XLSX from "xlsx";

export interface AIAExcelLine {
  description: string;
  amount: number;
  retainage: number;
}

export interface AIAExcelResult {
  isAIA: boolean;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  line_items: AIAExcelLine[];
}

const cellText = (sheet: XLSX.WorkSheet, r: number, c: number): string => {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell == null) return "";
  return String(cell.w ?? cell.v ?? "").trim();
};

const cellNum = (sheet: XLSX.WorkSheet, r: number, c: number): number => {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell == null) return NaN;
  if (typeof cell.v === "number") return cell.v;
  // Strip currency symbols / commas from text values.
  const n = Number(String(cell.v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? NaN : n;
};

// A row is a subtotal / section header (not a real line item) when its
// description matches these markers. Careful: "Construction Mgmt Fees" is a
// real line and must NOT be treated as the "Construction" subtotal.
const isSubtotalRow = (desc: string): boolean => {
  const d = desc.toLowerCase();
  if (d.includes("subtotal")) return true;
  if (d.includes("hard cost")) return true;
  if (d.includes("soft cost")) return true;
  if (
    d.includes("construction") &&
    !d.includes("mgmt") &&
    !d.includes("management") &&
    !d.includes("fee")
  ) {
    return true;
  }
  return false;
};

// Find a labeled value on the 702 sheet: locate a cell containing one of the
// keywords, then return the value after a colon, to its right, or below it.
const findLabeledCell = (
  sheet: XLSX.WorkSheet,
  keyword: string,
): XLSX.CellObject | null => {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const t = cellText(sheet, r, c).toLowerCase();
      if (t && t.includes(keyword)) {
        for (let cc = c + 1; cc <= range.e.c; cc++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c: cc })];
          if (cell != null && String(cell.w ?? cell.v ?? "").trim()) return cell;
        }
        for (let rr = r + 1; rr <= Math.min(r + 2, range.e.r); rr++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: rr, c })];
          if (cell != null && String(cell.w ?? cell.v ?? "").trim()) return cell;
        }
      }
    }
  }
  return null;
};

const findLabeled = (sheet: XLSX.WorkSheet, keywords: string[]): string | null => {
  // Inline "Label: value" within a single cell takes priority.
  const ref = sheet["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const raw = cellText(sheet, r, c);
        const lower = raw.toLowerCase();
        for (const k of keywords) {
          if (lower.includes(k) && raw.includes(":")) {
            const after = raw.split(":").slice(1).join(":").trim();
            if (after) return after;
          }
        }
      }
    }
  }
  for (const k of keywords) {
    const cell = findLabeledCell(sheet, k);
    if (cell != null) return String(cell.w ?? cell.v ?? "").trim();
  }
  return null;
};

const toISODate = (sheet: XLSX.WorkSheet, keywords: string[]): string | null => {
  for (const k of keywords) {
    const cell = findLabeledCell(sheet, k);
    if (!cell) continue;
    if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
    if (typeof cell.v === "number") {
      // Excel serial date → JS date.
      const ms = Math.round((cell.v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const d = new Date(String(cell.w ?? cell.v));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
};

export function parseAIAExcel(buf: ArrayBuffer): AIAExcelResult {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const names = wb.SheetNames;
  const sheet703 = wb.Sheets["703"];
  const sheet702 = wb.Sheets["702"];

  const empty: AIAExcelResult = {
    isAIA: false, vendor_name: null, invoice_number: null, invoice_date: null, line_items: [],
  };
  // An AIA workbook is identified by having a 703 (and typically a 702) sheet.
  if (!sheet703 || !names.includes("703")) return empty;

  const line_items: AIAExcelLine[] = [];
  const ref = sheet703["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    // Row 11 in spreadsheet terms is index 10 (0-based).
    for (let r = 10; r <= range.e.r; r++) {
      const desc = cellText(sheet703, r, 1); // Column B
      if (!desc) continue;
      if (isSubtotalRow(desc)) continue;
      const amount = cellNum(sheet703, r, 6); // Column G — THIS PERIOD
      if (!amount || isNaN(amount)) continue; // non-zero numbers only
      const retRaw = cellNum(sheet703, r, 11); // Column L — retainage
      line_items.push({
        description: desc,
        amount,
        retainage: isNaN(retRaw) ? 0 : retRaw,
      });
    }
  }

  let vendor_name: string | null = null;
  let invoice_number: string | null = null;
  let invoice_date: string | null = null;
  if (sheet702) {
    vendor_name = findLabeled(sheet702, ["from contractor", "contractor"]);
    invoice_number = findLabeled(sheet702, ["application no", "application number", "application #"]);
    invoice_date = toISODate(sheet702, ["period to"]);
  }

  return {
    isAIA: true,
    vendor_name,
    invoice_number,
    invoice_date,
    line_items,
  };
}
