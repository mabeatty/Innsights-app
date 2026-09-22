-- New columns per direction 2026-09-21: projected_start_date replaces
-- projected_opening_date as the tracked date, development_fee is new.
-- projected_opening_date is left in place (not dropped), matching this
-- session's established pattern.
alter table franchise_pipeline add column if not exists projected_start_date date;
alter table franchise_pipeline add column if not exists development_fee numeric;

-- Status should track the SAME values used on the actual project dashboard
-- (project_info.project_status: Prospecting, Design, Pre-Construction,
-- Under Construction, On Hold, Open — see src/lib/projectStatus.ts), not a
-- separate pipeline-only vocabulary. For rows linked to a real project
-- (converted_project_id set), status now mirrors that project's live
-- project_info.project_status automatically via trigger, rather than being
-- a one-time copy that can drift out of sync as the project progresses.

-- 1. Backfill existing linked rows to their real current status.
update franchise_pipeline fp
set status = pi.project_status
from project_info pi
where pi.project_id = fp.converted_project_id and fp.converted_project_id is not null;

-- 2. Trigger: whenever project_info.project_status changes, push it to the
-- linked pipeline row.
create or replace function sync_pipeline_status_from_project()
returns trigger as $$
begin
  update franchise_pipeline
  set status = new.project_status
  where converted_project_id = new.project_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_pipeline_status on project_info;
create trigger trg_sync_pipeline_status
  after insert or update of project_status on project_info
  for each row
  execute function sync_pipeline_status_from_project();

-- 3. New Development-project trigger should seed a real dashboard status
-- ('Design', matching what Prospecting's push-to-project flow sets moments
-- later) instead of the old placeholder 'Converted to Project' value, which
-- is no longer part of the tracked vocabulary at all.
create or replace function create_pipeline_entry_for_project()
returns trigger as $$
begin
  if new.project_type = 'Development' then
    insert into franchise_pipeline (organization_id, property_name, brand_id, status, converted_project_id)
    values (new.organization_id, coalesce(new.hotel_name, new.name), new.brand_id, 'Design', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;
