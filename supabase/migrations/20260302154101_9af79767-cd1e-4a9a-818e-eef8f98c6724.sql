
-- Create draw_history table for storing closed draw snapshots
CREATE TABLE public.draw_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  draw_number INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Submitted',
  backup_url TEXT,
  notes TEXT,
  snapshot_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (project_id, draw_number)
);

-- Enable RLS
ALTER TABLE public.draw_history ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to organization
CREATE POLICY "Org members can select draw_history"
  ON public.draw_history FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can insert draw_history"
  ON public.draw_history FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update draw_history"
  ON public.draw_history FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete draw_history"
  ON public.draw_history FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
