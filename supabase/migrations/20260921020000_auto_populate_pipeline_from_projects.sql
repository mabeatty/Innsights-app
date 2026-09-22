-- Every Development project should automatically appear in the pipeline —
-- both existing ones (backfilled below) and any created going forward
-- (via a trigger), rather than requiring someone to manually re-enter data
-- that already exists on the project. A row created this way is linked via
-- the existing converted_project_id column (already used by the manual
-- "Link to Project" flow), so no new column is needed — a franchise_pipeline
-- row is either a net-new pre-project deal (converted_project_id null) or
-- tied to a real project (converted_project_id set), same as Prospecting's
-- own pattern.

-- 1. Backfill: one franchise_pipeline row per existing Development project
-- that doesn't already have one.
insert into franchise_pipeline (organization_id, property_name, city, state, brand_id, status, converted_project_id)
select p.organization_id, coalesce(p.hotel_name, p.name), pi.city, pi.state, p.brand_id, 'Converted to Project', p.id
from projects p
left join project_info pi on pi.project_id = p.id
where p.project_type = 'Development'
  and not exists (select 1 from franchise_pipeline fp where fp.converted_project_id = p.id);

-- 2. Trigger: auto-create a pipeline row whenever a new Development project
-- is inserted (covers Prospecting's push-to-project flow, and any other
-- project-creation path, automatically — not special-cased to Prospecting).
-- City/state aren't known yet at this exact moment (project_info is
-- inserted in a separate statement right after, by whatever flow created
-- the project) — left null here; someone can fill them in via the Pipeline
-- edit dialog, or a future project_info-insert trigger could backfill them.
create or replace function create_pipeline_entry_for_project()
returns trigger as $$
begin
  if new.project_type = 'Development' then
    insert into franchise_pipeline (organization_id, property_name, brand_id, status, converted_project_id)
    values (new.organization_id, coalesce(new.hotel_name, new.name), new.brand_id, 'Converted to Project', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_create_pipeline_entry on projects;
create trigger trg_create_pipeline_entry
  after insert on projects
  for each row
  execute function create_pipeline_entry_for_project();
