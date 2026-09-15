-- Forecast (not-yet-billed) revenue per project, for revenue types other
-- than Development Fees, which already has its own forecast source
-- (dev_fee_schedule.is_billed=false). This is separate so Development
-- Fees' existing, already-correct forecast logic isn't disturbed.
create table if not exists revenue_forecast (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  revenue_type text not null,
  project_id uuid not null references projects(id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, revenue_type, project_id, month)
);

alter table revenue_forecast enable row level security;
create policy "org members can read revenue_forecast" on revenue_forecast
  for select using (org_id in (select organization_id from organization_members where user_id = auth.uid()));
