-- Rename project_type enum values:
--   'New Development' -> 'Development'
--   'PIP'             -> 'Asset Management'
-- RENAME VALUE preserves the enum OID, so existing projects keep their value
-- (just displayed under the new label). The column default is reset afterward
-- because it referenced the old label by name.

ALTER TYPE public.project_type RENAME VALUE 'New Development' TO 'Development';
ALTER TYPE public.project_type RENAME VALUE 'PIP' TO 'Asset Management';

ALTER TABLE public.projects ALTER COLUMN project_type SET DEFAULT 'Development';
