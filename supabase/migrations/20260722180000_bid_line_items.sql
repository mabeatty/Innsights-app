-- Atomic bid line items: one vendor SKU per row, with unit price.
CREATE TABLE public.bid_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  global_vendor_id uuid REFERENCES public.global_vendors(id) ON DELETE SET NULL,
  vendor_name text NOT NULL,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  item_name text, category text, raw_description text,
  quantity numeric, unit text, unit_price numeric, ext_price numeric,
  room_type text, project_label text, brand text, price_basis text,
  source_doc text, source_url text, status text,
  marriott_control text, marriott_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bli_org ON public.bid_line_items(org_id);
CREATE INDEX idx_bli_item ON public.bid_line_items(catalog_item_id);
CREATE INDEX idx_bli_vendor ON public.bid_line_items(global_vendor_id);
ALTER TABLE public.bid_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org select bli" ON public.bid_line_items FOR SELECT TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org insert bli" ON public.bid_line_items FOR INSERT TO authenticated WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org update bli" ON public.bid_line_items FOR UPDATE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org delete bli" ON public.bid_line_items FOR DELETE TO authenticated USING (org_id = get_user_organization_id(auth.uid()));
CREATE TRIGGER set_bli_updated_at BEFORE UPDATE ON public.bid_line_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
