-- ============================================================================
-- Innsights — Consolidated Database Schema
-- ============================================================================
-- Run this in the Supabase SQL editor of a NEW project to recreate the public
-- schema (tables, relationships, RLS, indexes), storage buckets/policies, and
-- the realtime/cron configuration from scratch.
--
-- This file is a clean, final-state reconstruction derived from:
--   * supabase/migrations/*.sql        (65 migrations)
--   * src/integrations/supabase/types.ts (generated, authoritative column set)
--
-- NOTES / ASSUMPTIONS
--   * A handful of objects were created outside the tracked migrations
--     (directly via the Supabase/Lovable dashboard) and are reconstructed here
--     from types.ts. They are marked with  [reconstructed]  below:
--       - tables: organizations, organization_members, ada_line_items,
--                 public_area_line_items
--       - columns: projects.organization_id, and the 'Public Area' value of
--                 the item_category enum
--       - storage bucket: 'invoices'
--       - a read policy on organizations (the app must read it; the original
--         dashboard-created policy is not in the migrations)
--   * Assumes a standard Supabase project (auth.users, storage.objects,
--     storage.buckets, and the supabase_realtime publication already exist).
--   * Run as a single script; object order satisfies FK / function dependencies.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
-- Used for scheduled jobs (alerts cron) and outbound HTTP from the database.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- ============================================================================
-- 2. ENUMS
-- ============================================================================
CREATE TYPE public.item_category AS ENUM (
  'Furniture',
  'Softgoods',
  'Lighting',
  'Artwork & Window Treatments',
  'Bathroom',
  'Equipment',
  'Public Area'              -- [reconstructed] added out-of-band after initial enum
);

CREATE TYPE public.project_status AS ENUM ('Draft', 'Complete');

CREATE TYPE public.project_type AS ENUM ('Development', 'Asset Management');

-- ============================================================================
-- 3. TABLES
-- ============================================================================
-- Order respects foreign-key dependencies.

-- ----------------------------------------------------------------------------
-- 3.1 Organizations & membership
-- ----------------------------------------------------------------------------

-- [reconstructed] from types.ts
CREATE TABLE public.organizations (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- [reconstructed] base columns from types.ts; expense_role/supervisor_id/
-- investment_access/access_level were added by tracked migrations.
CREATE TABLE public.organization_members (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid,
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  role              text,
  created_at        timestamptz DEFAULT now(),
  expense_role      text DEFAULT 'Employee',
  supervisor_id     uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  investment_access boolean NOT NULL DEFAULT false,
  access_level      text NOT NULL DEFAULT 'edit'   -- 'view' | 'edit' | 'admin'
);

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE,
  first_name  text DEFAULT '',
  last_name   text DEFAULT '',
  phone       text DEFAULT '',
  avatar_url  text DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.2 Brand / product reference catalog
-- ----------------------------------------------------------------------------

CREATE TABLE public.brands (
  id        uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name      text NOT NULL,
  code      text NOT NULL UNIQUE,
  logo_url  text
);

CREATE TABLE public.items (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  item_number text NOT NULL,
  category    public.item_category NOT NULL,
  brand_id    uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  unit        text NOT NULL DEFAULT 'EA',
  unit_price  numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.room_types (
  id        uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name      text NOT NULL,
  brand_id  uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);

CREATE TABLE public.bathroom_types (
  id        uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name      text NOT NULL,
  brand_id  uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);

CREATE TABLE public.public_area_types (
  id        uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name      text NOT NULL,
  brand_id  uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE
);

-- [reconstructed] from types.ts (only its RLS-enable appears in migrations)
CREATE TABLE public.ada_line_items (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id           uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  item_id            uuid REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_per_room  numeric
);

CREATE TABLE public.room_type_line_items (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id       uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  item_id            uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_per_room  integer NOT NULL DEFAULT 1
);

CREATE TABLE public.bathroom_type_line_items (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bathroom_type_id   uuid NOT NULL REFERENCES public.bathroom_types(id) ON DELETE CASCADE,
  item_id            uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_per_room  integer NOT NULL DEFAULT 1
);

CREATE TABLE public.public_area_type_line_items (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  public_area_type_id  uuid NOT NULL REFERENCES public.public_area_types(id) ON DELETE CASCADE,
  item_id              uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity             integer NOT NULL DEFAULT 1
);

-- [reconstructed] from types.ts (nullable FKs per generated types)
CREATE TABLE public.public_area_line_items (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id              uuid REFERENCES public.items(id) ON DELETE CASCADE,
  public_area_type_id  uuid REFERENCES public.public_area_types(id) ON DELETE CASCADE,
  quantity             numeric NOT NULL DEFAULT 0,
  created_at           timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.3 Bank connections (org-level) — created before projects (projects FK them)
-- ----------------------------------------------------------------------------

CREATE TABLE public.plaid_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  institution_name  text NOT NULL DEFAULT '',
  institution_id    text NOT NULL DEFAULT '',
  access_token      text NOT NULL,
  item_id           text NOT NULL,
  status            text NOT NULL DEFAULT 'Active',
  last_synced       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plaid_accounts (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            uuid NOT NULL REFERENCES public.organizations(id),
  connection_id     uuid NOT NULL REFERENCES public.plaid_connections(id) ON DELETE CASCADE,
  plaid_account_id  text NOT NULL UNIQUE,
  name              text NOT NULL DEFAULT '',
  mask              text,
  official_name     text,
  type              text,
  subtype           text,
  institution_name  text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.4 Projects (core entity)
-- ----------------------------------------------------------------------------
-- organization_id was added out-of-band; included here as [reconstructed].
CREATE TABLE public.projects (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text NOT NULL,
  hotel_name       text NOT NULL,
  brand_id         uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  status           public.project_status NOT NULL DEFAULT 'Draft',
  project_type     public.project_type   NOT NULL DEFAULT 'Development',
  organization_id  uuid REFERENCES public.organizations(id),          -- [reconstructed]
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clickup_list_id  text,
  plaid_account_id uuid REFERENCES public.plaid_accounts(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.5 Project detail / takeoff
-- ----------------------------------------------------------------------------

CREATE TABLE public.project_info (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  property_name        text,
  street_address       text,
  city                 text,
  state                text,
  zip_code             text,
  project_type         text CHECK (project_type IN ('New Construction', 'Renovation', 'Conversion')),
  project_status       text CHECK (project_status IN ('Prospecting', 'Under Contract', 'Design', 'In Design', 'Pre-Construction', 'Under Construction', 'Open')),
  total_room_count     integer,
  target_opening_date  date,
  owner_name           text,
  owner_email          text,
  general_contractor   text,
  architect            text,
  interior_designer    text,
  entity_name          text DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  folder_name    text NOT NULL,
  added_by       uuid NOT NULL,
  document_name  text NOT NULL DEFAULT '',
  drive_url      text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.takeoff_versions (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number  integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.takeoff_line_items (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_id            uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  room_type_id       uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  bathroom_type_id   uuid REFERENCES public.bathroom_types(id) ON DELETE SET NULL,
  takeoff_version_id uuid REFERENCES public.takeoff_versions(id) ON DELETE CASCADE,
  quantity_required  integer NOT NULL DEFAULT 0,
  adjusted_quantity  integer,
  is_ada             boolean NOT NULL DEFAULT false,
  notes              text,
  last_modified      timestamptz DEFAULT now()
);

CREATE TABLE public.project_public_area_items (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  public_area_type_id  uuid NOT NULL REFERENCES public.public_area_types(id) ON DELETE CASCADE,
  item_id              uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  takeoff_version_id   uuid REFERENCES public.takeoff_versions(id) ON DELETE CASCADE,
  quantity_required    integer NOT NULL DEFAULT 0,
  adjusted_quantity    integer,
  notes                text,
  last_modified        timestamptz DEFAULT now()
);

CREATE TABLE public.room_matrix_entries (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_type_id      uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  bathroom_type_id  uuid NOT NULL REFERENCES public.bathroom_types(id) ON DELETE CASCADE,
  quantity          integer NOT NULL DEFAULT 0,
  is_ada            boolean DEFAULT false
);

-- ----------------------------------------------------------------------------
-- 3.6 Budget / draws / change orders
-- ----------------------------------------------------------------------------

CREATE TABLE public.project_budget (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  division_number  text NOT NULL,
  division_name    text NOT NULL,
  cost_type        text NOT NULL CHECK (cost_type IN ('hard', 'soft')),
  scheduled_value  numeric NOT NULL DEFAULT 0,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_budget_project_division_unique UNIQUE (project_id, division_number)
);

CREATE TABLE public.draw_history (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  draw_number      integer NOT NULL,
  draw_month       date NOT NULL DEFAULT CURRENT_DATE,
  submission_date  date NOT NULL DEFAULT CURRENT_DATE,
  total_amount     numeric NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'Submitted',
  backup_url       text,
  notes            text,
  snapshot_json    jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draw_history_project_number_unique UNIQUE (project_id, draw_number),
  CONSTRAINT draw_history_project_month_unique  UNIQUE (project_id, draw_month)
);

CREATE TABLE public.budget_transactions (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  transaction_type     text NOT NULL,
  transaction_number   integer NOT NULL,
  date                 date NOT NULL DEFAULT CURRENT_DATE,
  payee                text NOT NULL DEFAULT '',
  division_number      text NOT NULL,
  division_name        text NOT NULL,
  description          text NOT NULL DEFAULT '',
  amount               numeric NOT NULL DEFAULT 0,
  retainage_percent    numeric NOT NULL DEFAULT 0,
  retainage_amount     numeric NOT NULL DEFAULT 0,
  net_amount           numeric NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'Pending',
  notes                text,
  transaction_group_id uuid DEFAULT gen_random_uuid(),
  document_url         text,
  draw_id              uuid REFERENCES public.draw_history(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.change_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  co_number        integer NOT NULL,
  date             date NOT NULL DEFAULT CURRENT_DATE,
  description      text NOT NULL DEFAULT '',
  division_number  text NOT NULL,
  division_name    text NOT NULL DEFAULT '',
  amount           numeric NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'Proposed',
  document_url     text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pre_development_budget (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  line_item      text NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  budget_amount  numeric NOT NULL DEFAULT 0,
  actual_amount  numeric NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.7 Schedule
-- ----------------------------------------------------------------------------

CREATE TABLE public.schedule_phases (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_number      integer NOT NULL,
  phase_name        text NOT NULL,
  sub_phase_number  text NOT NULL,
  sub_phase_name    text NOT NULL,
  start_date        date,
  end_date          date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.schedule_milestones (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sub_phase_id  uuid NOT NULL REFERENCES public.schedule_phases(id) ON DELETE CASCADE,
  name          text NOT NULL,
  planned_date  date,
  actual_date   date,
  status        text NOT NULL DEFAULT 'Upcoming',
  notes         text,
  is_custom     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.8 Capital stack
-- ----------------------------------------------------------------------------

CREATE TABLE public.capital_equity_sources (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_name       text NOT NULL DEFAULT '',
  equity_type       text NOT NULL DEFAULT 'GP Equity',
  total_commitment  numeric NOT NULL DEFAULT 0,
  equity_called     numeric NOT NULL DEFAULT 0,
  preferred_return  numeric,
  promote_structure text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.capital_debt_tranches (
  id                     uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lender_name            text NOT NULL DEFAULT '',
  loan_type              text NOT NULL DEFAULT 'Construction Loan',
  loan_amount            numeric NOT NULL DEFAULT 0,
  interest_rate          numeric NOT NULL DEFAULT 0,
  rate_type              text NOT NULL DEFAULT 'Fixed',
  index_name             text,
  spread                 numeric,
  loan_term              integer NOT NULL DEFAULT 0,
  maturity_date          date,
  amortization_schedule  text NOT NULL DEFAULT 'Interest Only',
  origination_fee        numeric NOT NULL DEFAULT 0,
  extension_options      text,
  required_reserves      text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.capital_investors (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  investor_name     text NOT NULL DEFAULT '',
  equity_source_id  uuid REFERENCES public.capital_equity_sources(id) ON DELETE SET NULL,
  total_commitment  numeric NOT NULL DEFAULT 0,
  total_called      numeric NOT NULL DEFAULT 0,
  total_received    numeric NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.capital_cash_flow (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  month_year       text NOT NULL DEFAULT '',
  projected_spend  numeric NOT NULL DEFAULT 0,
  draw_amount      numeric NOT NULL DEFAULT 0,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capital_cash_flow_project_month_unique UNIQUE (project_id, month_year)
);

CREATE TABLE public.investor_positions (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  investing_entity    text NOT NULL DEFAULT '',
  contact_name        text DEFAULT '',
  ownership_pct       numeric NOT NULL DEFAULT 0,
  committed           numeric NOT NULL DEFAULT 0,
  contributed         numeric NOT NULL DEFAULT 0,
  distributed         numeric NOT NULL DEFAULT 0,
  unreturned_capital  numeric NOT NULL DEFAULT 0,
  notes               text,
  source              text NOT NULL DEFAULT 'Manual',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.9 Vendors / bidding
-- ----------------------------------------------------------------------------

CREATE TABLE public.vendor_bid_items (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  segment     text NOT NULL,
  item_name   text NOT NULL,
  status      text NOT NULL DEFAULT 'Open',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_quotes (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_item_id        uuid NOT NULL REFERENCES public.vendor_bid_items(id) ON DELETE CASCADE,
  vendor_name        text NOT NULL,
  round_1_ref        text,
  round_1_url        text,
  round_1_amount     numeric,
  round_2_ref        text,
  round_2_url        text,
  round_2_amount     numeric,
  round_3_ref        text,
  round_3_url        text,
  round_3_amount     numeric,
  round_4_ref        text,
  round_4_url        text,
  round_4_amount     numeric,
  final_quote_amount numeric,
  vendor_status      text NOT NULL DEFAULT 'Pending',
  award_date         date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT '',
  contact_name  text,
  email         text,
  phone         text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.global_vendors (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_name         text NOT NULL,
  category            text NOT NULL,
  contact_name        text,
  phone               text,
  email               text,
  markets             text,
  notes               text,
  performance_rating  integer NOT NULL DEFAULT 0 CHECK (performance_rating >= 0 AND performance_rating <= 5),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.global_vendor_projects (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id   uuid NOT NULL REFERENCES public.global_vendors(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_vendor_projects_unique UNIQUE (vendor_id, project_id)
);

-- ----------------------------------------------------------------------------
-- 3.10 Reporting / photos / documents
-- ----------------------------------------------------------------------------

CREATE TABLE public.photo_albums (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.photo_album_photos (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id      uuid NOT NULL REFERENCES public.photo_albums(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL DEFAULT '',
  sort_order    integer NOT NULL DEFAULT 0,
  uploaded_by   uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_reports (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date_range_start date NOT NULL DEFAULT CURRENT_DATE,
  date_range_end   date NOT NULL DEFAULT CURRENT_DATE,
  content          text NOT NULL DEFAULT '',
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_report_comments (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id   uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  content     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_report_attachments (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id     uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id),
  storage_path  text NOT NULL,
  file_name     text NOT NULL DEFAULT '',
  file_size     bigint NOT NULL DEFAULT 0,
  uploaded_by   uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.generated_reports (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  generated_by        uuid NOT NULL,
  report_period_start date NOT NULL,
  report_period_end   date NOT NULL,
  delivery_method     text NOT NULL DEFAULT 'download',
  recipients          text[] DEFAULT '{}',
  storage_path        text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scheduled_report_config (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT false,
  day_of_month  integer NOT NULL DEFAULT 1,
  recipients    text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.report_content_config (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  include_project_overview  boolean NOT NULL DEFAULT true,
  include_schedule_summary  boolean NOT NULL DEFAULT true,
  include_budget_vs_actual  boolean NOT NULL DEFAULT true,
  include_draw_status       boolean NOT NULL DEFAULT true,
  include_cash_planning     boolean NOT NULL DEFAULT true,
  include_weekly_summaries  boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.internal_documents (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations(id),
  name        text NOT NULL,
  link        text NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.11 Consultant access
-- ----------------------------------------------------------------------------

CREATE TABLE public.consultant_project_access (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultant_project_access_unique UNIQUE (member_id, project_id)
);

-- ----------------------------------------------------------------------------
-- 3.12 Expenses / accounting / integrations
-- ----------------------------------------------------------------------------

CREATE TABLE public.expense_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  month_year    text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'Draft',
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid,
  total_amount  numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expense_report_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id  uuid NOT NULL REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,
  comment_text       text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chart_of_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_code  text NOT NULL DEFAULT '',
  account_name  text NOT NULL DEFAULT '',
  account_type  text DEFAULT 'Expense',
  is_custom     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bookkeeping_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       text NOT NULL DEFAULT '',
  name        text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plaid_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plaid_item_id        text,
  plaid_transaction_id text UNIQUE,
  account_id           text,
  cardholder_user_id   uuid,
  merchant_name        text NOT NULL DEFAULT '',
  amount               numeric NOT NULL DEFAULT 0,
  date                 date NOT NULL DEFAULT CURRENT_DATE,
  plaid_category       text,
  assigned_to_user_id  uuid,
  status               text NOT NULL DEFAULT 'unassigned',
  expense_report_id    uuid REFERENCES public.expense_reports(id) ON DELETE SET NULL,
  chart_of_accounts_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  project_id           uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  budget_line_division text,
  description          text DEFAULT '',
  receipt_url          text,
  notes                text,
  assignment_type      text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quickbooks_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  realm_id         text NOT NULL,
  access_token     text NOT NULL,
  refresh_token    text NOT NULL,
  token_expires_at timestamptz NOT NULL DEFAULT now(),
  company_name     text DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.integrations (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_key  text NOT NULL,
  value            text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integrations_org_key_unique UNIQUE (org_id, integration_key)
);

-- ----------------------------------------------------------------------------
-- 3.13 Invoice approval module
-- ----------------------------------------------------------------------------
-- Note: invoices.organization_id intentionally has no FK (matches production).

CREATE TABLE public.invoices (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL,
  project_id               uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  vendor_name              text,
  invoice_number           text,
  invoice_date             date,
  amount                   numeric(14,2),
  partial_approved_amount  numeric(14,2),
  type                     text,
  budget_line_item         text,
  status                   text NOT NULL DEFAULT 'Pending',
  submitted_by             uuid,
  submitted_by_email       text,
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  approved_by              uuid,
  approved_at              timestamptz,
  rejection_reason         text,
  more_info_request        text,
  notes                    text,
  pdf_url                  text,
  pdf_path                 text,
  source                   text NOT NULL DEFAULT 'manual',
  needs_review             boolean NOT NULL DEFAULT false,
  routed_to                uuid,
  routed_to_email          text,
  routed_at                timestamptz,
  ai_extracted_fields      jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_audit_trail (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action             text NOT NULL,
  performed_by       uuid,
  performed_by_name  text,
  notes              text,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  author_id    uuid,
  author_name  text,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3.14 Alerts
-- ----------------------------------------------------------------------------

CREATE TABLE public.alerts (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alert_type   text NOT NULL,
  message      text NOT NULL,
  severity     text NOT NULL DEFAULT 'warning',
  resolved_at  timestamptz,
  dismissed_by uuid,
  is_read      boolean NOT NULL DEFAULT false,
  read_by      uuid[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.alert_settings (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_type       text NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  threshold_value  numeric,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_settings_org_type_unique UNIQUE (org_id, alert_type)
);

-- ============================================================================
-- 4. FUNCTIONS
-- ============================================================================

-- 4.1 Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4.2 Touch projects.updated_at from related child tables
CREATE OR REPLACE FUNCTION public.touch_project_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.projects SET updated_at = now() WHERE id = OLD.project_id;
    RETURN OLD;
  ELSE
    UPDATE public.projects SET updated_at = now() WHERE id = NEW.project_id;
    RETURN NEW;
  END IF;
END;
$$;

-- 4.3 Helper: get the caller's organization_id (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 4.4 Helper: does the caller have investment-data access?
CREATE OR REPLACE FUNCTION public.has_investment_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND (investment_access = true OR expense_role = 'Partner')
  )
$$;

-- 4.5 Helper: is the caller a consultant/third-party?
CREATE OR REPLACE FUNCTION public.is_consultant(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND expense_role = 'Consultant/Third Party'
  )
$$;

-- 4.6 Helper: the project ids a consultant is allowed to see
CREATE OR REPLACE FUNCTION public.get_consultant_project_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpa.project_id
  FROM public.consultant_project_access cpa
  JOIN public.organization_members om ON om.id = cpa.member_id
  WHERE om.user_id = _user_id
$$;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
CREATE INDEX idx_schedule_phases_project       ON public.schedule_phases(project_id);
CREATE INDEX idx_schedule_milestones_project   ON public.schedule_milestones(project_id);
CREATE INDEX idx_schedule_milestones_subphase  ON public.schedule_milestones(sub_phase_id);

CREATE INDEX idx_invoices_org      ON public.invoices(organization_id);
CREATE INDEX idx_invoices_project  ON public.invoices(project_id);
CREATE INDEX idx_invoices_status   ON public.invoices(status);
CREATE INDEX idx_invoice_audit_invoice    ON public.invoice_audit_trail(invoice_id, created_at DESC);
CREATE INDEX idx_invoice_comments_invoice ON public.invoice_comments(invoice_id, created_at);

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- 6.1 updated_at maintenance
CREATE TRIGGER update_project_info_updated_at         BEFORE UPDATE ON public.project_info          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at             BEFORE UPDATE ON public.projects              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_project_budget_updated_at       BEFORE UPDATE ON public.project_budget        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budget_transactions_updated_at  BEFORE UPDATE ON public.budget_transactions   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_milestones_updated_at  BEFORE UPDATE ON public.schedule_milestones   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_quotes_updated_at        BEFORE UPDATE ON public.vendor_quotes         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_change_orders_updated_at           BEFORE UPDATE ON public.change_orders         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_photo_albums_updated_at         BEFORE UPDATE ON public.photo_albums          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_reports_updated_at       BEFORE UPDATE ON public.weekly_reports        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at         BEFORE UPDATE ON public.integrations          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_internal_documents_updated_at   BEFORE UPDATE ON public.internal_documents    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_global_vendors_updated_at       BEFORE UPDATE ON public.global_vendors        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at             BEFORE UPDATE ON public.invoices              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.2 Touch parent project.updated_at when project children change
CREATE TRIGGER trg_touch_project_on_budget_transactions    AFTER INSERT OR UPDATE OR DELETE ON public.budget_transactions    FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_draw_history           AFTER INSERT OR UPDATE OR DELETE ON public.draw_history           FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_change_orders          AFTER INSERT OR UPDATE OR DELETE ON public.change_orders          FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_project_budget         AFTER INSERT OR UPDATE OR DELETE ON public.project_budget         FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_project_info           AFTER INSERT OR UPDATE OR DELETE ON public.project_info           FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_project_documents      AFTER INSERT OR UPDATE OR DELETE ON public.project_documents      FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_schedule_phases        AFTER INSERT OR UPDATE OR DELETE ON public.schedule_phases        FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_schedule_milestones    AFTER INSERT OR UPDATE OR DELETE ON public.schedule_milestones    FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_capital_cash_flow      AFTER INSERT OR UPDATE OR DELETE ON public.capital_cash_flow      FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_capital_equity_sources AFTER INSERT OR UPDATE OR DELETE ON public.capital_equity_sources FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_capital_debt_tranches  AFTER INSERT OR UPDATE OR DELETE ON public.capital_debt_tranches  FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
CREATE TRIGGER trg_touch_project_on_capital_investors      AFTER INSERT OR UPDATE OR DELETE ON public.capital_investors      FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================
-- Enable RLS on every public table, then (re)create the final-state policies.

ALTER TABLE public.organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_types                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bathroom_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_area_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_line_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_line_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bathroom_type_line_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_area_type_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_area_line_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_connections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_info               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_versions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_line_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_public_area_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_matrix_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_history               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_development_budget     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_phases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_milestones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_equity_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_debt_tranches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_investors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_cash_flow          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_positions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_bid_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_vendors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_vendor_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_albums               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_album_photos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_report_comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_report_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_report_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_content_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_project_access  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_report_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookkeeping_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quickbooks_connections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_audit_trail        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_settings             ENABLE ROW LEVEL SECURITY;

-- NOTE: ada_line_items has RLS enabled but intentionally NO policies
--       (matches production — table is effectively locked to clients).

-- ---- organizations [reconstructed read policy] -----------------------------
CREATE POLICY "Members can read their organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_organization_id(auth.uid()));

-- ---- organization_members --------------------------------------------------
CREATE POLICY "Org members can read own org members" ON public.organization_members
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update organization_members" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- ---- profiles --------------------------------------------------------------
CREATE POLICY "Users can read own profile"   ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---- brands (shared reference catalog) -------------------------------------
CREATE POLICY "Authenticated users can read brands"   ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update brands" ON public.brands FOR UPDATE TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete brands" ON public.brands FOR DELETE TO authenticated USING (true);

-- ---- items / type catalogs (read-only to authenticated) --------------------
CREATE POLICY "Authenticated users can read items"              ON public.items              FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read room_types"         ON public.room_types         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read bathroom_types"     ON public.bathroom_types     FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read public_area_types"  ON public.public_area_types  FOR SELECT TO authenticated USING (true);

-- ---- room_type_line_items --------------------------------------------------
CREATE POLICY "Authenticated users can read room_type_line_items"   ON public.room_type_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert room_type_line_items" ON public.room_type_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update room_type_line_items" ON public.room_type_line_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete room_type_line_items" ON public.room_type_line_items FOR DELETE TO authenticated USING (true);

-- ---- bathroom_type_line_items ----------------------------------------------
CREATE POLICY "Authenticated users can read bathroom_type_line_items"   ON public.bathroom_type_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert bathroom_type_line_items" ON public.bathroom_type_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update bathroom_type_line_items" ON public.bathroom_type_line_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete bathroom_type_line_items" ON public.bathroom_type_line_items FOR DELETE TO authenticated USING (true);

-- ---- public_area_type_line_items -------------------------------------------
CREATE POLICY "Authenticated users can read public_area_type_line_items"   ON public.public_area_type_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert public_area_type_line_items" ON public.public_area_type_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update public_area_type_line_items" ON public.public_area_type_line_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete public_area_type_line_items" ON public.public_area_type_line_items FOR DELETE TO authenticated USING (true);

-- ---- plaid_connections (org-scoped) ----------------------------------------
CREATE POLICY "Org members can select plaid_connections" ON public.plaid_connections FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert plaid_connections" ON public.plaid_connections FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update plaid_connections" ON public.plaid_connections FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete plaid_connections" ON public.plaid_connections FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- ---- plaid_accounts (org-scoped) -------------------------------------------
CREATE POLICY "Org members can select plaid_accounts" ON public.plaid_accounts FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert plaid_accounts" ON public.plaid_accounts FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update plaid_accounts" ON public.plaid_accounts FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete plaid_accounts" ON public.plaid_accounts FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- ---- projects (org-scoped) -------------------------------------------------
CREATE POLICY "Org members can select projects" ON public.projects FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update projects" ON public.projects FOR UPDATE TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete projects" ON public.projects FOR DELETE TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid()));

-- ---- Project-scoped tables (helper macro pattern: project belongs to caller's org) ----
-- project_info
CREATE POLICY "Org members can select project_info" ON public.project_info FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_info" ON public.project_info FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_info" ON public.project_info FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_info" ON public.project_info FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- project_documents
CREATE POLICY "Org members can select project_documents" ON public.project_documents FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_documents" ON public.project_documents FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_documents" ON public.project_documents FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- takeoff_versions
CREATE POLICY "Org members can read takeoff_versions"   ON public.takeoff_versions FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert takeoff_versions" ON public.takeoff_versions FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete takeoff_versions" ON public.takeoff_versions FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- takeoff_line_items
CREATE POLICY "Org members can read takeoff_line_items"   ON public.takeoff_line_items FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert takeoff_line_items" ON public.takeoff_line_items FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update takeoff_line_items" ON public.takeoff_line_items FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete takeoff_line_items" ON public.takeoff_line_items FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- project_public_area_items
CREATE POLICY "Org members can read project_public_area_items"   ON public.project_public_area_items FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_public_area_items" ON public.project_public_area_items FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_public_area_items" ON public.project_public_area_items FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_public_area_items" ON public.project_public_area_items FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- room_matrix_entries
CREATE POLICY "Org members can read room_matrix_entries"   ON public.room_matrix_entries FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert room_matrix_entries" ON public.room_matrix_entries FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update room_matrix_entries" ON public.room_matrix_entries FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete room_matrix_entries" ON public.room_matrix_entries FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- project_budget
CREATE POLICY "Org members can select project_budget" ON public.project_budget FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_budget" ON public.project_budget FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_budget" ON public.project_budget FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_budget" ON public.project_budget FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- draw_history
CREATE POLICY "Org members can select draw_history" ON public.draw_history FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert draw_history" ON public.draw_history FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update draw_history" ON public.draw_history FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete draw_history" ON public.draw_history FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- budget_transactions
CREATE POLICY "Org members can select budget_transactions" ON public.budget_transactions FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert budget_transactions" ON public.budget_transactions FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update budget_transactions" ON public.budget_transactions FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete budget_transactions" ON public.budget_transactions FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- change_orders
CREATE POLICY "Org members can select change_orders" ON public.change_orders FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert change_orders" ON public.change_orders FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update change_orders" ON public.change_orders FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete change_orders" ON public.change_orders FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- pre_development_budget
CREATE POLICY "Org members can select pre_development_budget" ON public.pre_development_budget FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert pre_development_budget" ON public.pre_development_budget FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update pre_development_budget" ON public.pre_development_budget FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete pre_development_budget" ON public.pre_development_budget FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- schedule_phases
CREATE POLICY "Org members can select schedule_phases" ON public.schedule_phases FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert schedule_phases" ON public.schedule_phases FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update schedule_phases" ON public.schedule_phases FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete schedule_phases" ON public.schedule_phases FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- schedule_milestones
CREATE POLICY "Org members can select schedule_milestones" ON public.schedule_milestones FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert schedule_milestones" ON public.schedule_milestones FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update schedule_milestones" ON public.schedule_milestones FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete schedule_milestones" ON public.schedule_milestones FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- capital_equity_sources
CREATE POLICY "Org members can select capital_equity_sources" ON public.capital_equity_sources FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_equity_sources" ON public.capital_equity_sources FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_equity_sources" ON public.capital_equity_sources FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_equity_sources" ON public.capital_equity_sources FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- capital_debt_tranches
CREATE POLICY "Org members can select capital_debt_tranches" ON public.capital_debt_tranches FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_debt_tranches" ON public.capital_debt_tranches FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_debt_tranches" ON public.capital_debt_tranches FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_debt_tranches" ON public.capital_debt_tranches FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- capital_investors
CREATE POLICY "Org members can select capital_investors" ON public.capital_investors FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_investors" ON public.capital_investors FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_investors" ON public.capital_investors FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_investors" ON public.capital_investors FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- capital_cash_flow
CREATE POLICY "Org members can select capital_cash_flow" ON public.capital_cash_flow FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert capital_cash_flow" ON public.capital_cash_flow FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update capital_cash_flow" ON public.capital_cash_flow FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete capital_cash_flow" ON public.capital_cash_flow FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- investor_positions (gated additionally by investment access)
CREATE POLICY "Org members with investment access can select investor_positions" ON public.investor_positions FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())) AND public.has_investment_access(auth.uid()));
CREATE POLICY "Org members with investment access can insert investor_positions" ON public.investor_positions FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())) AND public.has_investment_access(auth.uid()));
CREATE POLICY "Org members with investment access can update investor_positions" ON public.investor_positions FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())) AND public.has_investment_access(auth.uid()));
CREATE POLICY "Org members with investment access can delete investor_positions" ON public.investor_positions FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())) AND public.has_investment_access(auth.uid()));

-- vendor_bid_items
CREATE POLICY "Org members can select vendor_bid_items" ON public.vendor_bid_items FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert vendor_bid_items" ON public.vendor_bid_items FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update vendor_bid_items" ON public.vendor_bid_items FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete vendor_bid_items" ON public.vendor_bid_items FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- vendor_quotes (scoped through vendor_bid_items)
CREATE POLICY "Org members can select vendor_quotes" ON public.vendor_quotes FOR SELECT USING (bid_item_id IN (SELECT id FROM public.vendor_bid_items WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can insert vendor_quotes" ON public.vendor_quotes FOR INSERT WITH CHECK (bid_item_id IN (SELECT id FROM public.vendor_bid_items WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can update vendor_quotes" ON public.vendor_quotes FOR UPDATE USING (bid_item_id IN (SELECT id FROM public.vendor_bid_items WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can delete vendor_quotes" ON public.vendor_quotes FOR DELETE USING (bid_item_id IN (SELECT id FROM public.vendor_bid_items WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));

-- vendors
CREATE POLICY "Org members can select vendors" ON public.vendors FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert vendors" ON public.vendors FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update vendors" ON public.vendors FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete vendors" ON public.vendors FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- global_vendors (org-scoped)
CREATE POLICY "Org members can select global_vendors" ON public.global_vendors FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert global_vendors" ON public.global_vendors FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update global_vendors" ON public.global_vendors FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete global_vendors" ON public.global_vendors FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- global_vendor_projects (scoped through global_vendors)
CREATE POLICY "Org members can select global_vendor_projects" ON public.global_vendor_projects FOR SELECT TO authenticated USING (vendor_id IN (SELECT id FROM public.global_vendors WHERE org_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert global_vendor_projects" ON public.global_vendor_projects FOR INSERT TO authenticated WITH CHECK (vendor_id IN (SELECT id FROM public.global_vendors WHERE org_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete global_vendor_projects" ON public.global_vendor_projects FOR DELETE TO authenticated USING (vendor_id IN (SELECT id FROM public.global_vendors WHERE org_id = public.get_user_organization_id(auth.uid())));

-- photo_albums
CREATE POLICY "Org members can select photo_albums" ON public.photo_albums FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert photo_albums" ON public.photo_albums FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update photo_albums" ON public.photo_albums FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete photo_albums" ON public.photo_albums FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- photo_album_photos
CREATE POLICY "Org members can select photo_album_photos" ON public.photo_album_photos FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert photo_album_photos" ON public.photo_album_photos FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete photo_album_photos" ON public.photo_album_photos FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- weekly_reports
CREATE POLICY "Org members can select weekly_reports" ON public.weekly_reports FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert weekly_reports" ON public.weekly_reports FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update weekly_reports" ON public.weekly_reports FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete weekly_reports" ON public.weekly_reports FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- weekly_report_comments (scoped through weekly_reports)
CREATE POLICY "Org members can select weekly_report_comments" ON public.weekly_report_comments FOR SELECT USING (report_id IN (SELECT id FROM public.weekly_reports WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can insert weekly_report_comments" ON public.weekly_report_comments FOR INSERT WITH CHECK (report_id IN (SELECT id FROM public.weekly_reports WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can delete weekly_report_comments" ON public.weekly_report_comments FOR DELETE USING (report_id IN (SELECT id FROM public.weekly_reports WHERE project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid()))));

-- weekly_report_attachments
CREATE POLICY "Org members can select weekly_report_attachments" ON public.weekly_report_attachments FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert weekly_report_attachments" ON public.weekly_report_attachments FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete weekly_report_attachments" ON public.weekly_report_attachments FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- generated_reports
CREATE POLICY "Org members can select generated_reports" ON public.generated_reports FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert generated_reports" ON public.generated_reports FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete generated_reports" ON public.generated_reports FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- scheduled_report_config
CREATE POLICY "Org members can select scheduled_report_config" ON public.scheduled_report_config FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert scheduled_report_config" ON public.scheduled_report_config FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update scheduled_report_config" ON public.scheduled_report_config FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete scheduled_report_config" ON public.scheduled_report_config FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- report_content_config
CREATE POLICY "Org members can select report_content_config" ON public.report_content_config FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert report_content_config" ON public.report_content_config FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update report_content_config" ON public.report_content_config FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete report_content_config" ON public.report_content_config FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- internal_documents (org-scoped)
CREATE POLICY "Org members can select internal_documents" ON public.internal_documents FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert internal_documents" ON public.internal_documents FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update internal_documents" ON public.internal_documents FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete internal_documents" ON public.internal_documents FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- consultant_project_access (scoped through organization_members)
CREATE POLICY "Org members can select consultant_project_access" ON public.consultant_project_access FOR SELECT TO authenticated USING (member_id IN (SELECT id FROM public.organization_members WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert consultant_project_access" ON public.consultant_project_access FOR INSERT TO authenticated WITH CHECK (member_id IN (SELECT id FROM public.organization_members WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete consultant_project_access" ON public.consultant_project_access FOR DELETE TO authenticated USING (member_id IN (SELECT id FROM public.organization_members WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- expense_reports (org-scoped)
CREATE POLICY "Org members can select expense_reports" ON public.expense_reports FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert expense_reports" ON public.expense_reports FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update expense_reports" ON public.expense_reports FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete expense_reports" ON public.expense_reports FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- expense_report_comments (scoped through expense_reports)
CREATE POLICY "Org members can select expense_report_comments" ON public.expense_report_comments FOR SELECT TO authenticated USING (expense_report_id IN (SELECT id FROM public.expense_reports WHERE org_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert expense_report_comments" ON public.expense_report_comments FOR INSERT TO authenticated WITH CHECK (expense_report_id IN (SELECT id FROM public.expense_reports WHERE org_id = public.get_user_organization_id(auth.uid())));

-- chart_of_accounts (org-scoped)
CREATE POLICY "Org members can select chart_of_accounts" ON public.chart_of_accounts FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert chart_of_accounts" ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update chart_of_accounts" ON public.chart_of_accounts FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete chart_of_accounts" ON public.chart_of_accounts FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- bookkeeping_contacts (org-scoped)
CREATE POLICY "Org members can select bookkeeping_contacts" ON public.bookkeeping_contacts FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert bookkeeping_contacts" ON public.bookkeeping_contacts FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update bookkeeping_contacts" ON public.bookkeeping_contacts FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete bookkeeping_contacts" ON public.bookkeeping_contacts FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- plaid_transactions (org-scoped)
CREATE POLICY "Org members can select plaid_transactions" ON public.plaid_transactions FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert plaid_transactions" ON public.plaid_transactions FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update plaid_transactions" ON public.plaid_transactions FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete plaid_transactions" ON public.plaid_transactions FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- quickbooks_connections (org-scoped)
CREATE POLICY "Org members can select quickbooks_connections" ON public.quickbooks_connections FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert quickbooks_connections" ON public.quickbooks_connections FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update quickbooks_connections" ON public.quickbooks_connections FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete quickbooks_connections" ON public.quickbooks_connections FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- integrations (org-scoped)
CREATE POLICY "Org members can select integrations" ON public.integrations FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert integrations" ON public.integrations FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update integrations" ON public.integrations FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete integrations" ON public.integrations FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- invoices (org-scoped; consultants limited to their assigned projects)
CREATE POLICY "Org members view invoices" ON public.invoices FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (
      NOT public.is_consultant(auth.uid())
      OR (project_id IS NOT NULL AND project_id IN (SELECT public.get_consultant_project_ids(auth.uid())))
    )
  );
CREATE POLICY "Org members insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members update invoices" ON public.invoices FOR UPDATE TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid())) WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members delete invoices" ON public.invoices FOR DELETE TO authenticated USING (organization_id = public.get_user_organization_id(auth.uid()));

-- invoice_audit_trail (visible if parent invoice is visible)
CREATE POLICY "View audit trail for visible invoices" ON public.invoice_audit_trail FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM public.invoices));
CREATE POLICY "Insert audit trail for org invoices"    ON public.invoice_audit_trail FOR INSERT TO authenticated WITH CHECK (invoice_id IN (SELECT id FROM public.invoices));

-- invoice_comments
CREATE POLICY "View comments for visible invoices"   ON public.invoice_comments FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM public.invoices));
CREATE POLICY "Insert comments for visible invoices" ON public.invoice_comments FOR INSERT TO authenticated WITH CHECK (invoice_id IN (SELECT id FROM public.invoices));
CREATE POLICY "Delete own comments"                  ON public.invoice_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

-- alerts (insert/update/delete by org members; the check-alerts edge function uses the service role, which bypasses RLS)
CREATE POLICY "Org members can select alerts" ON public.alerts FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Service can insert alerts"     ON public.alerts FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update alerts" ON public.alerts FOR UPDATE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete alerts" ON public.alerts FOR DELETE TO authenticated USING (project_id IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- alert_settings (org-scoped)
CREATE POLICY "Org members can select alert_settings" ON public.alert_settings FOR SELECT TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert alert_settings" ON public.alert_settings FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update alert_settings" ON public.alert_settings FOR UPDATE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete alert_settings" ON public.alert_settings FOR DELETE TO authenticated USING (org_id = public.get_user_organization_id(auth.uid()));

-- ============================================================================
-- 8. GRANTS (invoice module explicitly granted in migrations)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices            TO authenticated;
GRANT ALL                            ON public.invoices            TO service_role;
GRANT SELECT, INSERT                 ON public.invoice_audit_trail TO authenticated;
GRANT ALL                            ON public.invoice_audit_trail TO service_role;
GRANT SELECT, INSERT, DELETE         ON public.invoice_comments    TO authenticated;
GRANT ALL                            ON public.invoice_comments    TO service_role;

-- ============================================================================
-- 9. REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- ============================================================================
-- 10. STORAGE BUCKETS + POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('brand-logos',       'brand-logos',       true),
  ('project-documents', 'project-documents', false),
  ('templates',         'templates',         false),
  ('project-photos',    'project-photos',    true),
  ('project-reports',   'project-reports',   false),
  ('generated-reports', 'generated-reports', false),
  ('invoices',          'invoices',          false)   -- [reconstructed] bucket created out-of-band
ON CONFLICT (id) DO NOTHING;

-- ---- brand-logos (public) ----
CREATE POLICY "Brand logos are publicly accessible"      ON storage.objects FOR SELECT USING (bucket_id = 'brand-logos');
CREATE POLICY "Authenticated users can upload brand logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-logos' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update brand logos" ON storage.objects FOR UPDATE USING (bucket_id = 'brand-logos' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete brand logos" ON storage.objects FOR DELETE USING (bucket_id = 'brand-logos' AND auth.role() = 'authenticated');

-- ---- project-documents (private; first path segment = project id) ----
CREATE POLICY "Org members can upload project documents" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-documents' AND (storage.foldername(name))[1]::uuid IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can read project documents" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-documents' AND (storage.foldername(name))[1]::uuid IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project documents" ON storage.objects FOR DELETE
  USING (bucket_id = 'project-documents' AND (storage.foldername(name))[1]::uuid IN (SELECT id FROM public.projects WHERE organization_id = public.get_user_organization_id(auth.uid())));

-- ---- templates (private) ----
CREATE POLICY "Authenticated users can read templates" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'templates');
CREATE POLICY "Service role can manage templates"      ON storage.objects FOR ALL TO service_role USING (bucket_id = 'templates') WITH CHECK (bucket_id = 'templates');

-- ---- project-photos (public) ----
CREATE POLICY "Authenticated users can upload project photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-photos');
CREATE POLICY "Anyone can view project photos"                ON storage.objects FOR SELECT USING (bucket_id = 'project-photos');
CREATE POLICY "Authenticated users can delete project photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-photos');

-- ---- project-reports (private) ----
CREATE POLICY "Authenticated users can upload project reports" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-reports');
CREATE POLICY "Authenticated users can read project reports"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-reports');
CREATE POLICY "Authenticated users can delete project reports" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-reports');

-- ---- generated-reports (private) ----
CREATE POLICY "Org members can upload generated reports" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'generated-reports');
CREATE POLICY "Org members can read generated reports"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'generated-reports');
CREATE POLICY "Org members can delete generated reports" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'generated-reports');

-- ---- invoices (private; first path segment = project id, or 'email-intake') ----
CREATE POLICY "Org members read invoice files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id::text = (storage.foldername(name))[1] AND p.organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members upload invoice files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id::text = (storage.foldername(name))[1] AND p.organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members update invoice files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoices' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id::text = (storage.foldername(name))[1] AND p.organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members delete invoice files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoices' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id::text = (storage.foldername(name))[1] AND p.organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members manage email-intake invoice files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = 'email-intake')
  WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = 'email-intake');

-- ============================================================================
-- 11. SEED DATA
-- ============================================================================
-- There is NO required GLOBAL reference seed data in this app. The brand /
-- item / room-type catalogs are populated by users through the UI, and the
-- migrations contain only PER-PROJECT data back-fills (not global seed).
--
-- For reference, when the app provisions a project it expects these standard
-- lists to exist for that project (created by application logic, not seeded
-- globally here):
--
--   * project_budget divisions include (division_number, division_name, cost_type):
--       '11' Equipment (hard), '12' Furnishings (hard), '27' Communications (hard),
--       'HC' Hard Cost Contingency (hard), '79' Working Capital (soft),
--       '80' Miscellaneous (soft), plus the standard CSI hard-cost divisions.
--
--   * pre_development_budget line_items (sort_order):
--       Earnest Money(0), Title(1), Survey(2), Environmental(3), Geotechnical(4),
--       Entitlements(5), Permitting Fees(6), Architecture(7), Civil Engineering(8),
--       Franchise Fees(9), Legal(10), Travel(11), Miscellaneous(12).
--
-- The only true "seed" required for the app to function is the set of storage
-- buckets created in section 10 above.
--
-- Org bootstrap (run with real values after first signup):
--   INSERT INTO public.organizations (name) VALUES ('My Company');
--   INSERT INTO public.organization_members (user_id, organization_id, role, access_level)
--     VALUES ('<auth-user-uuid>', '<org-uuid>', 'admin', 'admin');

COMMIT;
