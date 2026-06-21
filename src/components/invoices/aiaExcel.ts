// Deterministic parser for AIA G702/G703 pay applications delivered as .xlsx.
//
// The Detail tab is the single source of truth: the G703 "This Period" column is
// just =SUMIFS(Detail, Draw#, AIA Item) formulas, so we parse the Detail tab
// directly and group by AIA item. The 703 sheet is used only to map an AIA item
// number to its division description; the 702 sheet gives the application/draw
// number, contractor name, and period-to date.
//
// Detail tab columns:
//   A(0)=Vendor  B(1)=Invoice  C(2)=Draw #  D(3)=AIA Item  E(4)=Cost Type
//   F(5)=Cost    G(6)=Retainage  H(7)=Total  I(8)=Invoice Copy?  J(9)=Remarks
//   K(10)=Check/Wire #  L(11)=Date
//
// Formula cells (e.g. "=8711+9333", "=F58*0.1") are read via their cached
// computed value (SheetJS stores it in cell.v), not the formula string.

import * as XLSX from "xlsx";

export interface AIADetailRow {
  vendor: string;
  invoice: string;
  aia_item: string;
  cost_type: string;
  cost: number;
  retainage: number;
  total: number;
  check: string;
  date: string | null;
  remarks: string;
}

export interface AIAExcelLine {
  aia_item: string;    // normalized AIA number — used directly as the dropdown value
  description: string; // division name (from the 703 item→name lookup)
  amount: number;      // SUM of Detail Cost (Column F) for this division
  retainage: number;   // SUM of Detail Retainage (Column G) for this division
}

export interface AIAExcelResult {
  isAIA: boolean;
  source: "detail" | "703";          // how line items were derived
  vendor_name: string | null;
  invoice_number: string | null;     // = application/draw number
  invoice_date: string | null;       // YYYY-MM-DD
  application_number: string | null;
  line_items: AIAExcelLine[];
  detail_rows: AIADetailRow[];
  totals: { amount: number; retainage: number; net: number };
}

// A 703 row is a subtotal/total/section header (not a real line item). Matches
// conservatively so lines like "Construction Mgmt Fees 4% - GC" are kept.
const SECTION_TOTAL_LABELS = new Set([
  "HARD COSTS", "SOFT COSTS", "CONSTRUCTION HARD COSTS", "CONSTRUCTION SOFT COSTS",
]);
const isSubtotalRow = (desc: string): boolean => {
  const d = desc.toUpperCase().trim();
  if (d.includes("SUBTOTAL")) return true;
  if (d.startsWith("TOTAL")) return true;
  if (d.startsWith("GRAND TOTAL")) return true;
  return SECTION_TOTAL_LABELS.has(d);
};

// ── cell helpers ────────────────────────────────────────────────────────────
const cellText = (sheet: XLSX.WorkSheet, r: number, c: number): string => {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell == null) return "";
  return String(cell.w ?? cell.v ?? "").trim();
};

// Read a numeric value, using the cached computed value for formula cells.
const cellNum = (sheet: XLSX.WorkSheet, r: number, c: number): number => {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell == null) return 0;
  if (typeof cell.v === "number") return cell.v;
  const n = Number(String(cell.v ?? "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};

const isMeaningful = (s: string): boolean => {
  const t = s.trim();
  return t.length > 0 && !/^[:;.\-—\s]+$/.test(t);
};

// Compare draw numbers loosely: "04", "4", 4 all match.
const normDraw = (v: unknown): string => {
  const t = String(v ?? "").trim();
  return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t.toUpperCase();
};

// Normalize an AIA item to the 2-digit dropdown form: "1"→"01", "62"→"62",
// "HC"→"HC".
const normAia = (v: unknown): string => {
  const t = String(v ?? "").trim();
  if (!t) return "";
  return /^\d+$/.test(t) ? String(parseInt(t, 10)).padStart(2, "0") : t.toUpperCase();
};

const findSheet = (wb: XLSX.WorkBook, re: RegExp): XLSX.WorkSheet | null => {
  const name = wb.SheetNames.find((n) => re.test(n));
  return name ? wb.Sheets[name] : null;
};

// ── 702 labeled-field extraction ────────────────────────────────────────────
const findLabeledValue = (sheet: XLSX.WorkSheet, keywords: string[]): string | null => {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);

  // 1) Inline "Label: value" in a single cell.
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const raw = cellText(sheet, r, c);
      const lower = raw.toLowerCase();
      for (const k of keywords) {
        if (lower.includes(k) && raw.includes(":")) {
          const after = raw.split(":").slice(1).join(":").trim();
          if (isMeaningful(after)) return after;
        }
      }
    }
  }
  // 2) Value in a nearby cell — scan right then below, skipping punctuation-only
  //    cells (this is what previously returned a stray ":").
  for (const k of keywords) {
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (!cellText(sheet, r, c).toLowerCase().includes(k)) continue;
        for (let cc = c + 1; cc <= range.e.c; cc++) {
          const v = cellText(sheet, r, cc);
          if (isMeaningful(v)) return v;
        }
        for (let rr = r + 1; rr <= Math.min(r + 2, range.e.r); rr++) {
          const v = cellText(sheet, rr, c);
          if (isMeaningful(v)) return v;
        }
      }
    }
  }
  return null;
};

const findLabeledDate = (sheet: XLSX.WorkSheet, keywords: string[]): string | null => {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const toISO = (cell: XLSX.CellObject | undefined): string | null => {
    if (!cell) return null;
    if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
    if (typeof cell.v === "number") {
      const d = new Date(Math.round((cell.v - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = new Date(String(cell.w ?? cell.v ?? ""));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  for (const k of keywords) {
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (!cellText(sheet, r, c).toLowerCase().includes(k)) continue;
        for (let cc = c + 1; cc <= range.e.c; cc++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c: cc })];
          if (cell != null && isMeaningful(String(cell.w ?? cell.v ?? ""))) {
            const iso = toISO(cell);
            if (iso) return iso;
          }
        }
        for (let rr = r + 1; rr <= Math.min(r + 2, range.e.r); rr++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: rr, c })];
          if (cell != null && isMeaningful(String(cell.w ?? cell.v ?? ""))) {
            const iso = toISO(cell);
            if (iso) return iso;
          }
        }
      }
    }
  }
  return null;
};

// ── main ────────────────────────────────────────────────────────────────────
export function parseAIAExcel(buf: ArrayBuffer): AIAExcelResult {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });

  const detail = findSheet(wb, /detail/i);
  const sheet703 = wb.Sheets["703"] ?? findSheet(wb, /^g?703/i);
  const sheet702 = wb.Sheets["702"] ?? findSheet(wb, /^g?702/i);

  const empty: AIAExcelResult = {
    isAIA: false, source: "detail", vendor_name: null, invoice_number: null, invoice_date: null,
    application_number: null, line_items: [], detail_rows: [],
    totals: { amount: 0, retainage: 0, net: 0 },
  };
  // Need either a Detail tab (preferred source of truth) or a 703 (fallback).
  if (!detail && !sheet703) return empty;

  // 702 header fields.
  const vendor_name = sheet702 ? findLabeledValue(sheet702, ["from contractor", "contractor"]) : null;
  const appRaw = sheet702
    ? findLabeledValue(sheet702, ["application no", "application number", "application #", "application"])
    : null;
  const application_number = appRaw ? appRaw.trim() : null;
  const invoice_date = sheet702 ? findLabeledDate(sheet702, ["period to"]) : null;

  // 703 item-number → division-name lookup.
  const itemNames = new Map<string, string>();
  if (sheet703) {
    const ref = sheet703["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let r = range.s.r; r <= range.e.r; r++) {
        const item = normAia(cellText(sheet703, r, 0)); // Column A
        const name = cellText(sheet703, r, 1);          // Column B
        if (item && name && /\d/.test(item) || (item && name && item === "HC")) {
          if (!itemNames.has(item)) itemNames.set(item, name);
        }
      }
    }
  }

  // Walk the Detail tab, keep rows for the current draw, group by AIA item.
  const line_items: AIAExcelLine[] = [];
  const detail_rows: AIADetailRow[] = [];
  let source: "detail" | "703" = "detail";

  if (detail) {
   const drawTarget = normDraw(application_number ?? "");
   const groups = new Map<string, { amount: number; retainage: number }>();

   const ref = detail["!ref"];
   if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const drawCell = normDraw(cellText(detail, r, 2)); // Column C
      // Skip header rows and rows for other draws. If we couldn't read an
      // application number, fall back to including every numeric-draw row.
      if (drawTarget) {
        if (drawCell !== drawTarget) continue;
      } else if (!/^\d+$/.test(drawCell)) {
        continue;
      }
      const aia = normAia(cellText(detail, r, 3)); // Column D
      if (!aia) continue;
      const cost = cellNum(detail, r, 5);      // Column F
      const retainage = cellNum(detail, r, 6); // Column G

      const g = groups.get(aia) ?? { amount: 0, retainage: 0 };
      g.amount += cost;
      g.retainage += retainage;
      groups.set(aia, g);

      detail_rows.push({
        vendor: cellText(detail, r, 0),
        invoice: cellText(detail, r, 1),
        aia_item: aia,
        cost_type: cellText(detail, r, 4),
        cost,
        retainage,
        total: cellNum(detail, r, 7),
        check: cellText(detail, r, 10),
        date: (() => {
          const cell = detail[XLSX.utils.encode_cell({ r, c: 11 })];
          if (cell?.v instanceof Date) return cell.v.toISOString().slice(0, 10);
          const t = cellText(detail, r, 11);
          return t || null;
        })(),
        remarks: cellText(detail, r, 9),
      });
    }
   }

   for (const [aia, g] of groups) {
     if (!g.amount) continue; // non-zero divisions only
     line_items.push({
       aia_item: aia,
       description: itemNames.get(aia) ?? "",
       amount: g.amount,
       retainage: g.retainage,
     });
   }
  } else if (sheet703) {
    // Fallback: no Detail tab — read the G703 summary directly.
    //   Column A(0)=AIA item  B(1)=description  G(6)=This Period  L(11)=retainage
    source = "703";
    const ref = sheet703["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      // Line items start at row 11 (index 10).
      for (let r = 10; r <= range.e.r; r++) {
        const desc = cellText(sheet703, r, 1); // Column B
        if (!desc || isSubtotalRow(desc)) continue;
        const amount = cellNum(sheet703, r, 6); // Column G — This Period
        if (!amount) continue;                  // non-zero only
        line_items.push({
          aia_item: normAia(cellText(sheet703, r, 0)), // Column A
          description: desc,
          amount,
          retainage: cellNum(sheet703, r, 11),  // Column L
        });
      }
    }
  }

  // Order by AIA number ascending for a clean table.
  line_items.sort((a, b) => {
    const na = parseInt(a.aia_item, 10);
    const nb = parseInt(b.aia_item, 10);
    if (isNaN(na) && isNaN(nb)) return a.aia_item.localeCompare(b.aia_item);
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });

  const totalAmount = line_items.reduce((s, l) => s + l.amount, 0);
  const totalRetainage = line_items.reduce((s, l) => s + l.retainage, 0);

  return {
    isAIA: true,
    source,
    vendor_name: vendor_name && isMeaningful(vendor_name) ? vendor_name : null,
    invoice_number: application_number,
    invoice_date,
    application_number,
    line_items,
    detail_rows,
    totals: { amount: totalAmount, retainage: totalRetainage, net: totalAmount - totalRetainage },
  };
}
