
-- Storage bucket for generated reports
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-reports', 'generated-reports', false);

-- Storage policies for generated-reports bucket
CREATE POLICY "Org members can upload generated reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'generated-reports');

CREATE POLICY "Org members can read generated reports"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'generated-reports');

CREATE POLICY "Org members can delete generated reports"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'generated-reports');

-- Log of generated reports
CREATE TABLE public.generated_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  generated_by uuid NOT NULL,
  report_period_start date NOT NULL,
  report_period_end date NOT NULL,
  delivery_method text NOT NULL DEFAULT 'download',
  recipients text[] DEFAULT '{}',
  storage_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select generated_reports"
ON public.generated_reports FOR SELECT TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can insert generated_reports"
ON public.generated_reports FOR INSERT TO authenticated
WITH CHECK (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can delete generated_reports"
ON public.generated_reports FOR DELETE TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

-- Scheduled report configuration per project
CREATE TABLE public.scheduled_report_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  day_of_month integer NOT NULL DEFAULT 1,
  recipients text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_report_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select scheduled_report_config"
ON public.scheduled_report_config FOR SELECT TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can insert scheduled_report_config"
ON public.scheduled_report_config FOR INSERT TO authenticated
WITH CHECK (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can update scheduled_report_config"
ON public.scheduled_report_config FOR UPDATE TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can delete scheduled_report_config"
ON public.scheduled_report_config FOR DELETE TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));
