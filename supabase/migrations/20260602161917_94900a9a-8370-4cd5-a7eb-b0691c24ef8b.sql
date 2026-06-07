-- Shift existing items at/after sort_order 6 down by 1, then insert Permitting Fees at 6 for every project
UPDATE public.pre_development_budget
SET sort_order = sort_order + 1
WHERE sort_order >= 6;

INSERT INTO public.pre_development_budget (project_id, line_item, sort_order, budget_amount, actual_amount, notes)
SELECT DISTINCT project_id, 'Permitting Fees', 6, 0, 0, NULL
FROM public.pre_development_budget
WHERE project_id NOT IN (
  SELECT project_id FROM public.pre_development_budget WHERE line_item = 'Permitting Fees'
);