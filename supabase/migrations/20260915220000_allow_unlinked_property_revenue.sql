-- Some real QuickBooks entities bill genuine, recurring revenue (mostly
-- Construction Management / Owner's Rep fees) but aren't and won't be
-- tracked as full Innsights projects (per direction 2026-09-15). Rather
-- than force-create lightweight "fake" project records (which would leak
-- into every other part of the app that lists projects), project_id is
-- loosened to nullable and paired with external_label — the raw
-- QuickBooks entity/customer name — for these cases. Exactly one of
-- project_id / external_label must be set.
alter table revenue_qb_actuals alter column project_id drop not null;
alter table revenue_qb_actuals add column if not exists external_label text;

alter table revenue_qb_actuals drop constraint if exists revenue_qb_actuals_org_id_revenue_type_project_id_month_key;
create unique index if not exists revenue_qb_actuals_project_uniq
  on revenue_qb_actuals (org_id, revenue_type, project_id, month) where project_id is not null;
create unique index if not exists revenue_qb_actuals_external_uniq
  on revenue_qb_actuals (org_id, revenue_type, external_label, month) where project_id is null;

alter table revenue_qb_actuals add constraint project_or_external_check
  check ((project_id is not null) <> (external_label is not null));
