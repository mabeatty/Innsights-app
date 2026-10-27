// Single source of truth for project status options.
// Used by both the New Project form (set at creation) and the Project Info form
// (edited afterward). Both read/write the same column: project_info.project_status.
//
// These values must stay in sync with the DB CHECK constraint
// project_info_project_status_check. To add a new status, add it here AND update the
// CHECK constraint in the database.
//
// "Completed" takes a project off the Dashboard and Master Calendar; it is listed on the
// Dashboard's Completed tab instead (so it can always be found and reopened).
export const PROJECT_STATUSES = [
  "Prospecting",
  "Design",
  "Pre-Construction",
  "Under Construction",
  "On Hold",
  "Open",
  "Completed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
