-- hotel_name retired as a display concept everywhere (per direction
-- 2026-09-21) — Project Name is now the single source of truth. Updating
-- both pipeline triggers to stop referencing it.
create or replace function create_pipeline_entry_for_project()
returns trigger as $$
begin
  if new.project_type = 'Development' then
    insert into franchise_pipeline (organization_id, property_name, brand_id, status, converted_project_id)
    values (new.organization_id, new.name, new.brand_id, 'Design', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function sync_pipeline_identity_from_project()
returns trigger as $$
begin
  update franchise_pipeline
  set property_name = new.name,
      brand_id = new.brand_id
  where converted_project_id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- Bring existing linked pipeline rows in line with this immediately,
-- rather than waiting for the next unrelated project update to trigger it.
update franchise_pipeline fp
set property_name = p.name
from projects p
where p.id = fp.converted_project_id;
