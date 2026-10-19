-- Account-level expense detail under each top-level company expense category.
-- company_actuals only holds the 9 category totals (each rolled up from several
-- QuickBooks accounts); this keeps the individual accounts so the Expenses tab
-- can show what's inside a category. Actuals only, no budget at this level
-- (company_budget is per top-level category).
create table if not exists company_expense_detail (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  category_id uuid not null references company_financial_categories(id) on delete cascade,
  account_name text not null,          -- the QuickBooks account, as named there
  month date not null,                 -- first of the month
  amount numeric not null,
  updated_at timestamptz not null default now(),
  unique (org_id, category_id, account_name, month)
);

alter table company_expense_detail enable row level security;

create policy "Org members can select company_expense_detail" on company_expense_detail
  for select using (org_id = get_user_organization_id(auth.uid()));
create policy "Org members can insert company_expense_detail" on company_expense_detail
  for insert with check (org_id = get_user_organization_id(auth.uid()));
create policy "Org members can update company_expense_detail" on company_expense_detail
  for update using (org_id = get_user_organization_id(auth.uid())) with check (org_id = get_user_organization_id(auth.uid()));
create policy "Org members can delete company_expense_detail" on company_expense_detail
  for delete using (org_id = get_user_organization_id(auth.uid()));
