
-- Create storage bucket for project reports
INSERT INTO storage.buckets (id, name, public) VALUES ('project-reports', 'project-reports', false);

-- Storage policies for project-reports bucket
CREATE POLICY "Authenticated users can upload project reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-reports');

CREATE POLICY "Authenticated users can read project reports"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-reports');

CREATE POLICY "Authenticated users can delete project reports"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-reports');

-- Create attachments table
CREATE TABLE public.weekly_report_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  storage_path text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_report_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select weekly_report_attachments"
ON public.weekly_report_attachments FOR SELECT
USING (project_id IN (SELECT projects.id FROM projects WHERE projects.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert weekly_report_attachments"
ON public.weekly_report_attachments FOR INSERT
WITH CHECK (project_id IN (SELECT projects.id FROM projects WHERE projects.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete weekly_report_attachments"
ON public.weekly_report_attachments FOR DELETE
USING (project_id IN (SELECT projects.id FROM projects WHERE projects.organization_id = get_user_organization_id(auth.uid())));
