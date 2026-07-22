-- Contracts foundation
-- Adds first-class contracts, a per-project billing mode, and links
-- transactions + change orders to contracts. Fully additive and
-- backward-compatible: existing rows stay "floating" (contract_id NULL)
-- and behave exactly as they do today.

-- 1. Per-project billing mode ------------------------------------------------
-- 'project_rollup'  : Witness is NOT the GC. One aggregated G702/G703 per draw.
-- 'contract_native' : Witness IS the GC. Each contract bills its own G702/G703,
--                     rolled up into the owner-facing draw.
ALTER TABLE public.projects
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'project_rollup'
  CHECK (billing_mode IN ('project_rollup', 'contract_native'));

-- 2. Contracts ---------------------------------------------------------------
CREATE TABLE public.contracts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id                uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id                 uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  parent_contract_id        uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  contract_type             text NOT NULL DEFAULT 'Prime'
                              CHECK (contract_type IN ('Prime', 'Subcontract', 'Owner-Direct', 'Supply')),
  contract_number           text NOT NULL DEFAULT '',
  scope_summary             text NOT NULL DEFAULT '',
  original_amount           numeric NOT NULL DEFAULT 0,
  default_retainage_percent numeric NOT NULL DEFAULT 0,
  executed_date             date,
  status                    text NOT NULL DEFAULT 'Active'
                              CHECK (status IN ('Draft', 'Active', 'Closed')),
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_project ON public.contracts(project_id);
CREATE INDEX idx_contracts_org ON public.contracts(org_id);
CREATE INDEX idx_contracts_parent ON public.contracts(parent_contract_id);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select contracts" ON public.contracts
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert contracts" ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update contracts" ON public.contracts
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete contracts" ON public.contracts
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Link transactions to contracts + record retainage intent ----------------
-- retainage_mode:
--   'custom'  : amount/percent entered directly (existing behavior; safe default)
--   'default' : inherit contract.default_retainage_percent at entry time
--   'exempt'  : explicitly not subject to retainage (amount forced to 0)
ALTER TABLE public.budget_transactions
  ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN retainage_mode text NOT NULL DEFAULT 'custom'
    CHECK (retainage_mode IN ('default', 'custom', 'exempt'));

CREATE INDEX idx_budget_transactions_contract ON public.budget_transactions(contract_id);

-- 4. Link change orders to contracts -----------------------------------------
ALTER TABLE public.change_orders
  ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX idx_change_orders_contract ON public.change_orders(contract_id);
