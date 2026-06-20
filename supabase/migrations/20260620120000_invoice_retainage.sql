-- Manual retainage entry on invoices.
-- retainage_amount: dollar amount withheld (manual entry), defaults to 0.
-- net_amount: amount minus retainage.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS retainage_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2);

-- Backfill net_amount for existing invoices (amount - retainage).
UPDATE public.invoices
  SET net_amount = COALESCE(amount, 0) - COALESCE(retainage_amount, 0)
  WHERE net_amount IS NULL;
