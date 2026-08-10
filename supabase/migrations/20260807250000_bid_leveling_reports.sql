-- Persisted AI-generated bid leveling reports, one per bid item, so viewing
-- a report doesn't call the AI again every time — it's regenerated only on
-- explicit request.
CREATE TABLE bid_leveling_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_item_id uuid NOT NULL UNIQUE REFERENCES vendor_bid_items(id) ON DELETE CASCADE,
  report jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid
);

ALTER TABLE bid_leveling_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select bid_leveling_reports" ON bid_leveling_reports
  FOR SELECT USING (
    bid_item_id IN (
      SELECT id FROM vendor_bid_items WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
      )
    )
  );

CREATE POLICY "Org members can insert bid_leveling_reports" ON bid_leveling_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Org members can update bid_leveling_reports" ON bid_leveling_reports
  FOR UPDATE USING (
    bid_item_id IN (
      SELECT id FROM vendor_bid_items WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
      )
    )
  );

CREATE POLICY "Org members can delete bid_leveling_reports" ON bid_leveling_reports
  FOR DELETE USING (
    bid_item_id IN (
      SELECT id FROM vendor_bid_items WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())
      )
    )
  );
