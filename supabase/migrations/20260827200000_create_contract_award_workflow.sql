-- Award-to-contract workflow: reusable org-wide PO/Subcontract templates,
-- and per-award draft records tracking the AI-extraction → PM review →
-- document generation → send → execute pipeline.

-- ── Contract Templates (org-wide, not per-project) ──
CREATE TABLE public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('PO', 'Subcontract')),
  template_name text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  file_path text DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select contract_templates" ON public.contract_templates
  FOR SELECT TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert contract_templates" ON public.contract_templates
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update contract_templates" ON public.contract_templates
  FOR UPDATE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()))
  WITH CHECK (org_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete contract_templates" ON public.contract_templates
  FOR DELETE TO authenticated
  USING (org_id = get_user_organization_id(auth.uid()));

CREATE TRIGGER set_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Contract Drafts (per-project, one per awarded bid item) ──
CREATE TABLE public.contract_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_bid_item_id uuid REFERENCES public.vendor_bid_items(id) ON DELETE SET NULL,
  vendor_quote_id uuid REFERENCES public.vendor_quotes(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Awaiting Draft' CHECK (status IN (
    'Awaiting Draft', 'Draft Ready', 'Under PM Review', 'Ready to Generate',
    'Sent for Execution', 'Executed', 'Cancelled'
  )),
  -- AI-extracted terms, reviewed/edited by the PM before document generation.
  vendor_name text DEFAULT NULL,
  contract_amount numeric DEFAULT NULL,
  scope_of_work text DEFAULT NULL,
  start_date date DEFAULT NULL,
  completion_date date DEFAULT NULL,
  payment_terms text DEFAULT NULL,
  special_terms text DEFAULT NULL,
  extracted_at timestamptz DEFAULT NULL,
  reviewed_by uuid DEFAULT NULL,
  reviewed_at timestamptz DEFAULT NULL,
  -- The final populated document, once generated and uploaded.
  final_document_url text DEFAULT NULL,
  sent_at timestamptz DEFAULT NULL,
  executed_at timestamptz DEFAULT NULL,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select contract_drafts" ON public.contract_drafts
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert contract_drafts" ON public.contract_drafts
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update contract_drafts" ON public.contract_drafts
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete contract_drafts" ON public.contract_drafts
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_contract_drafts_updated_at
  BEFORE UPDATE ON public.contract_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
