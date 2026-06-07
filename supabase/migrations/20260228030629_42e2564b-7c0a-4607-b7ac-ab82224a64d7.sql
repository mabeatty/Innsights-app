
ALTER TABLE public.schedule_phases
ADD COLUMN start_date date DEFAULT NULL,
ADD COLUMN end_date date DEFAULT NULL;
