-- Fully automated pipeline, no manual action required:
-- 1. The moment a weekly_report_attachments row is inserted (whether from a
--    direct upload or a Drive link), fire extract-weekly-report-text for it
--    via pg_net. extract-weekly-report-text itself calls detect-project-risks
--    when it finishes, so a new report flows straight through to an updated
--    risk list with nobody clicking anything.
-- 2. A nightly pg_cron job re-runs detect-project-risks for every active
--    project regardless of new reports, so budget/schedule risks that
--    emerge without a new report (e.g. a task's date just passed) still
--    surface automatically.
--
-- The service role key needed to call edge functions from a DB trigger/cron
-- job can't be set via ALTER DATABASE on Supabase's hosted platform (that
-- requires superuser, which this connection doesn't have) — so it's stored
-- in Supabase Vault instead (vault.create_secret, name='service_role_key')
-- and read back via vault.decrypted_secrets inside the trigger function.

CREATE OR REPLACE FUNCTION public.trigger_extract_weekly_report_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_role_key text;
  v_supabase_url text := 'https://zwkelhwxvfthpdlquill.supabase.co';
BEGIN
  -- Only auto-extract PDFs; other file types would need a different read
  -- path that doesn't exist yet, so don't fire a request that will just
  -- fail on every non-PDF attachment.
  IF NEW.file_name IS NULL OR lower(NEW.file_name) NOT LIKE '%.pdf' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  -- Best-effort: if the secret isn't configured for some reason, don't
  -- block the insert itself — the nightly batch and the manual Extract
  -- button remain available as fallbacks.
  IF v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/extract-weekly-report-text',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_role_key),
    body := jsonb_build_object('attachmentId', NEW.id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_extract_weekly_report_attachment
  AFTER INSERT ON public.weekly_report_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_extract_weekly_report_attachment();

-- Nightly risk-detection sweep, 3:00 AM UTC, across every active project
-- (detect-project-risks defaults to all "Under Construction" projects when
-- no projectId is passed).
SELECT cron.schedule(
  'nightly-project-risk-detection',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zwkelhwxvfthpdlquill.supabase.co/functions/v1/detect-project-risks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

