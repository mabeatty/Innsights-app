
-- 1. Fix invoice_comments and invoice_audit_trail: scope to caller's org
DROP POLICY IF EXISTS "View comments for visible invoices" ON public.invoice_comments;
DROP POLICY IF EXISTS "Insert comments for visible invoices" ON public.invoice_comments;
CREATE POLICY "View comments for org invoices" ON public.invoice_comments
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Insert comments for org invoices" ON public.invoice_comments
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

DROP POLICY IF EXISTS "View audit trail for visible invoices" ON public.invoice_audit_trail;
DROP POLICY IF EXISTS "Insert audit trail for org invoices" ON public.invoice_audit_trail;
CREATE POLICY "View audit trail for org invoices" ON public.invoice_audit_trail
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Insert audit trail for org invoices" ON public.invoice_audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- 2. organization_members UPDATE: only admins can change role/access flags.
-- Replace blanket UPDATE policy with admin-only.
DROP POLICY IF EXISTS "Org members can update organization_members" ON public.organization_members;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND (role = 'admin' OR access_level = 'admin')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

CREATE POLICY "Admins can update organization_members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_org_admin(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_org_admin(auth.uid()));

-- 3. organizations: only see own org
DROP POLICY IF EXISTS "Allow authenticated users to read organizations" ON public.organizations;
CREATE POLICY "Members can read own organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_organization_id(auth.uid()));

-- 4. Shared catalog tables: restrict writes to admins only (these are shared global catalogs without org column)
-- brands
DROP POLICY IF EXISTS "Authenticated users can insert brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can update brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can delete brands" ON public.brands;
CREATE POLICY "Admins manage brands" ON public.brands FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- room_types
DROP POLICY IF EXISTS "Authenticated users can insert room_types" ON public.room_types;
DROP POLICY IF EXISTS "Authenticated users can update room_types" ON public.room_types;
DROP POLICY IF EXISTS "Authenticated users can delete room_types" ON public.room_types;
CREATE POLICY "Admins manage room_types" ON public.room_types FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- bathroom_types
DROP POLICY IF EXISTS "Authenticated users can insert bathroom_types" ON public.bathroom_types;
DROP POLICY IF EXISTS "Authenticated users can update bathroom_types" ON public.bathroom_types;
DROP POLICY IF EXISTS "Authenticated users can delete bathroom_types" ON public.bathroom_types;
CREATE POLICY "Admins manage bathroom_types" ON public.bathroom_types FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- room_type_line_items
DROP POLICY IF EXISTS "Authenticated users can insert room_type_line_items" ON public.room_type_line_items;
DROP POLICY IF EXISTS "Authenticated users can update room_type_line_items" ON public.room_type_line_items;
DROP POLICY IF EXISTS "Authenticated users can delete room_type_line_items" ON public.room_type_line_items;
CREATE POLICY "Admins manage room_type_line_items" ON public.room_type_line_items FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- bathroom_type_line_items
DROP POLICY IF EXISTS "Authenticated users can insert bathroom_type_line_items" ON public.bathroom_type_line_items;
DROP POLICY IF EXISTS "Authenticated users can update bathroom_type_line_items" ON public.bathroom_type_line_items;
DROP POLICY IF EXISTS "Authenticated users can delete bathroom_type_line_items" ON public.bathroom_type_line_items;
CREATE POLICY "Admins manage bathroom_type_line_items" ON public.bathroom_type_line_items FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- public_area_types
DROP POLICY IF EXISTS "Authenticated users can insert public_area_types" ON public.public_area_types;
DROP POLICY IF EXISTS "Authenticated users can update public_area_types" ON public.public_area_types;
DROP POLICY IF EXISTS "Authenticated users can delete public_area_types" ON public.public_area_types;
CREATE POLICY "Admins manage public_area_types" ON public.public_area_types FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- public_area_type_line_items
DROP POLICY IF EXISTS "Authenticated users can insert public_area_type_line_items" ON public.public_area_type_line_items;
DROP POLICY IF EXISTS "Authenticated users can update public_area_type_line_items" ON public.public_area_type_line_items;
DROP POLICY IF EXISTS "Authenticated users can delete public_area_type_line_items" ON public.public_area_type_line_items;
CREATE POLICY "Admins manage public_area_type_line_items" ON public.public_area_type_line_items FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- public_area_line_items (currently ALL true)
DROP POLICY IF EXISTS "Authenticated users can manage public area line items" ON public.public_area_line_items;
CREATE POLICY "Read public area line items" ON public.public_area_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage public area line items" ON public.public_area_line_items FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid())) WITH CHECK (public.is_org_admin(auth.uid()));

-- 5. Storage: scope email-intake invoice files to caller's org
DROP POLICY IF EXISTS "Org members manage email-intake invoice files" ON storage.objects;
CREATE POLICY "Org members manage email-intake invoice files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'email-intake'
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.pdf_path = storage.objects.name
        AND i.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = 'email-intake'
  );

-- 6. project-photos: keep bucket public (used in shared reports/lightboxes),
-- but require org ownership for writes (INSERT/DELETE).
DROP POLICY IF EXISTS "Authenticated users can upload project photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project photos" ON storage.objects;
CREATE POLICY "Org members upload project photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-photos'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
CREATE POLICY "Org members delete project photos" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- 7. generated-reports: scope all to org
DROP POLICY IF EXISTS "Org members read generated reports" ON storage.objects;
DROP POLICY IF EXISTS "Org members upload generated reports" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete generated reports" ON storage.objects;
CREATE POLICY "Org members read generated reports" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'generated-reports'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
CREATE POLICY "Org members upload generated reports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'generated-reports'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
CREATE POLICY "Org members delete generated reports" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'generated-reports'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- 8. project-reports: scope all to org
DROP POLICY IF EXISTS "Authenticated users can read project reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload project reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project reports" ON storage.objects;
CREATE POLICY "Org members read project reports" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-reports'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
CREATE POLICY "Org members upload project reports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-reports'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );
CREATE POLICY "Org members delete project reports" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-reports'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- 9. Lock down SECURITY DEFINER helper functions from anon
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_investment_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_consultant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_consultant_project_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_investment_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_consultant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_consultant_project_ids(uuid) TO authenticated;
