
-- Allow org members to update organization_members within their org
CREATE POLICY "Org members can update organization_members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
