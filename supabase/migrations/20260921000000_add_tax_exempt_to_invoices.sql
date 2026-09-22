-- Whole-invoice tax-exempt flag, set by whoever uploads the invoice if they
-- believe it contains tax-exempt materials. Deliberately simple/binary for
-- now — handling an invoice with a mix of exempt and non-exempt line items
-- is a real follow-on problem, not solved here (per direction 2026-09-21).
alter table invoices add column if not exists tax_exempt boolean not null default false;
alter table invoices add column if not exists tax_exempt_by uuid references auth.users(id);
alter table invoices add column if not exists tax_exempt_at timestamptz;
