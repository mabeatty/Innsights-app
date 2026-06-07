
-- Drop old columns and add new ones for Google Drive link approach
ALTER TABLE public.project_documents
  DROP COLUMN IF EXISTS file_name,
  DROP COLUMN IF EXISTS file_size,
  ADD COLUMN IF NOT EXISTS document_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS drive_url text NOT NULL DEFAULT '';

-- Rename uploaded_by to added_by
ALTER TABLE public.project_documents
  RENAME COLUMN uploaded_by TO added_by;
