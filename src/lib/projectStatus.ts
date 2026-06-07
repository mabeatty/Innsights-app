// Single source of truth for project status options.
// Used by both the New Project form (set at creation) and the Project Info form
// (edited afterward). Both read/write the same column: project_info.project_status.
//
// These values must stay in sync with the DB CHECK constraint
// project_info_project_status_check. To add a new status (e.g. "Substantially
// Complete"), add it here AND update the CHECK constraint in the database.
export const PROJECT_STATUSES = [
  "Prospecting",
  "Under Contract",
  "Design",
  "Pre-Construction",
  "Under Construction",
  "Open",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
