-- Per-line-item retainage on invoices.
-- Each invoice can have multiple division/category lines, each with its own
-- amount, retainage, and net. Invoice-level totals are the sum of these rows.
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  category text,
  amount numeric(12,2) DEFAULT 0,
  retainage_amount numeric(12,2) DEFAULT 0,
  net_amount numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON public.invoice_line_items(invoice_id);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Read by anyone in the invoice's org.
CREATE POLICY "Org members can select invoice_line_items" ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- Insert allowed for org members (rows are created at upload time).
CREATE POLICY "Org members can insert invoice_line_items" ON public.invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- Update / delete allowed for org members.
CREATE POLICY "Org members can update invoice_line_items" ON public.invoice_line_items
  FOR UPDATE TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete invoice_line_items" ON public.invoice_line_items
  FOR DELETE TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
