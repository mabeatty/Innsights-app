
-- Alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  dismissed_by UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_by UUID[] NOT NULL DEFAULT '{}'
);

-- Alert settings table (org-level config)
CREATE TABLE public.alert_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  threshold_value NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, alert_type)
);

-- RLS for alerts
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select alerts"
ON public.alerts FOR SELECT TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can update alerts"
ON public.alerts FOR UPDATE TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Service can insert alerts"
ON public.alerts FOR INSERT TO authenticated
WITH CHECK (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

CREATE POLICY "Org members can delete alerts"
ON public.alerts FOR DELETE TO authenticated
USING (project_id IN (
  SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
));

-- RLS for alert_settings
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select alert_settings"
ON public.alert_settings FOR SELECT TO authenticated
USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can insert alert_settings"
ON public.alert_settings FOR INSERT TO authenticated
WITH CHECK (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can update alert_settings"
ON public.alert_settings FOR UPDATE TO authenticated
USING (org_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can delete alert_settings"
ON public.alert_settings FOR DELETE TO authenticated
USING (org_id = get_user_organization_id(auth.uid()));

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
