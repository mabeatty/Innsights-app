
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create project_info table
CREATE TABLE public.project_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  property_name TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  project_type TEXT CHECK (project_type IN ('New Construction', 'Renovation', 'Conversion')),
  project_status TEXT CHECK (project_status IN ('Prospecting', 'Under Contract', 'In Design', 'In Procurement', 'Under Construction', 'Open')),
  total_room_count INTEGER,
  target_opening_date DATE,
  owner_name TEXT,
  owner_email TEXT,
  general_contractor TEXT,
  architect TEXT,
  interior_designer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select project_info"
ON public.project_info FOR SELECT
USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert project_info"
ON public.project_info FOR INSERT
WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update project_info"
ON public.project_info FOR UPDATE
USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete project_info"
ON public.project_info FOR DELETE
USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER update_project_info_updated_at
BEFORE UPDATE ON public.project_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
