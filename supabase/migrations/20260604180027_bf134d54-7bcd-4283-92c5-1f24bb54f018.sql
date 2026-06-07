
CREATE POLICY "Org members read invoice files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Org members upload invoice files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Org members update invoice files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Org members delete invoice files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- Allow unassigned email-intake invoices to live in a special folder
CREATE POLICY "Org members manage email-intake invoice files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'email-intake'
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'email-intake'
  );
