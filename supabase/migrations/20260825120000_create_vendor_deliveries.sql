-- Vendor delivery / logistics tracking for the Procurement tab
-- Covers both equipment/container rentals (e.g. Mobile Mini, Sunbelt) and
-- general vendor deliveries (FF&E, materials).

CREATE TABLE public.vendor_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.global_vendors(id) ON DELETE SET NULL,
  vendor_name text NOT NULL DEFAULT '',
  delivery_type text NOT NULL DEFAULT 'Delivery' CHECK (delivery_type IN ('Delivery', 'Rental')),
  item_description text NOT NULL DEFAULT '',
  unit_number text DEFAULT NULL,
  contract_number text DEFAULT NULL,
  requested_date date DEFAULT NULL,
  delivery_date date DEFAULT NULL,
  pickup_date date DEFAULT NULL,
  cost numeric DEFAULT NULL,
  status text NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Scheduled', 'Delivered', 'Picked Up', 'Cancelled')),
  agreement_url text DEFAULT NULL,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select vendor_deliveries" ON public.vendor_deliveries
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert vendor_deliveries" ON public.vendor_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update vendor_deliveries" ON public.vendor_deliveries
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete vendor_deliveries" ON public.vendor_deliveries
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_vendor_deliveries_updated_at
  BEFORE UPDATE ON public.vendor_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
