
-- Schedule phases table (stores phases + sub-phases per project)
CREATE TABLE public.schedule_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  sub_phase_number TEXT NOT NULL,
  sub_phase_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schedule milestones table
CREATE TABLE public.schedule_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sub_phase_id UUID NOT NULL REFERENCES public.schedule_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  planned_date DATE,
  actual_date DATE,
  status TEXT NOT NULL DEFAULT 'Upcoming',
  notes TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.schedule_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_milestones ENABLE ROW LEVEL SECURITY;

-- RLS for schedule_phases
CREATE POLICY "Org members can select schedule_phases" ON public.schedule_phases
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert schedule_phases" ON public.schedule_phases
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update schedule_phases" ON public.schedule_phases
  FOR UPDATE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete schedule_phases" ON public.schedule_phases
  FOR DELETE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- RLS for schedule_milestones
CREATE POLICY "Org members can select schedule_milestones" ON public.schedule_milestones
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert schedule_milestones" ON public.schedule_milestones
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update schedule_milestones" ON public.schedule_milestones
  FOR UPDATE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete schedule_milestones" ON public.schedule_milestones
  FOR DELETE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Trigger for updated_at on milestones
CREATE TRIGGER update_schedule_milestones_updated_at
  BEFORE UPDATE ON public.schedule_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_schedule_phases_project ON public.schedule_phases(project_id);
CREATE INDEX idx_schedule_milestones_project ON public.schedule_milestones(project_id);
CREATE INDEX idx_schedule_milestones_subphase ON public.schedule_milestones(sub_phase_id);
