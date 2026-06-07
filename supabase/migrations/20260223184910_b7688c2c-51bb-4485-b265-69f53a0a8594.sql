
CREATE TYPE public.project_type AS ENUM ('New Development', 'PIP');

ALTER TABLE public.projects ADD COLUMN project_type public.project_type NOT NULL DEFAULT 'New Development';
