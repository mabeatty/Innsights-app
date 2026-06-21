// Supporting-document attachments for invoices/draws. Files live in the
// 'invoices' storage bucket under {project_id}/{invoice_id}/supporting/ and are
// indexed in the invoice_documents table.

import { supabase } from "@/integrations/supabase/client";

export interface InvoiceDocument {
  id: string;
  invoice_id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listInvoiceDocuments(invoiceId: string): Promise<InvoiceDocument[]> {
  const { data } = await supabase
    .from("invoice_documents")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("uploaded_at", { ascending: false });
  return (data as InvoiceDocument[]) ?? [];
}

export async function uploadInvoiceDocument(
  projectId: string,
  invoiceId: string,
  file: File,
  userId: string | null,
): Promise<InvoiceDocument> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${projectId}/${invoiceId}/supporting/${Date.now()}-${safe}`;
  const up = await supabase.storage
    .from("invoices")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("invoice_documents")
    .insert({
      invoice_id: invoiceId,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      storage_path: path,
      uploaded_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as InvoiceDocument;
}

export async function deleteInvoiceDocument(doc: InvoiceDocument): Promise<void> {
  await supabase.storage.from("invoices").remove([doc.storage_path]);
  const { error } = await supabase.from("invoice_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// Signed URL for preview (open in tab) or download (forces a download).
export async function getDocumentUrl(
  storagePath: string,
  downloadAs?: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from("invoices")
    .createSignedUrl(storagePath, 60 * 60, downloadAs ? { download: downloadAs } : undefined);
  return data?.signedUrl ?? null;
}
