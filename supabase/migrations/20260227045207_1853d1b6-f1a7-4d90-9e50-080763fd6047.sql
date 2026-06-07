
-- Drop old constraint
ALTER TABLE public.project_info DROP CONSTRAINT IF EXISTS project_info_project_status_check;

-- Update existing data
UPDATE public.project_info SET project_status = 'Pre-Construction' WHERE project_status = 'In Procurement';

-- Re-add with new values
ALTER TABLE public.project_info ADD CONSTRAINT project_info_project_status_check
  CHECK (project_status IN ('Prospecting', 'Under Contract', 'In Design', 'Pre-Construction', 'Under Construction', 'Open'));
