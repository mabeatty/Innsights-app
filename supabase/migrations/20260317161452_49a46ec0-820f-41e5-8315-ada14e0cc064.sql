
-- Photo albums table
CREATE TABLE public.photo_albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

ALTER TABLE public.photo_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select photo_albums" ON public.photo_albums
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert photo_albums" ON public.photo_albums
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update photo_albums" ON public.photo_albums
  FOR UPDATE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete photo_albums" ON public.photo_albums
  FOR DELETE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Photo album photos table
CREATE TABLE public.photo_album_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID NOT NULL
);

ALTER TABLE public.photo_album_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select photo_album_photos" ON public.photo_album_photos
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert photo_album_photos" ON public.photo_album_photos
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete photo_album_photos" ON public.photo_album_photos
  FOR DELETE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Weekly reports table
CREATE TABLE public.weekly_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date_range_start DATE NOT NULL DEFAULT CURRENT_DATE,
  date_range_end DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select weekly_reports" ON public.weekly_reports
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert weekly_reports" ON public.weekly_reports
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update weekly_reports" ON public.weekly_reports
  FOR UPDATE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete weekly_reports" ON public.weekly_reports
  FOR DELETE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Weekly report comments table
CREATE TABLE public.weekly_report_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select weekly_report_comments" ON public.weekly_report_comments
  FOR SELECT USING (report_id IN (
    SELECT id FROM weekly_reports WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

CREATE POLICY "Org members can insert weekly_report_comments" ON public.weekly_report_comments
  FOR INSERT WITH CHECK (report_id IN (
    SELECT id FROM weekly_reports WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

CREATE POLICY "Org members can delete weekly_report_comments" ON public.weekly_report_comments
  FOR DELETE USING (report_id IN (
    SELECT id FROM weekly_reports WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

-- Storage bucket for project photos
INSERT INTO storage.buckets (id, name, public) VALUES ('project-photos', 'project-photos', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload project photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-photos');

CREATE POLICY "Anyone can view project photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-photos');

CREATE POLICY "Authenticated users can delete project photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-photos');

-- Triggers for updated_at
CREATE TRIGGER update_photo_albums_updated_at BEFORE UPDATE ON public.photo_albums
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_reports_updated_at BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
