
-- Add access_level column to organization_members
-- Values: 'view', 'edit', 'admin'
ALTER TABLE public.organization_members
  ADD COLUMN access_level text NOT NULL DEFAULT 'edit';

-- Migrate existing admin users: anyone with role='admin' gets access_level='admin'
UPDATE public.organization_members SET access_level = 'admin' WHERE role = 'admin';
