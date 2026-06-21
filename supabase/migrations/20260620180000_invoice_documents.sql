-- Supporting-document attachments for invoices/draws (signed pay apps, lien
-- waivers, photos, etc.). Files are stored in the 'invoices' storage bucket
-- under {project_id}/{invoice_id}/supporting/ and indexed here.
CREATE TABLE IF NOT EXISTS public.invoice_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  storage_path text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_documents_invoice_id
  ON public.invoice_documents(invoice_id);

ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

-- View/download: anyone with access to the invoice's org.
CREATE POLICY "Org members can select invoice_documents" ON public.invoice_documents
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- Upload: edit/admin members of the invoice's org.
CREATE POLICY "Edit members can insert invoice_documents" ON public.invoice_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = public.get_user_organization_id(auth.uid())
        AND om.access_level IN ('edit', 'admin')
    )
  );

-- Delete: edit/admin members of the invoice's org.
CREATE POLICY "Edit members can delete invoice_documents" ON public.invoice_documents
  FOR DELETE TO authenticated
  USING (
    invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = public.get_user_organization_id(auth.uid())
        AND om.access_level IN ('edit', 'admin')
    )
  );

GRANT SELECT, INSERT, DELETE ON public.invoice_documents TO authenticated;
GRANT ALL ON public.invoice_documents TO service_role;
