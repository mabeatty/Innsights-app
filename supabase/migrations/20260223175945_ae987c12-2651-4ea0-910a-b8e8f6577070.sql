
-- Drop all restrictive policies and recreate as permissive

-- brands
DROP POLICY "Authenticated users can read brands" ON public.brands;
CREATE POLICY "Authenticated users can read brands" ON public.brands FOR SELECT TO authenticated USING (true);

-- items
DROP POLICY "Authenticated users can read items" ON public.items;
CREATE POLICY "Authenticated users can read items" ON public.items FOR SELECT TO authenticated USING (true);

-- room_types
DROP POLICY "Authenticated users can read room_types" ON public.room_types;
CREATE POLICY "Authenticated users can read room_types" ON public.room_types FOR SELECT TO authenticated USING (true);

-- bathroom_types
DROP POLICY "Authenticated users can read bathroom_types" ON public.bathroom_types;
CREATE POLICY "Authenticated users can read bathroom_types" ON public.bathroom_types FOR SELECT TO authenticated USING (true);

-- room_type_line_items
DROP POLICY "Authenticated users can read room_type_line_items" ON public.room_type_line_items;
CREATE POLICY "Authenticated users can read room_type_line_items" ON public.room_type_line_items FOR SELECT TO authenticated USING (true);

-- bathroom_type_line_items
DROP POLICY "Authenticated users can read bathroom_type_line_items" ON public.bathroom_type_line_items;
CREATE POLICY "Authenticated users can read bathroom_type_line_items" ON public.bathroom_type_line_items FOR SELECT TO authenticated USING (true);

-- public_area_types
DROP POLICY "Authenticated users can read public_area_types" ON public.public_area_types;
CREATE POLICY "Authenticated users can read public_area_types" ON public.public_area_types FOR SELECT TO authenticated USING (true);

-- public_area_type_line_items
DROP POLICY "Authenticated users can read public_area_type_line_items" ON public.public_area_type_line_items;
CREATE POLICY "Authenticated users can read public_area_type_line_items" ON public.public_area_type_line_items FOR SELECT TO authenticated USING (true);

-- projects
DROP POLICY "Users can CRUD own projects" ON public.projects;
CREATE POLICY "Users can CRUD own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- room_matrix_entries
DROP POLICY "Users can read own room_matrix_entries" ON public.room_matrix_entries;
DROP POLICY "Users can insert own room_matrix_entries" ON public.room_matrix_entries;
DROP POLICY "Users can update own room_matrix_entries" ON public.room_matrix_entries;
DROP POLICY "Users can delete own room_matrix_entries" ON public.room_matrix_entries;
CREATE POLICY "Users can read own room_matrix_entries" ON public.room_matrix_entries FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own room_matrix_entries" ON public.room_matrix_entries FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own room_matrix_entries" ON public.room_matrix_entries FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own room_matrix_entries" ON public.room_matrix_entries FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- takeoff_line_items
DROP POLICY "Users can read own takeoff_line_items" ON public.takeoff_line_items;
DROP POLICY "Users can insert own takeoff_line_items" ON public.takeoff_line_items;
DROP POLICY "Users can update own takeoff_line_items" ON public.takeoff_line_items;
DROP POLICY "Users can delete own takeoff_line_items" ON public.takeoff_line_items;
CREATE POLICY "Users can read own takeoff_line_items" ON public.takeoff_line_items FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own takeoff_line_items" ON public.takeoff_line_items FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own takeoff_line_items" ON public.takeoff_line_items FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own takeoff_line_items" ON public.takeoff_line_items FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

-- project_public_area_items
DROP POLICY "Users can read own project_public_area_items" ON public.project_public_area_items;
DROP POLICY "Users can insert own project_public_area_items" ON public.project_public_area_items;
DROP POLICY "Users can update own project_public_area_items" ON public.project_public_area_items;
DROP POLICY "Users can delete own project_public_area_items" ON public.project_public_area_items;
CREATE POLICY "Users can read own project_public_area_items" ON public.project_public_area_items FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own project_public_area_items" ON public.project_public_area_items FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own project_public_area_items" ON public.project_public_area_items FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own project_public_area_items" ON public.project_public_area_items FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
