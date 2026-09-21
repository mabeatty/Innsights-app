// Bundles a closed draw's invoice PDFs and their supporting documents into
// a single ZIP for handoff to the accounting team. Two document sources
// per invoice: the invoice's own PDF (invoices.pdf_url) and any files
// uploaded to invoice_documents (the "Supporting Documents" panel on the
// invoice detail dialog — lien waivers, backup, etc.).

import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { getDocumentUrl, listInvoiceDocuments } from "@/components/invoices/invoiceDocuments";
import type { DrawRecord } from "./DrawHistoryTab";

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "Unnamed";
}

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

// invoices.pdf_url is a signed URL stored once at upload time (30-day
// expiry) — a draw can easily get downloaded well after that. The storage
// path itself was never saved separately, so it has to be recovered from
// the URL string and re-signed fresh, rather than fetching the stored URL
// directly and risking a silent 403 on anything older than a month.
function extractStoragePath(pdfUrl: string): string | null {
  const match = pdfUrl.match(/\/object\/sign\/invoices\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function freshInvoicePdfUrl(pdfUrl: string): Promise<string | null> {
  const path = extractStoragePath(pdfUrl);
  if (!path) return pdfUrl; // unrecognized format — fall back to the stored URL as-is
  const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export interface DrawZipResult {
  fileName: string;
  invoiceCount: number;
  missingPdfCount: number;
  supportingDocCount: number;
}

export async function downloadDrawZip(draw: DrawRecord, projectName: string): Promise<DrawZipResult> {
  // Every budget_transactions row belonging to this draw carries an
  // invoice_id (set when the invoice's line items were posted) — dedupe
  // down to the distinct invoices actually billed in this draw.
  const { data: txns, error: txnErr } = await supabase
    .from("budget_transactions")
    .select("invoice_id")
    .eq("draw_id", draw.id)
    .not("invoice_id", "is", null);
  if (txnErr) throw txnErr;

  const invoiceIds = [...new Set((txns ?? []).map((t: any) => t.invoice_id as string))];
  if (invoiceIds.length === 0) {
    throw new Error("No invoices are linked to this draw's transactions — nothing to zip.");
  }

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, vendor_name, invoice_number, pdf_url")
    .in("id", invoiceIds);
  if (invErr) throw invErr;

  const zip = new JSZip();
  let missingPdfCount = 0;
  let supportingDocCount = 0;

  for (const inv of invoices ?? []) {
    const label = safeName(`${inv.vendor_name || "Vendor"}${inv.invoice_number ? ` - ${inv.invoice_number}` : ""}`);
    const folder = zip.folder(label)!;

    if (inv.pdf_url) {
      const freshUrl = await freshInvoicePdfUrl(inv.pdf_url);
      const blob = freshUrl ? await fetchAsBlob(freshUrl) : null;
      if (blob) {
        folder.file(`${label}.pdf`, blob);
      } else {
        missingPdfCount++;
      }
    } else {
      missingPdfCount++;
    }

    const docs = await listInvoiceDocuments(inv.id);
    for (const doc of docs) {
      const url = await getDocumentUrl(doc.storage_path);
      if (!url) continue;
      const blob = await fetchAsBlob(url);
      if (!blob) continue;
      folder.file(safeName(doc.file_name), blob);
      supportingDocCount++;
    }
  }

  const monthLabel = draw.draw_month ? draw.draw_month.slice(0, 7) : "unknown-month";
  const fileName = safeName(`${projectName} - Draw ${draw.draw_number} (${monthLabel})`) + ".zip";
  const blob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { fileName, invoiceCount: invoices?.length ?? 0, missingPdfCount, supportingDocCount };
}
