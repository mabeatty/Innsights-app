
INSERT INTO public.project_budget (project_id, division_number, division_name, cost_type, scheduled_value)
SELECT DISTINCT p.project_id, '79', 'Working Capital', 'soft', 0
FROM public.project_budget p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_budget pb
  WHERE pb.project_id = p.project_id AND pb.division_number = '79'
);

INSERT INTO public.project_budget (project_id, division_number, division_name, cost_type, scheduled_value)
SELECT DISTINCT p.project_id, '80', 'Miscellaneous', 'soft', 0
FROM public.project_budget p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_budget pb
  WHERE pb.project_id = p.project_id AND pb.division_number = '80'
);
