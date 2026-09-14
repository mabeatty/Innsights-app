-- Maps a QuickBooks "Development Fees" sub-account (by name, as it appears
-- in the QB chart of accounts) to an Innsights project. Editable via SQL
-- without redeploying the sync function, since these mappings are sparse
-- and change as new projects go live in QB.
create table if not exists dev_fee_qb_account_map (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  qb_account_name text not null, -- exact QB sub-account name, e.g. "Ashland Home2 Suites"
  created_at timestamptz not null default now(),
  unique (org_id, qb_account_name)
);

-- Real monthly dev fee revenue actuals pulled from QuickBooks (Development
-- Fees P&L by month), replacing project-accounting-derived actuals as the
-- source of truth for the Development Fees monthly chart per Alex's
-- direction (2026-09-14): QB is more accurate than pulling from project
-- draws/transactions for this specific number.
create table if not exists dev_fee_qb_actuals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  amount numeric not null default 0,
  synced_at timestamptz not null default now(),
  unique (org_id, project_id, month)
);

alter table dev_fee_qb_account_map enable row level security;
alter table dev_fee_qb_actuals enable row level security;

create policy "org members can read dev_fee_qb_account_map" on dev_fee_qb_account_map
  for select using (org_id in (select organization_id from organization_members where user_id = auth.uid()));
create policy "org members can read dev_fee_qb_actuals" on dev_fee_qb_actuals
  for select using (org_id in (select organization_id from organization_members where user_id = auth.uid()));
