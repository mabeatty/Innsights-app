
-- Enable RLS on organization_members and organizations (they already have policies but RLS wasn't enabled)
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Add org-scoped read policy for organization_members
CREATE POLICY "Org members can read own org members"
ON public.organization_members FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));
