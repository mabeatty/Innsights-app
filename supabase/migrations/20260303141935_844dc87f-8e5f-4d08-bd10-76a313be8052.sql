
-- Add expense role and supervisor to organization_members
ALTER TABLE public.organization_members 
ADD COLUMN IF NOT EXISTS expense_role text DEFAULT 'Employee',
ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL;

-- Plaid connections
CREATE TABLE public.plaid_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  institution_name text NOT NULL DEFAULT '',
  institution_id text NOT NULL DEFAULT '',
  access_token text NOT NULL,
  item_id text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  last_synced timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.plaid_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plaid_connections" ON public.plaid_connections
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert plaid_connections" ON public.plaid_connections
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update plaid_connections" ON public.plaid_connections
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete plaid_connections" ON public.plaid_connections
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

-- Plaid transactions
CREATE TABLE public.plaid_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plaid_item_id text,
  plaid_transaction_id text UNIQUE,
  account_id text,
  cardholder_user_id uuid,
  merchant_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  plaid_category text,
  assigned_to_user_id uuid,
  status text NOT NULL DEFAULT 'unassigned',
  expense_report_id uuid,
  chart_of_accounts_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  budget_line_division text,
  description text DEFAULT '',
  receipt_url text,
  notes text,
  assignment_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.plaid_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plaid_transactions" ON public.plaid_transactions
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert plaid_transactions" ON public.plaid_transactions
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update plaid_transactions" ON public.plaid_transactions
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete plaid_transactions" ON public.plaid_transactions
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

-- Expense reports
CREATE TABLE public.expense_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  month_year text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Draft',
  submitted_at timestamp with time zone,
  approved_at timestamp with time zone,
  approved_by uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select expense_reports" ON public.expense_reports
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert expense_reports" ON public.expense_reports
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update expense_reports" ON public.expense_reports
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete expense_reports" ON public.expense_reports
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

-- Expense report comments
CREATE TABLE public.expense_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id uuid NOT NULL REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  comment_text text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select expense_report_comments" ON public.expense_report_comments
  FOR SELECT TO authenticated
  USING (expense_report_id IN (SELECT id FROM public.expense_reports WHERE org_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert expense_report_comments" ON public.expense_report_comments
  FOR INSERT TO authenticated
  WITH CHECK (expense_report_id IN (SELECT id FROM public.expense_reports WHERE org_id = get_user_organization_id(auth.uid())));

-- Chart of accounts
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_code text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  account_type text DEFAULT 'Expense',
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select chart_of_accounts" ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert chart_of_accounts" ON public.chart_of_accounts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update chart_of_accounts" ON public.chart_of_accounts
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete chart_of_accounts" ON public.chart_of_accounts
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

-- Bookkeeping contacts
CREATE TABLE public.bookkeeping_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  name text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.bookkeeping_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select bookkeeping_contacts" ON public.bookkeeping_contacts
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert bookkeeping_contacts" ON public.bookkeeping_contacts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update bookkeeping_contacts" ON public.bookkeeping_contacts
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete bookkeeping_contacts" ON public.bookkeeping_contacts
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

-- Add foreign key from plaid_transactions to chart_of_accounts
ALTER TABLE public.plaid_transactions
  ADD CONSTRAINT plaid_transactions_chart_of_accounts_id_fkey
  FOREIGN KEY (chart_of_accounts_id) REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- Add foreign key from plaid_transactions to expense_reports
ALTER TABLE public.plaid_transactions
  ADD CONSTRAINT plaid_transactions_expense_report_id_fkey
  FOREIGN KEY (expense_report_id) REFERENCES public.expense_reports(id) ON DELETE SET NULL;
