-- OAC Meetings: a separate, independent Reports sub-tab for storing OAC
-- (Owner-Architect-Contractor) meeting recap PDFs, functionally parallel to
-- Weekly Reports (upload or Drive-link a PDF, auto-extracted the same way,
-- feeding the AI project assistant and automated risk detection) but kept
-- as its own table rather than reusing weekly_reports, per direction given
-- — deliberately not unified with the "OAC Call Recap" category values that
-- already exist in weekly_reports.content.
--
-- No photo album support (unlike weekly_reports) — meeting recaps don't
-- carry site photos, per direction given.

CREATE TABLE public.oac_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  title text DEFAULT NULL,
  created_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oac_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select oac_meetings" ON public.oac_meetings
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert oac_meetings" ON public.oac_meetings
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update oac_meetings" ON public.oac_meetings
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete oac_meetings" ON public.oac_meetings
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

CREATE TRIGGER set_oac_meetings_updated_at
  BEFORE UPDATE ON public.oac_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Attachments (mirrors weekly_report_attachments exactly, including the
-- extraction-pipeline columns) ──
CREATE TABLE public.oac_meeting_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.oac_meetings(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path text DEFAULT NULL,
  drive_url text DEFAULT NULL,
  drive_file_id text DEFAULT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  extracted_text text DEFAULT NULL,
  extraction_status text NOT NULL DEFAULT 'not_extracted'
    CHECK (extraction_status IN ('not_extracted', 'processing', 'done', 'failed', 'unsupported')),
  extraction_error text DEFAULT NULL,
  extracted_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oac_meeting_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select oac_meeting_attachments" ON public.oac_meeting_attachments
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert oac_meeting_attachments" ON public.oac_meeting_attachments
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update oac_meeting_attachments" ON public.oac_meeting_attachments
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete oac_meeting_attachments" ON public.oac_meeting_attachments
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));

-- ── Comments (mirrors weekly_report_comments) ──
CREATE TABLE public.oac_meeting_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.oac_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oac_meeting_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select oac_meeting_comments" ON public.oac_meeting_comments
  FOR SELECT TO authenticated
  USING (meeting_id IN (SELECT id FROM oac_meetings WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can insert oac_meeting_comments" ON public.oac_meeting_comments
  FOR INSERT TO authenticated
  WITH CHECK (meeting_id IN (SELECT id FROM oac_meetings WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can update oac_meeting_comments" ON public.oac_meeting_comments
  FOR UPDATE TO authenticated
  USING (meeting_id IN (SELECT id FROM oac_meetings WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))))
  WITH CHECK (meeting_id IN (SELECT id FROM oac_meetings WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));
CREATE POLICY "Org members can delete oac_meeting_comments" ON public.oac_meeting_comments
  FOR DELETE TO authenticated
  USING (meeting_id IN (SELECT id FROM oac_meetings WHERE project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))));

-- ── Auto-extraction trigger, mirroring trigger_extract_weekly_report_attachment ──
CREATE OR REPLACE FUNCTION public.trigger_extract_oac_meeting_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_role_key text;
  v_supabase_url text := 'https://zwkelhwxvfthpdlquill.supabase.co';
BEGIN
  IF NEW.file_name IS NULL OR lower(NEW.file_name) NOT LIKE '%.pdf' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/extract-oac-meeting-text',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_role_key),
    body := jsonb_build_object('attachmentId', NEW.id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_extract_oac_meeting_attachment
  AFTER INSERT ON public.oac_meeting_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_extract_oac_meeting_attachment();
