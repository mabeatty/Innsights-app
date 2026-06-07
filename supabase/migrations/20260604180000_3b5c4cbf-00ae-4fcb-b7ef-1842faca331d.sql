
-- INVOICES TABLE
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  vendor_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  amount NUMERIC(14,2),
  partial_approved_amount NUMERIC(14,2),
  type TEXT,
  budget_line_item TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  submitted_by UUID,
  submitted_by_email TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  more_info_request TEXT,
  notes TEXT,
  pdf_url TEXT,
  pdf_path TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  routed_to UUID,
  routed_to_email TEXT,
  routed_at TIMESTAMPTZ,
  ai_extracted_fields JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      NOT public.is_consultant(auth.uid())
      OR (project_id IS NOT NULL AND project_id IN (SELECT public.get_consultant_project_ids(auth.uid())))
    )
  );

CREATE POLICY "Org members insert invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members update invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org members delete invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE INDEX idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX idx_invoices_project ON public.invoices(project_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUDIT TRAIL
CREATE TABLE public.invoice_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID,
  performed_by_name TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.invoice_audit_trail TO authenticated;
GRANT ALL ON public.invoice_audit_trail TO service_role;

ALTER TABLE public.invoice_audit_trail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View audit trail for visible invoices"
  ON public.invoice_audit_trail FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices));

CREATE POLICY "Insert audit trail for org invoices"
  ON public.invoice_audit_trail FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices));

CREATE INDEX idx_invoice_audit_invoice ON public.invoice_audit_trail(invoice_id, created_at DESC);

-- COMMENTS
CREATE TABLE public.invoice_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  author_id UUID,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.invoice_comments TO authenticated;
GRANT ALL ON public.invoice_comments TO service_role;

ALTER TABLE public.invoice_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View comments for visible invoices"
  ON public.invoice_comments FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices));

CREATE POLICY "Insert comments for visible invoices"
  ON public.invoice_comments FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices));

CREATE POLICY "Delete own comments"
  ON public.invoice_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE INDEX idx_invoice_comments_invoice ON public.invoice_comments(invoice_id, created_at);
