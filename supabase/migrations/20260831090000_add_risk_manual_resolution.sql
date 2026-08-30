-- Support manual resolution (distinct from automatic resolution when the
-- underlying condition simply clears) and a snapshot of how bad the risk
-- was at the moment it was resolved, so a later detection run can tell
-- "still about the same" from "meaningfully worse" and decide whether to
-- reopen it.
ALTER TABLE public.project_risks
  ADD COLUMN resolution_type text DEFAULT NULL CHECK (resolution_type IS NULL OR resolution_type IN ('auto', 'manual')),
  ADD COLUMN resolved_metric numeric DEFAULT NULL,
  ADD COLUMN resolved_by uuid DEFAULT NULL,
  ADD COLUMN current_metric numeric DEFAULT NULL;

COMMENT ON COLUMN public.project_risks.resolved_metric IS
  'Snapshot of the risk''s severity metric at the moment it was resolved — overrun percent (0-100) for Budget risks, days late for Schedule risks. NULL for Compliance/Report risks (no comparable metric). Used to decide whether a later detection run should reopen a manually-resolved risk because it got meaningfully worse.';

COMMENT ON COLUMN public.project_risks.current_metric IS
  'The risk''s severity metric as of the most recent detection run (overrun percent for Budget, days late for Schedule). Used by the client Resolve action to snapshot resolved_metric without needing to recompute it.';
