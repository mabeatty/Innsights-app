-- OR (Owner's Rep) fees have been fully reclassified into dev_fee for
-- every project (Cleveland and Intech were the only two with a nonzero
-- or_fee; both were moved into dev_fee directly, leaving or_fee at 0
-- everywhere). This column is no longer used anywhere in the schema.
ALTER TABLE public.dev_fee_projects DROP COLUMN or_fee;
