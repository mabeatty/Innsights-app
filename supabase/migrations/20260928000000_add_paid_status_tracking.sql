-- Innsights' invoice workflow topped out at "Routed for Payment" (queued),
-- with no way to record that a check was actually issued and cleared.
-- Adding real payment-tracking fields rather than repurposing an existing
-- status, so check number and clear date are captured with full fidelity
-- instead of being lost.
alter table invoices add column if not exists check_number text;
alter table invoices add column if not exists paid_date date;
