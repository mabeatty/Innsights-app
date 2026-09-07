-- Weekly Project Notes: a shared, team-editable note per project per ISO
-- week, with three structured fields (This Week / Risks & Watch Items /
-- Needs From Others) rather than one free-text area — the structure exists
-- specifically to keep the factual, low-stakes content (This Week) separate
-- from the judgment content (Risks, Needs), so a shared, all-team audience
-- doesn't pressure someone into writing thin, purely-safe notes across the
-- whole thing.
--
-- Editing model: any team member with project access can edit any field.
-- This is deliberately NOT a per-author entry log — fields are shared,
-- live-doc-style. Since there's no real-time collaborative editing
-- infrastructure in this app (no CRDT/operational-transform layer), this is
-- last-write-wins at the field level, with two mitigations against silent
-- overwrites: (1) each field tracks who last edited it and when, shown in
-- the UI as a small byline, and (2) the update trigger below rejects a
-- write whose expected previous updated_at doesn't match current state,
-- so the client can detect "someone else saved after you loaded" and warn
-- before overwriting, rather than clobbering silently.
--
-- Auto-draft: on first creation of a note row for a week with no content
-- yet, this_week_content can be pre-populated by the frontend from real
-- project data (risks, invoices, schedule, OAC/weekly report highlights)
-- as editable draft text. this_week_is_draft tracks whether any of that
-- text has been reviewed/edited yet, purely so the UI can visually
-- distinguish "system-suggested, not yet reviewed" text until a save
-- happens — once edited, it's permanent regular note content like any
-- other field.

CREATE TABLE public.project_weekly_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  week_start_date date NOT NULL, -- Monday of the ISO week this note covers

  this_week_content text NOT NULL DEFAULT '',
  this_week_is_draft boolean NOT NULL DEFAULT false, -- true only until first edit/save after auto-population
  this_week_updated_by uuid DEFAULT NULL,
  this_week_updated_at timestamptz DEFAULT NULL,

  risks_content text NOT NULL DEFAULT '',
  risks_updated_by uuid DEFAULT NULL,
  risks_updated_at timestamptz DEFAULT NULL,

  needs_content text NOT NULL DEFAULT '',
  needs_updated_by uuid DEFAULT NULL,
  needs_updated_at timestamptz DEFAULT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT NULL,

  -- Full-text search across all three fields at once — a single generated
  -- column keeps this simple and always in sync without an app-side reindex
  -- step; ILIKE alone would be too slow/blunt once a project has a year or
  -- more of weekly notes.
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(this_week_content, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(risks_content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(needs_content, '')), 'B')
  ) STORED,

  UNIQUE (project_id, week_start_date)
);

CREATE INDEX idx_project_weekly_notes_search ON public.project_weekly_notes USING GIN (search_vector);
CREATE INDEX idx_project_weekly_notes_project_week ON public.project_weekly_notes (project_id, week_start_date DESC);

ALTER TABLE public.project_weekly_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select project_weekly_notes" ON public.project_weekly_notes
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert project_weekly_notes" ON public.project_weekly_notes
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update project_weekly_notes" ON public.project_weekly_notes
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete project_weekly_notes" ON public.project_weekly_notes
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = get_user_organization_id(auth.uid())));
