-- Manual reclassifications/corrections that the automated QuickBooks sync
-- (sync-dev-fee-revenue-quickbooks) would otherwise silently overwrite,
-- since that sync writes the exact per-account amount it finds in
-- QuickBooks and has no concept of "this transaction was reclassified."
-- Kept in a separate table, never touched by the sync, and added on top
-- of revenue_qb_actuals by the frontend hooks — so a correction like
-- "Cleveland's Aug Owner's Rep $7,500 counts as Development Fee, not
-- Construction Fee" survives every future re-sync instead of getting
-- reset back to the raw QuickBooks account value.
create table if not exists revenue_manual_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  revenue_type text not null,
  project_id uuid references projects(id) on delete cascade,
  external_label text,
  month text not null, -- 'YYYY-MM'
  amount numeric not null,
  note text not null, -- required — an adjustment with no explanation is a liability
  created_at timestamptz not null default now(),
  constraint revenue_manual_adjustments_project_or_external check ((project_id is not null) <> (external_label is not null))
);

create unique index if not exists revenue_manual_adjustments_project_uniq
  on revenue_manual_adjustments (org_id, revenue_type, project_id, month) where project_id is not null;
create unique index if not exists revenue_manual_adjustments_external_uniq
  on revenue_manual_adjustments (org_id, revenue_type, external_label, month) where project_id is null;

alter table revenue_manual_adjustments enable row level security;
create policy "org members can read revenue_manual_adjustments" on revenue_manual_adjustments
  for select using (org_id in (select organization_id from organization_members where user_id = auth.uid()));
