-- Link photo albums to the weekly report for the same week, so photos and the
-- report live together in one place. Nullable and ON DELETE SET NULL so
-- pre-existing standalone albums (and any future album not tied to a specific
-- week) keep working without a report.
ALTER TABLE photo_albums
  ADD COLUMN report_id uuid REFERENCES weekly_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_photo_albums_report_id ON photo_albums(report_id);
