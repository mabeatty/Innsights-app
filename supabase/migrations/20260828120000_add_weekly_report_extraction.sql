-- Extracted/summarized text for weekly report attachments, so the project
-- assistant can actually reason about what's inside a report PDF rather than
-- only seeing its filename. Works for both directly-uploaded files
-- (storage_path) and Drive-linked files (drive_file_id), depending on which
-- credentials are configured — see extract-weekly-report-text edge function.
ALTER TABLE public.weekly_report_attachments
  ADD COLUMN extracted_text text DEFAULT NULL,
  ADD COLUMN extraction_status text NOT NULL DEFAULT 'not_extracted'
    CHECK (extraction_status IN ('not_extracted', 'processing', 'done', 'failed', 'unsupported')),
  ADD COLUMN extraction_error text DEFAULT NULL,
  ADD COLUMN extracted_at timestamptz DEFAULT NULL;
