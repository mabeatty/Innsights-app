
-- Investor positions table for capital call tracking
CREATE TABLE public.investor_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  investing_entity TEXT NOT NULL DEFAULT '',
  contact_name TEXT DEFAULT '',
  ownership_pct NUMERIC NOT NULL DEFAULT 0,
  committed NUMERIC NOT NULL DEFAULT 0,
  contributed NUMERIC NOT NULL DEFAULT 0,
  distributed NUMERIC NOT NULL DEFAULT 0,
  unreturned_capital NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,
  source TEXT NOT NULL DEFAULT 'Manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select investor_positions" ON public.investor_positions
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert investor_positions" ON public.investor_positions
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update investor_positions" ON public.investor_positions
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete investor_positions" ON public.investor_positions
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
