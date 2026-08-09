-- Persisted chat history for the project-level AI assistant, so a
-- conversation survives navigation/refresh rather than living only in
-- React state.
CREATE TABLE project_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_assistant_messages_project_id ON project_assistant_messages(project_id, created_at);

ALTER TABLE project_assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select project_assistant_messages" ON project_assistant_messages
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  );

CREATE POLICY "Org members can insert project_assistant_messages" ON project_assistant_messages
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  );

CREATE POLICY "Org members can delete project_assistant_messages" ON project_assistant_messages
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid()))
  );
