
-- Helper function to get user's organization_id (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Drop existing project policy
DROP POLICY IF EXISTS "Users can CRUD own projects" ON public.projects;

-- New org-scoped policies for projects
CREATE POLICY "Org members can select projects"
ON public.projects FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update projects"
ON public.projects FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete projects"
ON public.projects FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Update project-scoped tables to work with org-scoped projects
-- (Their existing RLS checks project ownership via projects.user_id, 
--  but now we need them to check via org membership instead)

-- takeoff_line_items
DROP POLICY IF EXISTS "Users can read own takeoff_line_items" ON public.takeoff_line_items;
DROP POLICY IF EXISTS "Users can insert own takeoff_line_items" ON public.takeoff_line_items;
DROP POLICY IF EXISTS "Users can update own takeoff_line_items" ON public.takeoff_line_items;
DROP POLICY IF EXISTS "Users can delete own takeoff_line_items" ON public.takeoff_line_items;

CREATE POLICY "Org members can read takeoff_line_items" ON public.takeoff_line_items FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert takeoff_line_items" ON public.takeoff_line_items FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update takeoff_line_items" ON public.takeoff_line_items FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete takeoff_line_items" ON public.takeoff_line_items FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- takeoff_versions
DROP POLICY IF EXISTS "Users can read own takeoff_versions" ON public.takeoff_versions;
DROP POLICY IF EXISTS "Users can insert own takeoff_versions" ON public.takeoff_versions;
DROP POLICY IF EXISTS "Users can delete own takeoff_versions" ON public.takeoff_versions;

CREATE POLICY "Org members can read takeoff_versions" ON public.takeoff_versions FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert takeoff_versions" ON public.takeoff_versions FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete takeoff_versions" ON public.takeoff_versions FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- room_matrix_entries
DROP POLICY IF EXISTS "Users can read own room_matrix_entries" ON public.room_matrix_entries;
DROP POLICY IF EXISTS "Users can insert own room_matrix_entries" ON public.room_matrix_entries;
DROP POLICY IF EXISTS "Users can update own room_matrix_entries" ON public.room_matrix_entries;
DROP POLICY IF EXISTS "Users can delete own room_matrix_entries" ON public.room_matrix_entries;

CREATE POLICY "Org members can read room_matrix_entries" ON public.room_matrix_entries FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert room_matrix_entries" ON public.room_matrix_entries FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update room_matrix_entries" ON public.room_matrix_entries FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete room_matrix_entries" ON public.room_matrix_entries FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- project_public_area_items
DROP POLICY IF EXISTS "Users can read own project_public_area_items" ON public.project_public_area_items;
DROP POLICY IF EXISTS "Users can insert own project_public_area_items" ON public.project_public_area_items;
DROP POLICY IF EXISTS "Users can update own project_public_area_items" ON public.project_public_area_items;
DROP POLICY IF EXISTS "Users can delete own project_public_area_items" ON public.project_public_area_items;

CREATE POLICY "Org members can read project_public_area_items" ON public.project_public_area_items FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_public_area_items" ON public.project_public_area_items FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_public_area_items" ON public.project_public_area_items FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_public_area_items" ON public.project_public_area_items FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
