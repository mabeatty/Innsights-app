-- Per-project switch for the dashboard's Master Calendar. Defaults to shown, so
-- new projects appear automatically; hiding a project here only removes it from
-- the calendar (it still appears on the Project Summary tab and everywhere else).
alter table projects add column if not exists show_on_calendar boolean not null default true;

update projects set show_on_calendar = false
where id in (
  '6ceb7f00-379e-4f2c-acf5-45f81d46fe45', -- Carmel
  'b9f6a246-920d-4946-91a5-8d9d3aeb5920', -- Elizabeth City
  '0b725ecb-28db-49f8-82f1-7d4309c5927a', -- Muncie
  '1a59d70d-4b2a-43b2-9b39-9c1844f7517d'  -- Richmond
);
