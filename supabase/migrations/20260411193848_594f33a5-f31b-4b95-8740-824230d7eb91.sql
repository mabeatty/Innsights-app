
CREATE TABLE public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (org_id, integration_key)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert integrations"
  ON public.integrations FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update integrations"
  ON public.integrations FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete integrations"
  ON public.integrations FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
