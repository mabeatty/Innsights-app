
-- Create project_documents metadata table
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  folder_name text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select project_documents"
  ON public.project_documents FOR SELECT
  USING (project_id IN (
    SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
  ));

CREATE POLICY "Org members can insert project_documents"
  ON public.project_documents FOR INSERT
  WITH CHECK (project_id IN (
    SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
  ));

CREATE POLICY "Org members can delete project_documents"
  ON public.project_documents FOR DELETE
  USING (project_id IN (
    SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
  ));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('project-documents', 'project-documents', false);

-- Storage RLS: org members can upload
CREATE POLICY "Org members can upload project documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- Storage RLS: org members can read
CREATE POLICY "Org members can read project documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- Storage RLS: org members can delete
CREATE POLICY "Org members can delete project documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
