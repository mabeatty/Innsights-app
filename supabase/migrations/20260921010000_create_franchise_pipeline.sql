-- Tracks properties with a SIGNED franchise agreement, the pipeline stage
-- after Prospecting (which tracks pre-signed, speculative leads with
-- potential_brands — plural/undecided). Here the brand is confirmed.
-- Mirrors prospects' converted_project_id pattern: once a deal becomes an
-- active Innsights project, link it here rather than duplicating data.
create table if not exists franchise_pipeline (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_name text not null,
  city text,
  state text,
  brand_id uuid references brands(id),
  franchisor text,
  franchise_agreement_date date,
  projected_opening_date date,
  status text not null default 'Franchise Signed',
  notes text,
  converted_project_id uuid references projects(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table franchise_pipeline enable row level security;

create policy "org members can read franchise_pipeline" on franchise_pipeline
  for select using (organization_id in (select organization_id from organization_members where user_id = auth.uid()));
create policy "org members can insert franchise_pipeline" on franchise_pipeline
  for insert with check (organization_id in (select organization_id from organization_members where user_id = auth.uid()));
create policy "org members can update franchise_pipeline" on franchise_pipeline
  for update using (organization_id in (select organization_id from organization_members where user_id = auth.uid()));
create policy "org members can delete franchise_pipeline" on franchise_pipeline
  for delete using (organization_id in (select organization_id from organization_members where user_id = auth.uid()));
