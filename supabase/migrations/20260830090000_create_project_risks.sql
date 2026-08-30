-- Automated, AI-detected project risks — budget overruns, schedule slippage,
-- and anything flagged in extracted weekly report content. Populated by the
-- detect-project-risks edge function, run both on-demand (triggered right
-- after a report is extracted) and on a nightly schedule (see pg_cron job
-- below), so this list stays current without anyone manually asking for it.

CREATE TABLE public.project_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  risk_type text NOT NULL CHECK (risk_type IN ('Budget', 'Schedule', 'Compliance', 'Report')),
  severity text NOT NULL DEFAULT 'Medium' CHECK (severity IN ('Low', 'Medium', 'High')),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  -- Loose reference to whatever the risk is about (a division number, a
  -- critical_path_tasks.id, a field_permits.id, etc.) — kept as text rather
  -- than a typed FK since the source table varies by risk_type.
  related_entity text DEFAULT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select project_risks" ON public.project_risks
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_risks" ON public.project_risks
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_risks" ON public.project_risks
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_risks" ON public.project_risks
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_project_risks_updated_at
  BEFORE UPDATE ON public.project_risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
