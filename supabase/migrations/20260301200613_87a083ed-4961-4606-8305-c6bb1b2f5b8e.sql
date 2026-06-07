
-- Capital Equity Sources
CREATE TABLE public.capital_equity_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL DEFAULT '',
  equity_type TEXT NOT NULL DEFAULT 'GP Equity',
  total_commitment NUMERIC NOT NULL DEFAULT 0,
  equity_called NUMERIC NOT NULL DEFAULT 0,
  preferred_return NUMERIC,
  promote_structure TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capital_equity_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select capital_equity_sources" ON public.capital_equity_sources FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_equity_sources" ON public.capital_equity_sources FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_equity_sources" ON public.capital_equity_sources FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_equity_sources" ON public.capital_equity_sources FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Capital Debt Tranches
CREATE TABLE public.capital_debt_tranches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL DEFAULT '',
  loan_type TEXT NOT NULL DEFAULT 'Construction Loan',
  loan_amount NUMERIC NOT NULL DEFAULT 0,
  interest_rate NUMERIC NOT NULL DEFAULT 0,
  rate_type TEXT NOT NULL DEFAULT 'Fixed',
  index_name TEXT,
  spread NUMERIC,
  loan_term INTEGER NOT NULL DEFAULT 0,
  maturity_date DATE,
  amortization_schedule TEXT NOT NULL DEFAULT 'Interest Only',
  origination_fee NUMERIC NOT NULL DEFAULT 0,
  extension_options TEXT,
  required_reserves TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capital_debt_tranches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select capital_debt_tranches" ON public.capital_debt_tranches FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_debt_tranches" ON public.capital_debt_tranches FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_debt_tranches" ON public.capital_debt_tranches FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_debt_tranches" ON public.capital_debt_tranches FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Capital Investors
CREATE TABLE public.capital_investors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  investor_name TEXT NOT NULL DEFAULT '',
  equity_source_id UUID REFERENCES public.capital_equity_sources(id) ON DELETE SET NULL,
  total_commitment NUMERIC NOT NULL DEFAULT 0,
  total_called NUMERIC NOT NULL DEFAULT 0,
  total_received NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capital_investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select capital_investors" ON public.capital_investors FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_investors" ON public.capital_investors FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_investors" ON public.capital_investors FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_investors" ON public.capital_investors FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Capital Cash Flow
CREATE TABLE public.capital_cash_flow (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL DEFAULT '',
  projected_spend NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capital_cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select capital_cash_flow" ON public.capital_cash_flow FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_cash_flow" ON public.capital_cash_flow FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_cash_flow" ON public.capital_cash_flow FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_cash_flow" ON public.capital_cash_flow FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Add unique constraint for cash flow month per project
ALTER TABLE public.capital_cash_flow ADD CONSTRAINT capital_cash_flow_project_month_unique UNIQUE (project_id, month_year);
