-- "Included in PIP" flag on procurement bid items — used on Asset Management
-- projects to identify purchases outside the PIP's approved scope. Nullable
-- rather than a strict boolean default: existing/new items start unset
-- (neither Yes nor No) until someone actually reviews them against the PIP,
-- since defaulting to "Yes" would silently misrepresent unreviewed items as
-- in-scope.
ALTER TABLE public.vendor_bid_items
  ADD COLUMN included_in_pip boolean DEFAULT NULL;
