// Extraction logic shared by the single-invoice modal and the batch uploader.
// Everything here is pure (no component state), so batch can run it in the
// background for many files while the review form stays a single code path.

import { supabase } from "@/integrations/supabase/client";
import { naturalDivisionSort } from "../budget/types";
import { parseAIAExcel, type AIAExcelResult } from "./aiaExcel";

export type InvoiceFileKind = "pdf" | "excel" | "unsupported";

export function fileKind(f: File): InvoiceFileKind {
  const name = f.name.toLowerCase();
  if (name.endsWith(".xlsx") || f.type.includes("spreadsheetml")) return "excel";
  if (f.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "unsupported";
}

export interface BudgetMatcher {
  categories: string[];
  resolve: (category: string | null | undefined, description: string) => string;
}

// Fetch a project's budget categories and return both the category labels (to
// send to the edge function) and a resolver that maps an AI category/description
// to a budget division number.
export async function buildBudgetMatcher(pid: string): Promise<BudgetMatcher> {
  const catToDivision = new Map<string, string>();
  const budgetCats: { number: string; name: string }[] = [];
  const categories: string[] = [];
  if (pid) {
    const { data: budget } = await supabase
      .from("project_budget")
      .select("division_number, division_name")
      .eq("project_id", pid)
      .order("division_number");
    const sortedBudget = ((budget ?? []) as { division_number: string; division_name: string }[])
      .sort((a, b) => naturalDivisionSort(a.division_number, b.division_number));
    for (const r of sortedBudget) {
      const label = `${r.division_number} — ${r.division_name}`;
      categories.push(label);
      catToDivision.set(label.toLowerCase().trim(), r.division_number);
      budgetCats.push({ number: r.division_number, name: r.division_name });
    }
  }
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const fuzzy = (textRaw: string): string => {
    const text = (textRaw || "").toLowerCase().trim();
    if (!text) return "";
    if (catToDivision.has(text)) return catToDivision.get(text)!;
    const numHit = text.match(/^(\d{1,2})\b/);
    if (numHit) {
      const padded = numHit[1].padStart(2, "0");
      const c = budgetCats.find((b) => b.number === padded);
      if (c) return c.number;
    }
    const words = tokenize(text);
    let best = ""; let bestScore = 0;
    for (const c of budgetCats) {
      const name = c.name.toLowerCase();
      const score = words.filter((w) => name.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = c.number; }
    }
    return bestScore > 0 ? best : "";
  };
  const resolve = (category: string | null | undefined, description: string): string => {
    const cat = typeof category === "string" ? category : "";
    const fromCat = cat ? (catToDivision.get(cat.toLowerCase().trim()) || fuzzy(cat)) : "";
    return fromCat || fuzzy(description || "");
  };
  return { categories, resolve };
}

export type ExtractionResult =
  | { kind: "excel"; res: AIAExcelResult }
  | { kind: "excel-unrecognized" }
  | { kind: "excel-error"; message?: string }
  | { kind: "pdf"; fields: Record<string, any> }
  | { kind: "pdf-error"; message?: string }
  | { kind: "unsupported" };

// True when extraction produced nothing usable and the person has to type the
// fields in by hand (the form still opens — this just labels the queue row).
export const isExtractionFailure = (r: ExtractionResult): boolean =>
  r.kind === "excel-unrecognized" || r.kind === "excel-error" || r.kind === "pdf-error" || r.kind === "unsupported";

export async function extractInvoiceFile(file: File, categories: string[]): Promise<ExtractionResult> {
  const kind = fileKind(file);

  if (kind === "excel") {
    try {
      const buf = await file.arrayBuffer();
      const res = parseAIAExcel(buf);
      return res.isAIA ? { kind: "excel", res } : { kind: "excel-unrecognized" };
    } catch (e: any) {
      return { kind: "excel-error", message: e?.message };
    }
  }

  if (kind === "pdf") {
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("extract-invoice-claude", {
        body: { pdfBase64: b64, mimeType: "application/pdf", categories },
      });
      if (error) return { kind: "pdf-error", message: error.message };
      if (data?.ok && data.fields) return { kind: "pdf", fields: data.fields };
      return { kind: "pdf-error", message: data?.error ?? undefined };
    } catch (e: any) {
      return { kind: "pdf-error", message: e?.message };
    }
  }

  return { kind: "unsupported" };
}

// One-line description of what extraction found, for the batch queue rows.
export function summarizeExtraction(r: ExtractionResult): { label: string; vendor?: string; invoiceNumber?: string; amount?: number } {
  if (r.kind === "excel") {
    return {
      label: "AIA pay app",
      vendor: r.res.vendor_name ?? undefined,
      invoiceNumber: r.res.invoice_number != null ? String(r.res.invoice_number) : undefined,
      amount: r.res.totals?.net,
    };
  }
  if (r.kind === "pdf") {
    const f = r.fields;
    const isAia = f.document_type === "aia_pay_app";
    const lineTotal = Array.isArray(f.line_items)
      ? f.line_items.reduce((s: number, li: any) => s + (Number(li?.amount) > 0 ? Number(li.amount) : 0), 0)
      : 0;
    const total = isAia ? lineTotal : Number(f.total_amount ?? f.amount);
    return {
      label: isAia ? "AIA pay app" : "Invoice",
      vendor: f.vendor_name || undefined,
      invoiceNumber: f.invoice_number ? String(f.invoice_number) : undefined,
      amount: Number.isFinite(total) && total > 0 ? total : undefined,
    };
  }
  return { label: "Manual entry" };
}
