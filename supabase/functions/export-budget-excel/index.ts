import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Helpers ── */
const fmtDate = (d: Date) =>
  `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

const fmtCur = (v: number) => {
  if (v === 0) return "$-";
  if (v < 0) return `$(${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

const setCurrency = (ws: any, r: number, c: number) => {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (cell && typeof cell.v === "number") cell.z = '$#,##0.00';
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { projectId, periodStart, periodEnd, materialsStored } = await req.json();

    if (!projectId || !periodStart || !periodEnd) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pStart = new Date(periodStart);
    const pEnd = new Date(periodEnd);

    const [projectRes, infoRes, budgetRes, txnRes] = await Promise.all([
      supabase.from("projects").select("name, hotel_name").eq("id", projectId).single(),
      supabase.from("project_info").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("project_budget").select("*").eq("project_id", projectId).order("division_number"),
      supabase.from("budget_transactions").select("*").eq("project_id", projectId).order("date"),
    ]);

    const project = projectRes.data;
    const info = infoRes.data;
    const budgetRows = budgetRes.data ?? [];
    const transactions = txnRes.data ?? [];

    if (!project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const materials: Record<string, number> = materialsStored ?? {};
    const approvedTxns = transactions.filter(
      (t: any) => t.status === "Approved" || t.status === "Paid"
    );
    const changeOrders = transactions.filter(
      (t: any) => t.transaction_type === "Change Order"
    );

    const originalContractSum = budgetRows.reduce((s: number, r: any) => s + Number(r.scheduled_value), 0);
    const approvedCOs = changeOrders.filter((t: any) => t.status === "Approved" || t.status === "Paid");
    const netChangeOrders = approvedCOs.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const contractSumToDate = originalContractSum + netChangeOrders;
    const totalMaterials = Object.values(materials).reduce((s: number, v: number) => s + v, 0);
    const totalPreviousCompleted = approvedTxns
      .filter((t: any) => new Date(t.date) < pStart)
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalThisPeriod = approvedTxns
      .filter((t: any) => { const d = new Date(t.date); return d >= pStart && d <= pEnd; })
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalCompletedStored = totalPreviousCompleted + totalThisPeriod + totalMaterials;
    const totalRetainage = approvedTxns.reduce((s: number, t: any) => s + Number(t.retainage_amount), 0);
    const totalEarnedLessRetainage = totalCompletedStored - totalRetainage;
    const currentPaymentDue = totalCompletedStored - totalRetainage - totalPreviousCompleted;
    const balanceToFinish = contractSumToDate - totalEarnedLessRetainage;

    const address = [info?.street_address, info?.city, info?.state, info?.zip_code].filter(Boolean).join(", ");
    const ownerAddress = [info?.city, info?.state, info?.zip_code].filter(Boolean).join(", ");

    // ═══════════════════════════════════════════════
    // SHEET 1: G702 — Application and Certificate for Payment
    // ═══════════════════════════════════════════════
    // Columns: A(0)..AD(29) — wide layout to allow two-panel design
    const R: any[][] = [];
    const e = (arr: any[]) => { R.push(arr); return R.length - 1; };

    // Row 0: Title
    e(["Application and Certificate for Payment", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    // Row 1: blank
    e([]);
    // Row 2: OWNER / PROJECT / APPLICATION NO / Distribution
    //         A           B   C   D          E-H         I  J   K-R                S-T   U-AB
    e(["OWNER:", "", "", info?.owner_name || "—", "", "", "", "", "PROJECT:", "", project.name, "", "", "", "", "", "", "",
      "APPLICATION NO:", "", "", "", "", "", "", "", "", "", "Distribution to:", ""]);
    // Row 3: address lines
    e(["", "", "", info?.street_address || "", "", "", "", "", "", "", address || "", "", "", "", "", "", "", "",
      "", "", "", "", "", "", "", "", "", "", "OWNER", ":"]);
    // Row 4
    e(["", "", "", ownerAddress || "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      "PERIOD TO:", "", fmtDate(pEnd), "", "", "", "", "", "", "", "ARCHITECT", ":"]);
    // Row 5
    e(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      "CONTRACT FOR:", "", project.hotel_name, "", "", "", "", "", "", "", "CONTRACTOR", ":"]);
    // Row 6: CONTRACTOR / VIA ARCHITECT
    e(["CONTRACTOR:", "", "", info?.general_contractor || "TBD", "", "", "", "", "VIA ARCHITECT:", "", info?.architect || "", "", "", "", "", "", "", "",
      "CONTRACT DATE:", "", "", "", "", "", "", "", "", "", "FIELD", ":"]);
    // Row 7
    e(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      "PROJECT NOS:", "", "", "", "", "", "", "", "", "", "Bank", ":"]);
    // Row 8: blank
    e([]);
    // Row 9: blank
    e([]);
    // Row 10: Section header
    e(["CONTRACTOR'S APPLICATION FOR PAYMENT"]);
    // Row 11
    e(["Application is made for payment, as shown below, in connection with the Contract."]);
    // Row 12
    e(["Continuation Sheet, AIA Document G703, is attached."]);
    // Row 13: Line 1
    e(["1. ORIGINAL CONTRACT SUM", "", "", "", "", "", "", "", fmtCur(originalContractSum)]);
    // Row 14: Line 2
    e(["2. NET CHANGE BY CHANGE ORDERS", "", "", "", "", "", "", "", fmtCur(netChangeOrders),
      "", "", "", "", "", "CONTRACTOR:"]);
    // Row 15: Line 3
    e(["3. CONTRACT SUM TO DATE (Line 1+2)", "", "", "", "", "", "", "", fmtCur(contractSumToDate),
      "", "", "", "", "", "By:", "", "", "", "", "Date:"]);
    // Row 16: Line 4
    e(["4. TOTAL COMPLETED & STORED TO DATE (Column G on G703)", "", "", "", "", "", "", "", fmtCur(totalCompletedStored),
      "", "", "", "", "", "State of:"]);
    // Row 17: Line 5
    e(["5. RETAINAGE", "", "", "", "", "", "", "", "",
      "", "", "", "", "", "County of:"]);
    // Row 18: 5a
    e(["", "a.", "", "% of Completed Work", "", "", "", "", "",
      "", "", "", "", "", "Subscribed and sworn to before"]);
    // Row 19: 5a detail
    e(["", "", "(Column D + E on G703:", "", "", ")", "=", "", "",
      "", "", "", "", "", "me this _____ day of ______________, 20____"]);
    // Row 20: 5b
    e(["", "b.", "", "% of Stored Material"]);
    // Row 21: 5b detail
    e(["", "", "(Column F on G703:", "", "", ")", "=", fmtCur(0)]);
    // Row 22: Total Retainage
    e(["Total Retainage (Lines 5a + 5b or Total in Column I of G703)", "", "", "", "", "", "", "", fmtCur(totalRetainage),
      "", "", "", "", "", "Notary Public:"]);
    // Row 23
    e(["", "", "", "", "", "", "", "", "",
      "", "", "", "", "", "My Commission Expires:"]);
    // Row 24: blank
    e(["", "", "", "", "", "", "", "", "",
      "", "", "", "", "", "ARCHITECT'S CERTIFICATE FOR PAYMENT"]);
    // Row 25: Line 6
    e(["6. TOTAL EARNED LESS RETAINAGE", "", "", "", "", "", "", "", fmtCur(totalEarnedLessRetainage)]);
    // Row 26: sub-label
    e(["", "", "(Line 4 Less Line 5 Total)"]);
    // Row 27: Line 7
    e(["7. LESS PREVIOUS CERTIFICATES FOR PAYMENT", "", "", "", "", "", "", "", fmtCur(totalPreviousCompleted)]);
    // Row 28: sub-label
    e(["", "", "(Line 6 from prior Certificate)"]);
    // Row 29: Line 8
    e(["8. CURRENT PAYMENT DUE", "", "", "", "", "", "", "", fmtCur(currentPaymentDue)]);
    // Row 30: Line 9
    e(["9. BALANCE TO FINISH, INCLUDING RETAINAGE"]);
    // Row 31: sub-label + value
    e(["", "", "(Line 3 less Line 6)", "", "", "", "", fmtCur(balanceToFinish), "",
      "", "", "", "", "", "", "AMOUNT CERTIFIED", "", "", "", "", fmtCur(0)]);
    // Row 32: blank
    e([]);
    // Row 33: blank
    e([]);
    // Row 34: CHANGE ORDER SUMMARY header
    e(["CHANGE ORDER SUMMARY", "", "", "", "", "", "", "", "ADDITIONS", "DEDUCTIONS",
      "", "", "", "", "ARCHITECT:"]);
    // Row 35
    e(["Total changes approved in previous months by Owner", "", "", "", "", "", "", "", "", "",
      "", "", "", "", "By:", "", "", "", "", "Date:"]);
    // Row 36
    e(["Total approved this Month"]);
    // Row 37: TOTALS
    e(["TOTALS", "", "", "", "", "", "", "", fmtCur(netChangeOrders > 0 ? netChangeOrders : 0), fmtCur(netChangeOrders < 0 ? Math.abs(netChangeOrders) : 0)]);

    const ws702 = XLSX.utils.aoa_to_sheet(R);
    ws702["!cols"] = Array(30).fill({ wch: 8 });
    // Make key columns wider
    ws702["!cols"][0] = { wch: 12 };
    ws702["!cols"][3] = { wch: 14 };
    ws702["!cols"][8] = { wch: 16 };
    ws702["!cols"][10] = { wch: 14 };
    ws702["!cols"][14] = { wch: 14 };

    // ═══════════════════════════════════════════════
    // SHEET 2: G703 — Continuation Sheet
    // ═══════════════════════════════════════════════
    const G: any[][] = [];

    // Row 0: Title
    G.push(["Continuation Sheet", "", "", "", "", "", "", "", "", "", ""]);
    // Row 1: blank
    G.push([]);
    // Row 2-5: Header info
    G.push(["", "", "", "", "", "", "APPLICATION NO:", "", "1", "", ""]);
    G.push(["", "", "", "", "", "", "APPLICATION DATE:", "", "", "", ""]);
    G.push(["", "", "", "", "", "", "PERIOD TO:", "", fmtDate(pEnd), "", ""]);
    G.push(["", "", "", "", "", "", "ARCHITECT'S PROJECT NO:", "", "", "", ""]);
    // Row 6: Column letters
    G.push(["A", "B", "C", "D", "E", "F", "G", "", "H", "I", ""]);
    // Row 7: Column headers
    G.push([
      "ITEM\nNO.",
      "DESCRIPTION OF WORK",
      "SCHEDULED\nVALUE",
      "WORK COMPLETED\nFROM PREVIOUS\nAPPLICATION\n(D+E)",
      "THIS PERIOD",
      "MATERIALS\nPRESENTLY\nSTORED\n(NOT IN\nD OR E)",
      "TOTAL\nCOMPLETED\nAND STORED\nTO DATE\n(D+E+F)",
      "%\n(G ÷ C)",
      "BALANCE\nTO FINISH\n(C - G)",
      "RETAINAGE\n(IF VARIABLE\nRATE)",
      "",
    ]);

    const addDivRows = (costType: string, label: string) => {
      // Section header
      G.push(["", label, "", "", "", "", "", "", "", "", ""]);
      G.push([]); // blank row after header

      const divs = budgetRows.filter((r: any) => r.cost_type === costType);
      let sS = 0, sP = 0, sT = 0, sM = 0, sC = 0, sB = 0, sR = 0;

      divs.forEach((div: any) => {
        const dTxns = approvedTxns.filter((t: any) => t.division_number === div.division_number);
        const prev = dTxns.filter((t: any) => new Date(t.date) < pStart).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const tp = dTxns.filter((t: any) => { const d = new Date(t.date); return d >= pStart && d <= pEnd; }).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const mat = materials[div.division_number] ?? 0;
        const sched = Number(div.scheduled_value);
        const tc = prev + tp + mat;
        const pct = sched > 0 ? tc / sched : 0;
        const bal = sched - tc;
        const ret = dTxns.reduce((s: number, t: any) => s + Number(t.retainage_amount), 0);
        sS += sched; sP += prev; sT += tp; sM += mat; sC += tc; sB += bal; sR += ret;

        G.push([
          div.division_number,
          div.division_name,
          sched, prev, tp, mat === 0 ? "" : mat, tc,
          pct, bal, ret, "",
        ]);
      });

      G.push([]); // blank before subtotal
      G.push([]); // blank
      const subPct = sS > 0 ? sC / sS : 0;
      G.push(["", `${label} SUBTOTAL`, sS, sP, sT, sM, sC, subPct, sB, sR, ""]);
      return { sS, sP, sT, sM, sC, sB, sR };
    };

    const hard = addDivRows("hard", "CONSTRUCTION HARD COSTS");
    const soft = addDivRows("soft", "CONSTRUCTION SOFT COSTS");

    G.push([]); // blank
    G.push([]); // blank
    const grandSched = hard.sS + soft.sS;
    const grandTC = hard.sC + soft.sC;
    const grandPct = grandSched > 0 ? grandTC / grandSched : 0;
    G.push([
      "", "TOTAL COSTS",
      hard.sS + soft.sS, hard.sP + soft.sP, hard.sT + soft.sT,
      hard.sM + soft.sM, grandTC, grandPct,
      hard.sB + soft.sB, hard.sR + soft.sR, "",
    ]);

    const ws703 = XLSX.utils.aoa_to_sheet(G);
    ws703["!cols"] = [
      { wch: 10 }, { wch: 38 }, { wch: 18 }, { wch: 18 },
      { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 10 },
      { wch: 18 }, { wch: 15 }, { wch: 5 },
    ];

    // Format currency & percent in G703 data rows (start after headers at row 8)
    for (let r = 8; r < G.length; r++) {
      for (const c of [2, 3, 4, 5, 6, 8, 9]) {
        const cell = ws703[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === "number") cell.z = '$#,##0.00';
      }
      const pCell = ws703[XLSX.utils.encode_cell({ r, c: 7 })];
      if (pCell && typeof pCell.v === "number") pCell.z = '0.00%';
    }

    // ═══════════════════════════════════════════════
    // SHEET 3: Detail — Vendor/Invoice Detail
    // ═══════════════════════════════════════════════
    const periodTxns = transactions.filter((t: any) => {
      const d = new Date(t.date);
      return d >= pStart && d <= pEnd;
    });

    const D: any[][] = [
      [
        "Vendor", "Invoice", "Invoice Date", "Draw #", "AIA Item",
        "Cost Type", "Cost", "Retainage", "Total", "Status", "Comments",
      ],
    ];
    periodTxns.forEach((t: any) => {
      D.push([
        t.payee, t.transaction_number, t.date, "",
        t.division_number, t.description,
        Number(t.amount), Number(t.retainage_amount), Number(t.net_amount),
        t.status, t.notes || "",
      ]);
    });

    // Totals row
    if (periodTxns.length > 0) {
      const totalAmt = periodTxns.reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalRet = periodTxns.reduce((s: number, t: any) => s + Number(t.retainage_amount), 0);
      const totalNet = periodTxns.reduce((s: number, t: any) => s + Number(t.net_amount), 0);
      D.push([]);
      D.push(["", "", "", "", "", "TOTAL", totalAmt, totalRet, totalNet, "", ""]);
    }

    const ws3 = XLSX.utils.aoa_to_sheet(D);
    ws3["!cols"] = [
      { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
      { wch: 10 }, { wch: 32 }, { wch: 15 }, { wch: 12 },
      { wch: 15 }, { wch: 10 }, { wch: 35 },
    ];
    for (let r = 1; r < D.length; r++) {
      for (const c of [6, 7, 8]) {
        const cell = ws3[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === "number") cell.z = '$#,##0.00';
      }
    }

    // ── Build workbook ──
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws702, "G702");
    XLSX.utils.book_append_sheet(wb, ws703, "G703");
    XLSX.utils.book_append_sheet(wb, ws3, "Detail");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${project.name.replace(/\s+/g, "_")}_G702_G703.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error("Export error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
