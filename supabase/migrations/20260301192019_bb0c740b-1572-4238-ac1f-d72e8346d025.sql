
ALTER TABLE public.project_info DROP CONSTRAINT project_info_project_status_check;
ALTER TABLE public.project_info ADD CONSTRAINT project_info_project_status_check CHECK (project_status IN ('Prospecting', 'Under Contract', 'Design', 'In Design', 'Pre-Construction', 'Under Construction', 'Open'));
UPDATE public.project_info SET project_status = 'Design' WHERE project_status = 'In Design';
