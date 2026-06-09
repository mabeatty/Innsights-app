-- ============================================================================
-- Invoice Intake & Approval module (Stages 1–2)
-- Reconciled to the existing schema: `invoices` and `invoice_comments` already
-- exist, so we ALTER `invoices` and CREATE the two new approval-chain tables.
-- ============================================================================

-- 1. Add cost_type to the existing invoices table -----------------------------
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cost_type text;
-- (vendor_name, invoice_number, invoice_date, amount, budget_line_item, status,
--  submitted_by, pdf_url, notes, etc. already exist on public.invoices.)

-- 2. Per-project approver assignments -----------------------------------------
CREATE TABLE IF NOT EXISTS public.project_approvers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('project_manager', 'treasury', 'project_lead')),
  approver_id  uuid,                       -- references an auth user (no FK; users live in auth schema)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_approvers_project_role_unique UNIQUE (project_id, role)
);

CREATE INDEX IF NOT EXISTS idx_project_approvers_project ON public.project_approvers(project_id);

ALTER TABLE public.project_approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select project_approvers" ON public.project_approvers
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_approvers" ON public.project_approvers
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_approvers" ON public.project_approvers
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_approvers" ON public.project_approvers
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

CREATE TRIGGER update_project_approvers_updated_at
  BEFORE UPDATE ON public.project_approvers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. One approval row per approver per invoice --------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  approver_id    uuid,                     -- references an auth user
  approver_role  text NOT NULL CHECK (approver_role IN ('project_manager', 'treasury', 'project_lead')),
  status         text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  notes          text,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_approvals_invoice_role_unique UNIQUE (invoice_id, approver_role)
);

CREATE INDEX IF NOT EXISTS idx_invoice_approvals_invoice  ON public.invoice_approvals(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_approvals_approver ON public.invoice_approvals(approver_id);

ALTER TABLE public.invoice_approvals ENABLE ROW LEVEL SECURITY;

-- Read by anyone in the invoice's org (project members).
CREATE POLICY "Org members can select invoice_approvals" ON public.invoice_approvals
  FOR SELECT TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- Insert allowed for org members (rows are created at upload time).
CREATE POLICY "Org members can insert invoice_approvals" ON public.invoice_approvals
  FOR INSERT TO authenticated
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- Update only by the assigned approver, OR by an org admin (admin can act for any role).
CREATE POLICY "Assigned approver or admin can update invoice_approvals" ON public.invoice_approvals
  FOR UPDATE TO authenticated
  USING (
    approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.access_level = 'admin'
        AND om.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.project_approvers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoice_approvals  TO authenticated;
GRANT ALL ON public.project_approvers TO service_role;
GRANT ALL ON public.invoice_approvals TO service_role;
