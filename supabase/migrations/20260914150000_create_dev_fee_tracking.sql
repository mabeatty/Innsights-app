-- Company Dashboard, Tab 2: Development Fees. Tracks each New-Build
-- project's development fee (and owner's-rep fee where applicable), how
-- much has been billed to date, how much remains, and a real month-by-
-- month billing schedule going forward — separate from company_budget/
-- company_actuals (Tab 1), which are firm-level P&L totals, not per-
-- project fee tracking. A single dollar of Development Fees revenue in
-- Tab 1 traces back to a specific project + month here, but this table
-- carries the detail Tab 1 doesn't need (which project, fee structure,
-- remaining balance) and Tab 1 doesn't carry what this table doesn't need
-- (firm overhead categories).
--
-- Two tables, same reasoning as company_budget/company_actuals: the fee
-- total (dev_fee_projects) is set once per project and rarely changes,
-- while the monthly billing schedule (dev_fee_schedule) is what actually
-- gets updated as invoices go out — keeping them separate means recording
-- this month's billing never risks touching the project's total fee figure.

CREATE TABLE public.dev_fee_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  dev_fee numeric NOT NULL DEFAULT 0, -- total development fee for the project
  or_fee numeric NOT NULL DEFAULT 0, -- total owner's-rep fee, where applicable (separate from dev_fee, not all projects have one)
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

CREATE TABLE public.dev_fee_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  month date NOT NULL, -- first of month
  amount numeric NOT NULL DEFAULT 0,
  is_billed boolean NOT NULL DEFAULT false, -- true = actually invoiced/received; false = forecasted future billing
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT NULL,
  UNIQUE (project_id, month)
);

CREATE INDEX idx_dev_fee_schedule_org_month ON public.dev_fee_schedule (org_id, month);
CREATE INDEX idx_dev_fee_schedule_project ON public.dev_fee_schedule (project_id);

ALTER TABLE public.dev_fee_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_fee_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select dev_fee_projects" ON public.dev_fee_projects
  FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert dev_fee_projects" ON public.dev_fee_projects
  FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update dev_fee_projects" ON public.dev_fee_projects
  FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid())) WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete dev_fee_projects" ON public.dev_fee_projects
  FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can select dev_fee_schedule" ON public.dev_fee_schedule
  FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert dev_fee_schedule" ON public.dev_fee_schedule
  FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update dev_fee_schedule" ON public.dev_fee_schedule
  FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid())) WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete dev_fee_schedule" ON public.dev_fee_schedule
  FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
