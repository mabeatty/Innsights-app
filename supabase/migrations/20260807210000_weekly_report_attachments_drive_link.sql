-- Support linking documents already stored in Google Drive instead of duplicating
-- them into Supabase Storage. storage_path becomes optional; a row must have
-- either a storage_path (uploaded file) or a drive_url (linked file), not neither.
ALTER TABLE weekly_report_attachments
  ALTER COLUMN storage_path DROP NOT NULL,
  ADD COLUMN drive_url text,
  ADD COLUMN drive_file_id text,
  ADD CONSTRAINT weekly_report_attachments_has_source
    CHECK (storage_path IS NOT NULL OR drive_url IS NOT NULL);
