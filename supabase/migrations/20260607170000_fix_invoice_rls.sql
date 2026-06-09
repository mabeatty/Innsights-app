-- ============================================================================
-- fix: invoice upload RLS — reset the entire upload-chain insert policies to
-- known-good definitions (invoices, invoice_approvals, invoice_audit_trail) and
-- the storage policies for the 'invoices' bucket. Idempotent (DROP IF EXISTS).
--
-- Diagnosis: org membership, project org, and get_user_organization_id() are all
-- consistent, so the org check itself is correct. The "new row violates RLS"
-- error comes from a policy in the upload chain — most likely the storage bucket
-- upload policy (which runs first). This bulletproofs the whole path.
-- ============================================================================

-- Ensure the storage bucket exists (no-op if it already does).
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- ---- invoices: insert by org members ----------------------------------------
DROP POLICY IF EXISTS "Org members insert invoices" ON public.invoices;
CREATE POLICY "Org members insert invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- ---- invoice_approvals: select + insert by org members ----------------------
DROP POLICY IF EXISTS "Org members can select invoice_approvals" ON public.invoice_approvals;
CREATE POLICY "Org members can select invoice_approvals" ON public.invoice_approvals
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

DROP POLICY IF EXISTS "Org members can insert invoice_approvals" ON public.invoice_approvals;
CREATE POLICY "Org members can insert invoice_approvals" ON public.invoice_approvals
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- ---- invoice_audit_trail: insert for org invoices ---------------------------
DROP POLICY IF EXISTS "Insert audit trail for org invoices" ON public.invoice_audit_trail;
CREATE POLICY "Insert audit trail for org invoices" ON public.invoice_audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- ---- storage: invoices bucket upload + read ---------------------------------
-- Object path is '<project_id>/<filename>', so the first path segment must be a
-- project in the caller's organization.
DROP POLICY IF EXISTS "Org members upload invoice files" ON storage.objects;
CREATE POLICY "Org members upload invoice files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members read invoice files" ON storage.objects;
CREATE POLICY "Org members read invoice files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );
