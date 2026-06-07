
-- Add draw_month column
ALTER TABLE public.draw_history ADD COLUMN draw_month date;

-- Migrate existing data: use period_start as draw_month (first of month)
UPDATE public.draw_history SET draw_month = date_trunc('month', period_start)::date WHERE draw_month IS NULL;

-- Set default and make NOT NULL
ALTER TABLE public.draw_history ALTER COLUMN draw_month SET DEFAULT CURRENT_DATE;
ALTER TABLE public.draw_history ALTER COLUMN draw_month SET NOT NULL;

-- Drop old columns
ALTER TABLE public.draw_history DROP COLUMN period_start;
ALTER TABLE public.draw_history DROP COLUMN period_end;

-- Add unique constraint: one draw per project per month
ALTER TABLE public.draw_history ADD CONSTRAINT draw_history_project_month_unique UNIQUE (project_id, draw_month);
