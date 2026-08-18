-- Prospecting: tracking prospective development projects/markets, separate
-- from live projects. Attachments follow the same Drive-link-first pattern
-- used elsewhere (storage_path OR drive_url, not both required).
CREATE TABLE prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  state text,
  potential_brands text[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_organization_id ON prospects(organization_id);

CREATE TABLE prospect_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  storage_path text,
  drive_url text,
  drive_file_id text,
  file_name text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_attachments_has_source CHECK (storage_path IS NOT NULL OR drive_url IS NOT NULL)
);

CREATE INDEX idx_prospect_attachments_prospect_id ON prospect_attachments(prospect_id);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select prospects" ON prospects
  FOR SELECT USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can insert prospects" ON prospects
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can update prospects" ON prospects
  FOR UPDATE USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Org members can delete prospects" ON prospects
  FOR DELETE USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Org members can select prospect_attachments" ON prospect_attachments
  FOR SELECT USING (prospect_id IN (SELECT id FROM prospects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert prospect_attachments" ON prospect_attachments
  FOR INSERT WITH CHECK (prospect_id IN (SELECT id FROM prospects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete prospect_attachments" ON prospect_attachments
  FOR DELETE USING (prospect_id IN (SELECT id FROM prospects WHERE organization_id = get_user_organization_id(auth.uid())));

INSERT INTO storage.buckets (id, name, public) VALUES ('prospect-attachments', 'prospect-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members can read prospect-attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'prospect-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "Org members can upload prospect-attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'prospect-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "Org members can delete prospect-attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'prospect-attachments' AND auth.role() = 'authenticated');
