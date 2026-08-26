-- Critical path tracking, sourced from contractor Gantt uploads and kept live
-- against change orders and manual adjustments.

-- Tracks the original uploaded Gantt PDF (kept for reference even after the
-- extracted tasks below are edited).
CREATE TABLE public.schedule_gantt_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  file_path text DEFAULT NULL,
  uploaded_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_gantt_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select schedule_gantt_uploads" ON public.schedule_gantt_uploads
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert schedule_gantt_uploads" ON public.schedule_gantt_uploads
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update schedule_gantt_uploads" ON public.schedule_gantt_uploads
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete schedule_gantt_uploads" ON public.schedule_gantt_uploads
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- The extracted, editable critical-path task list. Linear predecessor chain
-- (not full multi-predecessor CPM) — see project notes for rationale.
CREATE TABLE public.critical_path_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gantt_upload_id uuid REFERENCES public.schedule_gantt_uploads(id) ON DELETE SET NULL,
  task_name text NOT NULL DEFAULT '',
  trade text DEFAULT NULL,
  predecessor_task_id uuid REFERENCES public.critical_path_tasks(id) ON DELETE SET NULL,
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  duration_days integer DEFAULT NULL,
  is_critical boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'Complete', 'At Risk', 'Delayed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('upload', 'manual')),
  sort_order integer NOT NULL DEFAULT 0,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.critical_path_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select critical_path_tasks" ON public.critical_path_tasks
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert critical_path_tasks" ON public.critical_path_tasks
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update critical_path_tasks" ON public.critical_path_tasks
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete critical_path_tasks" ON public.critical_path_tasks
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_critical_path_tasks_updated_at
  BEFORE UPDATE ON public.critical_path_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Join table: a single change order can shift multiple critical-path tasks.
CREATE TABLE public.change_order_schedule_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  critical_path_task_id uuid NOT NULL REFERENCES public.critical_path_tasks(id) ON DELETE CASCADE,
  impact_days integer NOT NULL DEFAULT 0,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_order_id, critical_path_task_id)
);

ALTER TABLE public.change_order_schedule_impacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select change_order_schedule_impacts" ON public.change_order_schedule_impacts
  FOR SELECT TO authenticated
  USING (critical_path_task_id IN (
    SELECT id FROM critical_path_tasks WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

CREATE POLICY "Org members can insert change_order_schedule_impacts" ON public.change_order_schedule_impacts
  FOR INSERT TO authenticated
  WITH CHECK (critical_path_task_id IN (
    SELECT id FROM critical_path_tasks WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

CREATE POLICY "Org members can update change_order_schedule_impacts" ON public.change_order_schedule_impacts
  FOR UPDATE TO authenticated
  USING (critical_path_task_id IN (
    SELECT id FROM critical_path_tasks WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ))
  WITH CHECK (critical_path_task_id IN (
    SELECT id FROM critical_path_tasks WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

CREATE POLICY "Org members can delete change_order_schedule_impacts" ON public.change_order_schedule_impacts
  FOR DELETE TO authenticated
  USING (critical_path_task_id IN (
    SELECT id FROM critical_path_tasks WHERE project_id IN (
      SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
    )
  ));

-- Function: shift a critical-path task's dates by N days and cascade the
-- same shift down its predecessor chain (successors only — a linear chain
-- so "successor" means any task whose predecessor_task_id points, directly
-- or transitively, back to the shifted task).
CREATE OR REPLACE FUNCTION public.apply_schedule_impact(p_task_id uuid, p_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM critical_path_tasks WHERE id = p_task_id;

  -- Shift the impacted task itself
  UPDATE critical_path_tasks
  SET start_date = start_date + p_days,
      end_date = end_date + p_days
  WHERE id = p_task_id;

  -- Cascade to all critical successors via recursive predecessor chain
  WITH RECURSIVE successors AS (
    SELECT id FROM critical_path_tasks WHERE predecessor_task_id = p_task_id
    UNION ALL
    SELECT ct.id FROM critical_path_tasks ct
    INNER JOIN successors s ON ct.predecessor_task_id = s.id
  )
  UPDATE critical_path_tasks
  SET start_date = start_date + p_days,
      end_date = end_date + p_days
  WHERE id IN (SELECT id FROM successors) AND is_critical = true;
END;
$$;
