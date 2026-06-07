
CREATE TABLE public.quickbooks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamp with time zone NOT NULL DEFAULT now(),
  company_name text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quickbooks_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select quickbooks_connections"
  ON public.quickbooks_connections FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert quickbooks_connections"
  ON public.quickbooks_connections FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update quickbooks_connections"
  ON public.quickbooks_connections FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete quickbooks_connections"
  ON public.quickbooks_connections FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
