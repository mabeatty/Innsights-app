-- ============================================================================
-- Invoice ↔ transaction merge — Stage A (roles + linkage)
--   * budget_transactions.invoice_id: links a transaction line to its invoice.
--   * profiles.is_treasury: global Treasury-approver flag (per-user checkbox).
-- ============================================================================

ALTER TABLE public.budget_transactions
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budget_transactions_invoice
  ON public.budget_transactions(invoice_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_treasury boolean NOT NULL DEFAULT false;

-- Org members must be able to read each other's profiles so invoice routing can
-- find who is flagged Treasury (the existing policy only allows reading your own).
DROP POLICY IF EXISTS "Org members can read org profiles" ON public.profiles;
CREATE POLICY "Org members can read org profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
