
CREATE TABLE public.pre_development_budget (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  line_item text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  budget_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_development_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select pre_development_budget"
  ON public.pre_development_budget FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert pre_development_budget"
  ON public.pre_development_budget FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update pre_development_budget"
  ON public.pre_development_budget FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete pre_development_budget"
  ON public.pre_development_budget FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
