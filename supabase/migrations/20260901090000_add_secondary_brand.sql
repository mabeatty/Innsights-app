-- Dual-brand hotel support. projects.brand_id remains the required primary
-- brand (unchanged — every existing single-brand project keeps working with
-- no data migration needed). secondary_brand_id is optional, set only for
-- projects that are actually two brands sharing one construction project
-- (e.g. a dual-branded Home2 Suites / Tru by Hilton).
--
-- Room types and takeoff items already carry their own brand_id (via
-- room_types.brand_id, inherited transitively by room_matrix_entries and
-- takeoff_line_items through room_type_id) — so the schema already supports
-- a project's room blocks spanning two brands. The actual gap was in the
-- UI/query layer, which only ever fetched room types for one brand per
-- project; see RoomMatrixModule.tsx and TakeoffModule.tsx changes.
ALTER TABLE public.projects
  ADD COLUMN secondary_brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
