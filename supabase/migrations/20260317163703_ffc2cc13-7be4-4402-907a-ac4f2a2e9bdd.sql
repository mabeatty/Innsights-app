
-- Table to store consultant/third-party project access
CREATE TABLE public.consultant_project_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(member_id, project_id)
);

ALTER TABLE public.consultant_project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select consultant_project_access"
ON public.consultant_project_access FOR SELECT TO authenticated
USING (
  member_id IN (
    SELECT id FROM organization_members
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Org members can insert consultant_project_access"
ON public.consultant_project_access FOR INSERT TO authenticated
WITH CHECK (
  member_id IN (
    SELECT id FROM organization_members
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Org members can delete consultant_project_access"
ON public.consultant_project_access FOR DELETE TO authenticated
USING (
  member_id IN (
    SELECT id FROM organization_members
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

-- Helper function to check if user is a consultant
CREATE OR REPLACE FUNCTION public.is_consultant(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = _user_id
    AND expense_role = 'Consultant/Third Party'
  )
$$;

-- Helper function to get consultant's allowed project IDs
CREATE OR REPLACE FUNCTION public.get_consultant_project_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpa.project_id
  FROM consultant_project_access cpa
  JOIN organization_members om ON om.id = cpa.member_id
  WHERE om.user_id = _user_id
$$;
