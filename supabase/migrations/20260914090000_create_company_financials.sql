-- Company Financials tab (Company Dashboard, Tab 1): tracks company-level
-- revenue and expenses against a fixed annual budget, by category and
-- month. This is firm-level P&L data — distinct from project-level budget/
-- transaction tables elsewhere in the schema, which track individual
-- project costs, not what the company itself earns or spends.
--
-- Two tables rather than one "budget vs actual" table with two amount
-- columns: budget is set once at the start of the year and rarely changes,
-- while actuals get re-entered/updated every month — keeping them separate
-- means updating this month's actual never touches the budget row, and a
-- budget correction never touches actuals. Both key on (category, month,
-- type) so a given category's budget and actual line up for comparison
-- without a join needing anything fuzzier than an exact match.
--
-- category values match the real chart-of-accounts rollup structure from
-- the source budget document (FY26 Proforma Budget) rather than an
-- invented taxonomy — e.g. "Payroll & Related", "Development Fees" — so a
-- category name means the same thing here as it does in the underlying
-- accounting records this was transcribed from.

CREATE TABLE public.company_financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('revenue', 'expense')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name, type)
);

CREATE TABLE public.company_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.company_financial_categories(id) ON DELETE CASCADE,
  month date NOT NULL, -- first of month, e.g. 2026-01-01
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT NULL,
  UNIQUE (category_id, month)
);

CREATE TABLE public.company_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.company_financial_categories(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  is_projected boolean NOT NULL DEFAULT false, -- true = forecast/estimate, not yet a closed actual
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT NULL,
  UNIQUE (category_id, month)
);

CREATE INDEX idx_company_budget_org_month ON public.company_budget (org_id, month);
CREATE INDEX idx_company_actuals_org_month ON public.company_actuals (org_id, month);

ALTER TABLE public.company_financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_actuals ENABLE ROW LEVEL SECURITY;

-- Company financials are firm-level, not project-scoped — gate on org
-- membership directly (same organization_id the person's own row carries)
-- rather than the project_id-based policies used elsewhere in this schema.
CREATE POLICY "Org members can select company_financial_categories" ON public.company_financial_categories
  FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert company_financial_categories" ON public.company_financial_categories
  FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update company_financial_categories" ON public.company_financial_categories
  FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid())) WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete company_financial_categories" ON public.company_financial_categories
  FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can select company_budget" ON public.company_budget
  FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert company_budget" ON public.company_budget
  FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update company_budget" ON public.company_budget
  FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid())) WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete company_budget" ON public.company_budget
  FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can select company_actuals" ON public.company_actuals
  FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert company_actuals" ON public.company_actuals
  FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update company_actuals" ON public.company_actuals
  FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid())) WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete company_actuals" ON public.company_actuals
  FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
