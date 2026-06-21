-- Audit/backup of the AIA Detail-tab rows that produced an invoice's line items
-- (vendor, invoice #, AIA item, cost type, cost, retainage, check #, date).
-- Stored as JSONB on the invoice for transaction-level traceability.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS aia_detail_rows jsonb;
