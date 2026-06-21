-- Single Google Drive backup-folder URL per draw/invoice. Replaces hosted
-- supporting-file uploads going forward (the invoice_documents table is kept
-- for existing records but is no longer the primary path).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS drive_url text;
