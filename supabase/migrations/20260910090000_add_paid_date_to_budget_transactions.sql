-- Records when a transaction was actually marked Paid — there was
-- previously no field for this at all, so "Paid" status carried no date
-- information (only the transaction's own .date field, which is when the
-- transaction was recorded/approved, not when it was actually paid out).
-- Nullable since the ~1,350 existing Paid rows predate this column and
-- their real paid date isn't known.
ALTER TABLE public.budget_transactions ADD COLUMN paid_date date DEFAULT NULL;
