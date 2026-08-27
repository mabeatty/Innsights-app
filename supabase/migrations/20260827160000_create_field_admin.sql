-- Field Admin: Permits, Submittals, Shop Drawings, and RFIs.
-- Four separate tables (each with fields fitting its own real-world
-- workflow) sharing a common is_open flag so items can be marked
-- resolved/completed or flagged as open across all four types uniformly.

-- ── Permits ──
CREATE TABLE public.field_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  permit_name text NOT NULL DEFAULT '',
  permit_type text DEFAULT NULL,
  jurisdiction text DEFAULT NULL,
  responsible_party text DEFAULT NULL,
  submitted_date date DEFAULT NULL,
  status text NOT NULL DEFAULT 'Not Submitted' CHECK (status IN ('Not Submitted', 'Submitted', 'Under Review', 'Approved', 'Rejected')),
  inspection_status text DEFAULT NULL CHECK (inspection_status IS NULL OR inspection_status IN ('Not Scheduled', 'Scheduled', 'Passed', 'Failed')),
  expiration_date date DEFAULT NULL,
  document_url text DEFAULT NULL,
  notes text DEFAULT NULL,
  is_open boolean NOT NULL DEFAULT true,
  resolved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.field_permits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select field_permits" ON public.field_permits
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert field_permits" ON public.field_permits
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update field_permits" ON public.field_permits
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete field_permits" ON public.field_permits
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_field_permits_updated_at
  BEFORE UPDATE ON public.field_permits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Submittals ──
CREATE TABLE public.field_submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  submittal_name text NOT NULL DEFAULT '',
  spec_section text DEFAULT NULL,
  submitted_by text DEFAULT NULL,
  reviewer text DEFAULT NULL,
  submitted_date date DEFAULT NULL,
  due_date date DEFAULT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Approved as Noted', 'Rejected', 'Resubmit Required')),
  document_url text DEFAULT NULL,
  notes text DEFAULT NULL,
  is_open boolean NOT NULL DEFAULT true,
  resolved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.field_submittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select field_submittals" ON public.field_submittals
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert field_submittals" ON public.field_submittals
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update field_submittals" ON public.field_submittals
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete field_submittals" ON public.field_submittals
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_field_submittals_updated_at
  BEFORE UPDATE ON public.field_submittals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Shop Drawings ──
CREATE TABLE public.field_shop_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_name text NOT NULL DEFAULT '',
  trade text DEFAULT NULL,
  revision_number text DEFAULT NULL,
  submitted_date date DEFAULT NULL,
  due_date date DEFAULT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Approved as Noted', 'Rejected', 'Resubmit Required')),
  document_url text DEFAULT NULL,
  notes text DEFAULT NULL,
  is_open boolean NOT NULL DEFAULT true,
  resolved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.field_shop_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select field_shop_drawings" ON public.field_shop_drawings
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert field_shop_drawings" ON public.field_shop_drawings
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update field_shop_drawings" ON public.field_shop_drawings
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete field_shop_drawings" ON public.field_shop_drawings
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_field_shop_drawings_updated_at
  BEFORE UPDATE ON public.field_shop_drawings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RFIs ──
CREATE TABLE public.field_rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rfi_number text DEFAULT NULL,
  subject text NOT NULL DEFAULT '',
  submitted_by text DEFAULT NULL,
  submitted_to text DEFAULT NULL,
  submitted_date date DEFAULT NULL,
  response_date date DEFAULT NULL,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Answered', 'Closed')),
  response_summary text DEFAULT NULL,
  document_url text DEFAULT NULL,
  notes text DEFAULT NULL,
  is_open boolean NOT NULL DEFAULT true,
  resolved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.field_rfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select field_rfis" ON public.field_rfis
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert field_rfis" ON public.field_rfis
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update field_rfis" ON public.field_rfis
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete field_rfis" ON public.field_rfis
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_field_rfis_updated_at
  BEFORE UPDATE ON public.field_rfis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
