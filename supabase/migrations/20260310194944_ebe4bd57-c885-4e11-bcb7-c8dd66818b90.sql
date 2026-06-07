
CREATE OR REPLACE FUNCTION public.has_investment_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND (investment_access = true OR expense_role = 'Partner')
  )
$$;
