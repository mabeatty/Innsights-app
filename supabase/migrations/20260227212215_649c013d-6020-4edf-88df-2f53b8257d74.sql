
-- Create project_budget table
CREATE TABLE public.project_budget (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  division_number TEXT NOT NULL,
  division_name TEXT NOT NULL,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('hard', 'soft')),
  scheduled_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint per project + division
ALTER TABLE public.project_budget ADD CONSTRAINT project_budget_project_division_unique UNIQUE (project_id, division_number);

-- Enable RLS
ALTER TABLE public.project_budget ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to organization
CREATE POLICY "Org members can select project_budget"
  ON public.project_budget FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert project_budget"
  ON public.project_budget FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update project_budget"
  ON public.project_budget FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete project_budget"
  ON public.project_budget FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Trigger to auto-update updated_at
CREATE TRIGGER update_project_budget_updated_at
  BEFORE UPDATE ON public.project_budget
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
