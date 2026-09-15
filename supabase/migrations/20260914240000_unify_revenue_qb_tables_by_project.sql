-- Generalizes what was previously Development-Fees-only into a single
-- per-project, per-revenue-type structure, since Construction Fees and
-- Consulting Fees will also be broken out by project in QuickBooks going
-- forward (per direction, 2026-09-14). revenue_type: 'development_fee',
-- 'construction_fee', 'consulting_fee'.
create table if not exists revenue_qb_account_map (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  revenue_type text not null,
  project_id uuid not null references projects(id) on delete cascade,
  qb_account_name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, revenue_type, qb_account_name)
);

create table if not exists revenue_qb_actuals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  revenue_type text not null,
  project_id uuid not null references projects(id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  amount numeric not null default 0,
  synced_at timestamptz not null default now(),
  unique (org_id, revenue_type, project_id, month)
);

alter table revenue_qb_account_map enable row level security;
alter table revenue_qb_actuals enable row level security;
create policy "org members can read revenue_qb_account_map" on revenue_qb_account_map
  for select using (org_id in (select organization_id from organization_members where user_id = auth.uid()));
create policy "org members can read revenue_qb_actuals" on revenue_qb_actuals
  for select using (org_id in (select organization_id from organization_members where user_id = auth.uid()));

-- Migrate existing Development Fees mapping + actuals into the unified tables.
insert into revenue_qb_account_map (org_id, revenue_type, project_id, qb_account_name)
select org_id, 'development_fee', project_id, qb_account_name from dev_fee_qb_account_map
on conflict (org_id, revenue_type, qb_account_name) do nothing;

insert into revenue_qb_actuals (org_id, revenue_type, project_id, month, amount, synced_at)
select org_id, 'development_fee', project_id, month, amount, synced_at from dev_fee_qb_actuals
on conflict (org_id, revenue_type, project_id, month) do nothing;

-- Old tables retired in favor of the unified ones above.
drop table if exists dev_fee_qb_account_map;
drop table if exists dev_fee_qb_actuals;
drop table if exists company_revenue_monthly;
