-- Contractor-driven schedule color grouping. Rather than imposing a fixed
-- taxonomy (Sitework/Structural/MEP/etc.) that might not match how a given
-- GC actually organized their schedule, workflow_group captures whatever
-- parent grouping the contractor's own schedule shows for a task — a
-- section/summary row label (e.g. "Sitework"), or an indentation-implied
-- parent. This is per-project and per-contractor by nature: two projects'
-- schedules can (and often will) use different group names, and that's
-- correct, not a bug — the Gantt view colors consistently *within* a
-- project by deriving a palette from that project's own distinct
-- workflow_group values, not from any universal list.
ALTER TABLE public.critical_path_tasks
  ADD COLUMN workflow_group text DEFAULT NULL;

COMMENT ON COLUMN public.critical_path_tasks.workflow_group IS
  'The contractor''s own parent grouping/section for this task (e.g. "Sitework", "MEP Rough-In"), extracted from the schedule''s own structure or set manually — not a fixed taxonomy. Drives Gantt bar coloring: tasks sharing a workflow_group get shades of the same color, consistent within a project.';
