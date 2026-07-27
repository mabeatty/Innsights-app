-- Payment layer: pay-from bank accounts, payments, and invoice allocations.
-- Full account/routing numbers are intentionally NOT stored (sensitive);
-- only a display mask + optional link to a Plaid account.
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL, institution_name text, mask text,
  account_type text NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking','savings')),
  next_check_number integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  plaid_account_id uuid REFERENCES public.plaid_accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  global_vendor_id uuid REFERENCES public.global_vendors(id) ON DELETE SET NULL,
  payee_name text NOT NULL,
  payment_method text NOT NULL DEFAULT 'check' CHECK (payment_method IN ('check','ach')),
  check_number integer, payment_date date, amount numeric NOT NULL DEFAULT 0, memo text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','sent','cleared','voided')),
  reference text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_accounts_org ON public.bank_accounts(org_id);
CREATE INDEX idx_payments_org ON public.payments(org_id);
CREATE INDEX idx_payments_bank ON public.payments(bank_account_id);
CREATE INDEX idx_payment_alloc_payment ON public.payment_allocations(payment_id);
CREATE INDEX idx_payment_alloc_invoice ON public.payment_allocations(invoice_id);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org select bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org insert bank_accounts" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org update bank_accounts" ON public.bank_accounts FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org delete bank_accounts" ON public.bank_accounts FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org select payments" ON public.payments FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org update payments" ON public.payments FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org delete payments" ON public.payments FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org select payment_alloc" ON public.payment_allocations FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org insert payment_alloc" ON public.payment_allocations FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org update payment_alloc" ON public.payment_allocations FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org delete payment_alloc" ON public.payment_allocations FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
