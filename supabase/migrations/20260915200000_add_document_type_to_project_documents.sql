-- Supports a fixed document-type checklist within specific Resources
-- categories (Design, Diligence, Franchise), so those show as "Architectural
-- Plans: [Add]" rather than a generic list. NULL for Permits (intentionally
-- open-ended — every jurisdiction is different) and for any pre-existing
-- document that predates this classification.
alter table project_documents add column if not exists document_type text;
