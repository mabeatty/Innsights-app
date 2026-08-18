-- Tracks which project a prospect was pushed into, so it's not converted
-- twice and the UI can link straight to the resulting project.
ALTER TABLE prospects ADD COLUMN converted_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
