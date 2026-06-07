import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Cell reference helpers ──────────────────────────────────────────────
function colToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n;
}

function parseRef(ref: string): { col: string; row: number; colIdx: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Invalid cell ref: ${ref}`);
  return { col: m[1], row: parseInt(m[2], 10), colIdx: colToIndex(m[1]) };
}

// ── XML manipulation helpers ────────────────────────────────────────────

interface SharedStrings {
  xml: string;
  strings: string[];
  modified: boolean;
}

function parseSharedStrings(xml: string): SharedStrings {
  const strings: string[] = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml)) !== null) {
    const tMatch = match[1].match(/<t[^>]*>([\s\S]*?)<\/t>/);
    strings.push(tMatch ? tMatch[1] : "");
  }
  return { xml, strings, modified: false };
}

function addSharedString(ss: SharedStrings, value: string): number {
  const existing = ss.strings.indexOf(value);
  if (existing !== -1) return existing;
  const idx = ss.strings.length;
  ss.strings.push(value);
  ss.modified = true;
  return idx;
}

function rebuildSharedStrings(ss: SharedStrings): string {
  if (!ss.modified) return ss.xml;
  const items = ss.strings
    .map((s) => `<si><t>${escapeXml(s)}</t></si>`)
    .join("");
  const count = ss.strings.length;
  return ss.xml.replace(
    /<sst[^>]*>[\s\S]*<\/sst>/,
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${count}" uniqueCount="${count}">${items}</sst>`
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Set a cell value in a sheet XML string.
 * Preserves the existing style (s="") attribute on the cell.
 * Does NOT overwrite formula cells.
 */
function setCellValue(
  sheetXml: string,
  ref: string,
  value: string | number,
  ss: SharedStrings,
): string {
  const { row, colIdx } = parseRef(ref);

  // Check if cell has a formula — skip if so
  const cellFormulaCheck = new RegExp(
    `<c\\s[^>]*r="${ref}"[^>]*>\\s*<f[^>]*>`
  );
  if (cellFormulaCheck.test(sheetXml)) {
    return sheetXml;
  }

  const isNum = typeof value === "number";

  // Try to replace existing cell, preserving its style
  const existingCellRegex = new RegExp(
    `<c\\s+([^>]*?)r="${ref}"([^/>]*?)(?:/>|>[\\s\\S]*?</c>)`
  );
  const existingMatch = existingCellRegex.exec(sheetXml);

  if (existingMatch) {
    // Extract existing s="" attribute
    const fullAttrs = existingMatch[1] + "r=\"" + ref + "\"" + existingMatch[2];
    const sMatch = fullAttrs.match(/\ss="(\d+)"/);
    const sAttr = sMatch ? ` s="${sMatch[1]}"` : "";

    let cellXml: string;
    if (isNum) {
      cellXml = `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
    } else {
      const ssIdx = addSharedString(ss, String(value));
      cellXml = `<c r="${ref}"${sAttr} t="s"><v>${ssIdx}</v></c>`;
    }
    return sheetXml.replace(existingCellRegex, cellXml);
  }

  // Cell doesn't exist — insert new (no style since template doesn't have one)
  let cellXml: string;
  if (isNum) {
    cellXml = `<c r="${ref}"><v>${value}</v></c>`;
  } else {
    const ssIdx = addSharedString(ss, String(value));
    cellXml = `<c r="${ref}" t="s"><v>${ssIdx}</v></c>`;
  }

  const rowRegex = new RegExp(
    `(<row\\s+r="${row}"[^>]*>)([\\s\\S]*?)(</row>)`
  );
  const rowMatch = rowRegex.exec(sheetXml);

  if (rowMatch) {
    const rowOpen = rowMatch[1];
    const rowContent = rowMatch[2];
    const rowClose = rowMatch[3];

    const cellsInRow: { ref: string; colIdx: number; fullMatch: string }[] = [];
    const cellRegex = /<c\s+r="([A-Z]+)(\d+)"[^/>]*(?:\/>|>[\s\S]*?<\/c>)/g;
    let cm;
    while ((cm = cellRegex.exec(rowContent)) !== null) {
      cellsInRow.push({
        ref: cm[1] + cm[2],
        colIdx: colToIndex(cm[1]),
        fullMatch: cm[0],
      });
    }

    const insertBefore = cellsInRow.find((c) => c.colIdx > colIdx);
    if (insertBefore) {
      const idx = rowContent.indexOf(insertBefore.fullMatch);
      const newRowContent =
        rowContent.substring(0, idx) + cellXml + rowContent.substring(idx);
      return sheetXml.replace(rowRegex, rowOpen + newRowContent + rowClose);
    } else {
      return sheetXml.replace(rowRegex, rowOpen + rowContent + cellXml + rowClose);
    }
  }

  const newRow = `<row r="${row}">${cellXml}</row>`;
  return sheetXml.replace("</sheetData>", newRow + "</sheetData>");
}

// ── Remove grey fill: create a white-fill style variant ─────────────────

/**
 * In xl/styles.xml, add a solid white fill entry and create new cellXf entries
 * that clone existing styles but use the white fill. Returns a map from
 * old style index → new style index (with white fill).
 */
async function addWhiteFillStyles(zip: JSZip): Promise<Map<number, number>> {
  const styleMap = new Map<number, number>();
  const stylesFile = zip.file("xl/styles.xml");
  if (!stylesFile) return styleMap;

  let stylesXml = await stylesFile.async("string");

  // 1. Add a white solid fill to <fills>
  const whiteFillXml = `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor rgb="FFFFFFFF"/></patternFill></fill>`;

  const fillsMatch = stylesXml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/);
  if (!fillsMatch) return styleMap;

  const existingFills = fillsMatch[1].match(/<fill[\s>]/g) || [];
  const whiteFillId = existingFills.length;

  // Update fills count and append
  stylesXml = stylesXml.replace(
    /<fills\s+count="(\d+)"/,
    `<fills count="${whiteFillId + 1}"`
  );
  stylesXml = stylesXml.replace("</fills>", whiteFillXml + "</fills>");

  // 2. Parse existing cellXfs
  const xfMatch = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!xfMatch) return styleMap;

  const xfContent = xfMatch[1];
  // Match both self-closing and non-self-closing xf tags
  const xfEntries: string[] = [];
  const xfRegex = /<xf\s[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
  let xm;
  while ((xm = xfRegex.exec(xfContent)) !== null) {
    xfEntries.push(xm[0]);
  }

  // 3. For each unique style index we encounter on target cells,
  //    create a clone with fillId replaced. We'll do this lazily
  //    when applying, but pre-build for all existing xf entries.
  //    Actually, we need to know which style indices are used on
  //    the target cells. Let's just build clones for all and deduplicate.

  const newXfs: string[] = [];
  let nextIdx = xfEntries.length;

  for (let i = 0; i < xfEntries.length; i++) {
    const xf = xfEntries[i];
    // Clone with fillId replaced to whiteFillId
    let cloned: string;
    if (/fillId="\d+"/.test(xf)) {
      cloned = xf.replace(/fillId="\d+"/, `fillId="${whiteFillId}"`);
    } else {
      // Add fillId attribute
      cloned = xf.replace(/<xf\s/, `<xf fillId="${whiteFillId}" `);
    }
    // Ensure applyFill="1"
    if (!/applyFill/.test(cloned)) {
      cloned = cloned.replace(/<xf\s/, `<xf applyFill="1" `);
    } else {
      cloned = cloned.replace(/applyFill="\d+"/, 'applyFill="1"');
    }
    newXfs.push(cloned);
    styleMap.set(i, nextIdx);
    nextIdx++;
  }

  // Append new xf entries
  const newCount = xfEntries.length + newXfs.length;
  stylesXml = stylesXml.replace(
    /<cellXfs\s+count="\d+"/,
    `<cellXfs count="${newCount}"`
  );
  stylesXml = stylesXml.replace("</cellXfs>", newXfs.join("") + "</cellXfs>");

  zip.file("xl/styles.xml", stylesXml);
  return styleMap;
}

/**
 * Apply white-fill style to specific cells by remapping their s="" attribute.
 */
function applyCellWhiteFill(
  sheetXml: string,
  ref: string,
  styleMap: Map<number, number>,
): string {
  // Find the cell and its current style
  const cellRegex = new RegExp(
    `(<c\\s+(?:[^>]*?)r="${ref}")((?:[^/>]*?)(?:/>|>[\\s\\S]*?</c>))`
  );
  const match = cellRegex.exec(sheetXml);
  if (!match) return sheetXml;

  const fullMatch = match[0];
  const sMatch = fullMatch.match(/\ss="(\d+)"/);
  const currentStyle = sMatch ? parseInt(sMatch[1], 10) : 0;
  const newStyle = styleMap.get(currentStyle);
  if (newStyle === undefined) return sheetXml;

  if (sMatch) {
    return sheetXml.replace(fullMatch, fullMatch.replace(/\ss="\d+"/, ` s="${newStyle}"`));
  } else {
    // No style attribute — add one
    return sheetXml.replace(fullMatch, fullMatch.replace(/^<c\s/, `<c s="${newStyle}" `));
  }
}

// ── Sheet name → file path resolution ───────────────────────────────────

async function getSheetFileMap(zip: JSZip): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) return map;
  const wbXml = await wbFile.async("string");

  const sheetEntries: { name: string; rId: string }[] = [];
  const sheetRegex = /<sheet\s+name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g;
  let m;
  while ((m = sheetRegex.exec(wbXml)) !== null) {
    sheetEntries.push({ name: m[1], rId: m[2] });
  }

  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!relsFile) return map;
  const relsXml = await relsFile.async("string");

  const relMap = new Map<string, string>();
  const relRegex = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g;
  while ((m = relRegex.exec(relsXml)) !== null) {
    relMap.set(m[1], m[2]);
  }

  for (const entry of sheetEntries) {
    const target = relMap.get(entry.rId);
    if (target) {
      const path = target.startsWith("/") ? target.substring(1) : `xl/${target}`;
      map.set(entry.name, path);
    }
  }

  return map;
}

// ── Main handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      projectName,
      ownerName,
      applicationNo,
      periodTo,
      contractorName,
      architectName,
      contractDate,
      projectNumber,
      previousCertificates,
      retainagePctWork,
      retainagePctMaterials,
      g703Rows,
      invoiceRows,
    } = body;

    // Download template from storage
    const { data: templateData, error: storageError } = await supabase.storage
      .from("templates")
      .download("AIA_G702_703.xlsx");

    if (storageError || !templateData) {
      throw new Error("Failed to download template: " + (storageError?.message || "No data"));
    }

    const templateBuffer = await templateData.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuffer);

    const sheetMap = await getSheetFileMap(zip);

    const sheet702Path = sheetMap.get("702");
    const sheet703Path = sheetMap.get("703");
    const sheetDetailPath = sheetMap.get("Detail");

    if (!sheet702Path) throw new Error("Sheet '702' not found in template");
    if (!sheet703Path) throw new Error("Sheet '703' not found in template");

    // Load shared strings
    const ssFile = zip.file("xl/sharedStrings.xml");
    let ss: SharedStrings;
    if (ssFile) {
      const ssXml = await ssFile.async("string");
      ss = parseSharedStrings(ssXml);
    } else {
      ss = {
        xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"></sst>',
        strings: [],
        modified: false,
      };
    }

    // ── Build white-fill style map (must happen before writing sheets) ──
    const whiteFillStyleMap = await addWhiteFillStyles(zip);

    // ── G703 row mapping ──
    const G703_ROW_MAP: Record<string, number> = {
      "01": 12, "02": 13, "03": 14, "04": 15, "05": 16,
      "06": 17, "07": 18, "08": 19, "09": 20, "10": 21,
      "11": 22, "12": 23, "13": 24, "14": 25, "21": 26,
      "22": 27, "23": 28, "26": 29, "28": 30, "31": 31,
      "32": 32, "33": 33, "HC": 34,
      "60": 40, "61": 41, "62": 42, "63": 43, "64": 44,
      "65": 45, "66": 46, "67": 47, "68": 48, "69": 49,
      "70": 50, "71": 51, "72": 52, "73": 53, "74": 54,
      "75": 55, "76": 56, "77": 57, "78": 58, "79": 59, "80": 60,
    };

    // ── Sheet 702 — write values only, preserve existing formatting ──
    const file702 = zip.file(sheet702Path);
    if (!file702) throw new Error(`File not found: ${sheet702Path}`);
    let xml702 = await file702.async("string");

    const writes702: [string, string | number][] = [
      ["D3", ownerName || ""],
      ["K3", projectName || ""],
      ["U3", Number(applicationNo) || 0],
      ["K5", periodTo || ""],
      ["D7", contractorName || ""],
      ["K7", architectName || ""],
      ["U7", contractDate || ""],
      ["U8", projectNumber || ""],
      ["J31", Number(previousCertificates) || 0],
      ["B23", `${retainagePctWork || 10}%`],
      ["B25", `${retainagePctMaterials || 10}%`],
    ];

    for (const [ref, val] of writes702) {
      xml702 = setCellValue(xml702, ref, val, ss);
    }

    zip.file(sheet702Path, xml702);

    // ── Sheet 703 — write values only, preserve existing formatting ──
    // Data rows only (not totals rows 35-39 or 61+)
    const DATA_ROWS_703 = [
      ...Array.from({ length: 23 }, (_, i) => 12 + i), // 12-34
      ...Array.from({ length: 21 }, (_, i) => 40 + i), // 40-60
    ];

    const file703 = zip.file(sheet703Path);
    if (!file703) throw new Error(`File not found: ${sheet703Path}`);
    let xml703 = await file703.async("string");

    // Pre-fill ALL data rows with 0 in C and D (NOT E — has SUMIFS formulas)
    for (const xlRow of DATA_ROWS_703) {
      xml703 = setCellValue(xml703, `C${xlRow}`, 0, ss);
      xml703 = setCellValue(xml703, `D${xlRow}`, 0, ss);
    }

    // Overwrite with actual data where available
    if (g703Rows && Array.isArray(g703Rows)) {
      for (const row of g703Rows) {
        const xlRow = G703_ROW_MAP[row.divisionNumber];
        if (!xlRow) continue;
        if (!DATA_ROWS_703.includes(xlRow)) continue;

        xml703 = setCellValue(xml703, `C${xlRow}`, Number(row.scheduledValue) || 0, ss);
        xml703 = setCellValue(xml703, `D${xlRow}`, Number(row.previousApplication) || 0, ss);
      }
    }

    // Fix label
    xml703 = setCellValue(xml703, "B52", "FF&E", ss);
    zip.file(sheet703Path, xml703);

    // ── Detail Sheet ──
    if (sheetDetailPath && invoiceRows && Array.isArray(invoiceRows)) {
      const fileDetail = zip.file(sheetDetailPath);
      if (fileDetail) {
        let xmlDetail = await fileDetail.async("string");

        for (let i = 0; i < invoiceRows.length; i++) {
          const xlRow = i + 3;
          const r = invoiceRows[i];
          xmlDetail = setCellValue(xmlDetail, `A${xlRow}`, r.vendor || "", ss);
          xmlDetail = setCellValue(xmlDetail, `B${xlRow}`, r.invoiceNumber || "", ss);
          xmlDetail = setCellValue(xmlDetail, `C${xlRow}`, r.invoiceDate || "", ss);
          xmlDetail = setCellValue(xmlDetail, `D${xlRow}`, r.drawNumber || "", ss);
          xmlDetail = setCellValue(xmlDetail, `E${xlRow}`, r.aiaItemNumber || "", ss);
          xmlDetail = setCellValue(xmlDetail, `F${xlRow}`, r.costType || "", ss);
          xmlDetail = setCellValue(xmlDetail, `G${xlRow}`, Number(r.costAmount) || 0, ss);
          xmlDetail = setCellValue(xmlDetail, `H${xlRow}`, Number(r.retainageAmount) || 0, ss);
        }

        zip.file(sheetDetailPath, xmlDetail);
      }
    }

    // ── Update shared strings if modified ──
    if (ss.modified) {
      zip.file("xl/sharedStrings.xml", rebuildSharedStrings(ss));
    }

    // ── Force Excel to recalculate all formulas on open ──
    const wbFile = zip.file("xl/workbook.xml");
    if (wbFile) {
      let wbXml = await wbFile.async("string");
      if (/<calcPr[^>]*\/>/.test(wbXml)) {
        // Replace self-closing calcPr with fullCalcOnLoad
        wbXml = wbXml.replace(/<calcPr([^>]*)\/>/, '<calcPr$1 calcMode="auto" fullCalcOnLoad="1"/>');
      } else if (/<calcPr[^>]*>/.test(wbXml)) {
        wbXml = wbXml.replace(/<calcPr([^>]*)>/, '<calcPr$1 calcMode="auto" fullCalcOnLoad="1">');
      } else {
        // No calcPr element — add one before </workbook>
        wbXml = wbXml.replace("</workbook>", '<calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>');
      }
      zip.file("xl/workbook.xml", wbXml);
    }

    // ── Generate output ──
    const outputBuffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const safeName = (projectName || "Project").replace(/\s+/g, "_");
    const fileName = `${safeName}_AIA_G702-703_App${applicationNo || 1}.xlsx`;

    return new Response(outputBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("export-aia-excel error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
