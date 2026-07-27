-- Cross-project vendor pricing library
-- catalog_items: canonical items with synonyms for matching vendor wording
-- vendor_pricing: atomic price records (vendor x item x project) with source
CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  category text,
  synonyms text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, canonical_name)
);
CREATE TABLE public.vendor_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  global_vendor_id uuid REFERENCES public.global_vendors(id) ON DELETE SET NULL,
  vendor_name text NOT NULL,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  project_label text, brand text, scope text, raw_description text,
  quantity numeric, unit text, unit_price numeric, gross_price numeric,
  price_text text, source_doc text, source_url text, price_date date,
  status text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_items_org ON public.catalog_items(org_id);
CREATE INDEX idx_vendor_pricing_org ON public.vendor_pricing(org_id);
CREATE INDEX idx_vendor_pricing_item ON public.vendor_pricing(catalog_item_id);
CREATE INDEX idx_vendor_pricing_vendor ON public.vendor_pricing(global_vendor_id);
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members select catalog_items" ON public.catalog_items FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members insert catalog_items" ON public.catalog_items FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members update catalog_items" ON public.catalog_items FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members delete catalog_items" ON public.catalog_items FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members select vendor_pricing" ON public.vendor_pricing FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members insert vendor_pricing" ON public.vendor_pricing FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members update vendor_pricing" ON public.vendor_pricing FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members delete vendor_pricing" ON public.vendor_pricing FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_catalog_items_updated_at BEFORE UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_vendor_pricing_updated_at BEFORE UPDATE ON public.vendor_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
