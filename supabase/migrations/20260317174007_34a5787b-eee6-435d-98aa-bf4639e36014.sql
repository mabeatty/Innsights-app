
-- Store per-project report content configuration
CREATE TABLE public.report_content_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  include_project_overview boolean NOT NULL DEFAULT true,
  include_schedule_summary boolean NOT NULL DEFAULT true,
  include_budget_vs_actual boolean NOT NULL DEFAULT true,
  include_draw_status boolean NOT NULL DEFAULT true,
  include_cash_planning boolean NOT NULL DEFAULT true,
  include_weekly_summaries boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

ALTER TABLE public.report_content_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select report_content_config"
ON public.report_content_config FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert report_content_config"
ON public.report_content_config FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update report_content_config"
ON public.report_content_config FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete report_content_config"
ON public.report_content_config FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
