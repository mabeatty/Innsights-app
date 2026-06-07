
CREATE TABLE public.global_vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  category TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  markets TEXT,
  notes TEXT,
  performance_rating INTEGER NOT NULL DEFAULT 0 CHECK (performance_rating >= 0 AND performance_rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.global_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select global_vendors"
  ON public.global_vendors FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert global_vendors"
  ON public.global_vendors FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update global_vendors"
  ON public.global_vendors FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete global_vendors"
  ON public.global_vendors FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE TRIGGER update_global_vendors_updated_at
  BEFORE UPDATE ON public.global_vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.global_vendor_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES public.global_vendors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, project_id)
);

ALTER TABLE public.global_vendor_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select global_vendor_projects"
  ON public.global_vendor_projects FOR SELECT TO authenticated
  USING (vendor_id IN (SELECT id FROM public.global_vendors WHERE org_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert global_vendor_projects"
  ON public.global_vendor_projects FOR INSERT TO authenticated
  WITH CHECK (vendor_id IN (SELECT id FROM public.global_vendors WHERE org_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete global_vendor_projects"
  ON public.global_vendor_projects FOR DELETE TO authenticated
  USING (vendor_id IN (SELECT id FROM public.global_vendors WHERE org_id = get_user_organization_id(auth.uid())));
