
-- Add updated_at to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Initialize updated_at from created_at
UPDATE public.projects SET updated_at = created_at WHERE updated_at = now();

-- Add trigger to auto-update
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
