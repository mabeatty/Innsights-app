
DROP POLICY IF EXISTS "Org members can select investor_positions" ON public.investor_positions;
CREATE POLICY "Org members with investment access can select investor_positions"
ON public.investor_positions FOR SELECT TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  AND has_investment_access(auth.uid())
);

DROP POLICY IF EXISTS "Org members can insert investor_positions" ON public.investor_positions;
CREATE POLICY "Org members with investment access can insert investor_positions"
ON public.investor_positions FOR INSERT TO authenticated
WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  AND has_investment_access(auth.uid())
);

DROP POLICY IF EXISTS "Org members can update investor_positions" ON public.investor_positions;
CREATE POLICY "Org members with investment access can update investor_positions"
ON public.investor_positions FOR UPDATE TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  AND has_investment_access(auth.uid())
);

DROP POLICY IF EXISTS "Org members can delete investor_positions" ON public.investor_positions;
CREATE POLICY "Org members with investment access can delete investor_positions"
ON public.investor_positions FOR DELETE TO authenticated
USING (
  project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  AND has_investment_access(auth.uid())
);
