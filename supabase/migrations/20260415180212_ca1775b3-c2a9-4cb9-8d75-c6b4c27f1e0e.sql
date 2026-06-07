
CREATE TABLE public.internal_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  link TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select internal_documents"
  ON public.internal_documents FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert internal_documents"
  ON public.internal_documents FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update internal_documents"
  ON public.internal_documents FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete internal_documents"
  ON public.internal_documents FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE TRIGGER update_internal_documents_updated_at
  BEFORE UPDATE ON public.internal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
