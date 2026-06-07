
CREATE TABLE public.plaid_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  connection_id uuid NOT NULL REFERENCES public.plaid_connections(id) ON DELETE CASCADE,
  plaid_account_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  mask text,
  official_name text,
  type text,
  subtype text,
  institution_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(plaid_account_id)
);

ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select plaid_accounts" ON public.plaid_accounts
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert plaid_accounts" ON public.plaid_accounts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update plaid_accounts" ON public.plaid_accounts
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete plaid_accounts" ON public.plaid_accounts
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
