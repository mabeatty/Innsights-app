
-- Backfill division 11 (Equipment) for existing projects
INSERT INTO public.project_budget (project_id, division_number, division_name, cost_type, scheduled_value)
SELECT DISTINCT p.project_id, '11', 'Equipment', 'hard', 0
FROM public.project_budget p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_budget pb
  WHERE pb.project_id = p.project_id AND pb.division_number = '11'
);

-- Backfill division 12 (Furnishings) for existing projects
INSERT INTO public.project_budget (project_id, division_number, division_name, cost_type, scheduled_value)
SELECT DISTINCT p.project_id, '12', 'Furnishings', 'hard', 0
FROM public.project_budget p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_budget pb
  WHERE pb.project_id = p.project_id AND pb.division_number = '12'
);

-- Backfill division 27 (Communications) for existing projects
INSERT INTO public.project_budget (project_id, division_number, division_name, cost_type, scheduled_value)
SELECT DISTINCT p.project_id, '27', 'Communications', 'hard', 0
FROM public.project_budget p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_budget pb
  WHERE pb.project_id = p.project_id AND pb.division_number = '27'
);

-- Backfill Hard Cost Contingency for existing projects
INSERT INTO public.project_budget (project_id, division_number, division_name, cost_type, scheduled_value)
SELECT DISTINCT p.project_id, 'HC', 'Hard Cost Contingency', 'hard', 0
FROM public.project_budget p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_budget pb
  WHERE pb.project_id = p.project_id AND pb.division_number = 'HC'
);
