
-- Create vendor_bid_items table
CREATE TABLE public.vendor_bid_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  segment TEXT NOT NULL,
  item_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_bid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select vendor_bid_items" ON public.vendor_bid_items
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert vendor_bid_items" ON public.vendor_bid_items
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update vendor_bid_items" ON public.vendor_bid_items
  FOR UPDATE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete vendor_bid_items" ON public.vendor_bid_items
  FOR DELETE USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- Create vendor_quotes table
CREATE TABLE public.vendor_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_item_id UUID NOT NULL REFERENCES public.vendor_bid_items(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  round_1_ref TEXT,
  round_1_url TEXT,
  round_1_amount NUMERIC,
  round_2_ref TEXT,
  round_2_url TEXT,
  round_2_amount NUMERIC,
  round_3_ref TEXT,
  round_3_url TEXT,
  round_3_amount NUMERIC,
  round_4_ref TEXT,
  round_4_url TEXT,
  round_4_amount NUMERIC,
  final_quote_amount NUMERIC,
  vendor_status TEXT NOT NULL DEFAULT 'Pending',
  award_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select vendor_quotes" ON public.vendor_quotes
  FOR SELECT USING (bid_item_id IN (SELECT id FROM vendor_bid_items WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can insert vendor_quotes" ON public.vendor_quotes
  FOR INSERT WITH CHECK (bid_item_id IN (SELECT id FROM vendor_bid_items WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can update vendor_quotes" ON public.vendor_quotes
  FOR UPDATE USING (bid_item_id IN (SELECT id FROM vendor_bid_items WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can delete vendor_quotes" ON public.vendor_quotes
  FOR DELETE USING (bid_item_id IN (SELECT id FROM vendor_bid_items WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));

-- Trigger to update updated_at on vendor_quotes
CREATE TRIGGER update_vendor_quotes_updated_at
  BEFORE UPDATE ON public.vendor_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
