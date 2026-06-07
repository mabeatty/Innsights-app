
-- Create budget_transactions table
CREATE TABLE public.budget_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  transaction_number INTEGER NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payee TEXT NOT NULL DEFAULT '',
  division_number TEXT NOT NULL,
  division_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  retainage_percent NUMERIC NOT NULL DEFAULT 0,
  retainage_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to organization
CREATE POLICY "Org members can select budget_transactions"
  ON public.budget_transactions FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert budget_transactions"
  ON public.budget_transactions FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update budget_transactions"
  ON public.budget_transactions FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete budget_transactions"
  ON public.budget_transactions FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Auto-update updated_at
CREATE TRIGGER update_budget_transactions_updated_at
  BEFORE UPDATE ON public.budget_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
