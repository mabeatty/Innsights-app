
-- Create enums
CREATE TYPE public.item_category AS ENUM ('Furniture', 'Softgoods', 'Lighting', 'Artwork & Window Treatments', 'Bathroom', 'Equipment');
CREATE TYPE public.project_status AS ENUM ('Draft', 'Complete');

-- Brands
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE
);

-- Items
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  item_number TEXT NOT NULL,
  category public.item_category NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  unit TEXT NOT NULL DEFAULT 'EA',
  unit_price NUMERIC NOT NULL DEFAULT 0
);

-- Room types
CREATE TABLE public.room_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);

-- Bathroom types
CREATE TABLE public.bathroom_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);

-- Room type line items
CREATE TABLE public.room_type_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_per_room INTEGER NOT NULL DEFAULT 1
);

-- Bathroom type line items
CREATE TABLE public.bathroom_type_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bathroom_type_id UUID NOT NULL REFERENCES public.bathroom_types(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_per_room INTEGER NOT NULL DEFAULT 1
);

-- Public area types
CREATE TABLE public.public_area_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);

-- Public area type line items
CREATE TABLE public.public_area_type_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  public_area_type_id UUID NOT NULL REFERENCES public.public_area_types(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1
);

-- Projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  status public.project_status NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Room matrix entries
CREATE TABLE public.room_matrix_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  bathroom_type_id UUID NOT NULL REFERENCES public.bathroom_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0
);

-- Takeoff line items
CREATE TABLE public.takeoff_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.room_types(id) ON DELETE SET NULL,
  bathroom_type_id UUID REFERENCES public.bathroom_types(id) ON DELETE SET NULL,
  quantity_required INTEGER NOT NULL DEFAULT 0,
  adjusted_quantity INTEGER,
  notes TEXT,
  last_modified TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Project public area items
CREATE TABLE public.project_public_area_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  public_area_type_id UUID NOT NULL REFERENCES public.public_area_types(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_required INTEGER NOT NULL DEFAULT 0,
  adjusted_quantity INTEGER,
  notes TEXT,
  last_modified TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS policies
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bathroom_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bathroom_type_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_area_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_area_type_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_matrix_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_public_area_items ENABLE ROW LEVEL SECURITY;

-- Reference tables: readable by authenticated users
CREATE POLICY "Authenticated users can read brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read items" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read room_types" ON public.room_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read bathroom_types" ON public.bathroom_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read room_type_line_items" ON public.room_type_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read bathroom_type_line_items" ON public.bathroom_type_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read public_area_types" ON public.public_area_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read public_area_type_line_items" ON public.public_area_type_line_items FOR SELECT TO authenticated USING (true);

-- User-owned tables: full access for own data
CREATE POLICY "Users can CRUD own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own room_matrix_entries" ON public.room_matrix_entries FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own room_matrix_entries" ON public.room_matrix_entries FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own room_matrix_entries" ON public.room_matrix_entries FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own room_matrix_entries" ON public.room_matrix_entries FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can read own takeoff_line_items" ON public.takeoff_line_items FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own takeoff_line_items" ON public.takeoff_line_items FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own takeoff_line_items" ON public.takeoff_line_items FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own takeoff_line_items" ON public.takeoff_line_items FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can read own project_public_area_items" ON public.project_public_area_items FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own project_public_area_items" ON public.project_public_area_items FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own project_public_area_items" ON public.project_public_area_items FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own project_public_area_items" ON public.project_public_area_items FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
