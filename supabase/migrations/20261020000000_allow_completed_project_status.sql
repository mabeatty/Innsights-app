-- Adds "Completed" to the allowed project statuses. Completed projects are taken off the
-- Dashboard / Master Calendar and listed on the Dashboard's Completed tab instead.
-- Keep in sync with PROJECT_STATUSES in src/lib/projectStatus.ts.
alter table project_info drop constraint if exists project_info_project_status_check;
alter table project_info add constraint project_info_project_status_check
  check (project_status = any (array['Prospecting','Design','Pre-Construction','Under Construction','On Hold','Open','Completed']));
