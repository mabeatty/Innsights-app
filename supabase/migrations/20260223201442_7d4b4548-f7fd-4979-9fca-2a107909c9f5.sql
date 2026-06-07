
-- Create takeoff_versions table
CREATE TABLE public.takeoff_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.takeoff_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own takeoff_versions"
  ON public.takeoff_versions FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own takeoff_versions"
  ON public.takeoff_versions FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own takeoff_versions"
  ON public.takeoff_versions FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Add takeoff_version_id to takeoff_line_items
ALTER TABLE public.takeoff_line_items
  ADD COLUMN takeoff_version_id UUID REFERENCES public.takeoff_versions(id) ON DELETE CASCADE;

-- Add takeoff_version_id to project_public_area_items
ALTER TABLE public.project_public_area_items
  ADD COLUMN takeoff_version_id UUID REFERENCES public.takeoff_versions(id) ON DELETE CASCADE;
