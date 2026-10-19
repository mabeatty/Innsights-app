-- "Held" transactions: still unassigned (draw_id is null) but left out of the draw
-- being built. Closing a draw claims only the non-held, non-Pending transactions,
-- then clears this flag on whatever is left so those roll into the NEXT draw by
-- default. A held transaction is still a real cost; it just isn't billed yet.
alter table budget_transactions add column if not exists exclude_from_draw boolean not null default false;
comment on column budget_transactions.exclude_from_draw is
  'true = held out of the draw currently being built. Only meaningful while draw_id is null; cleared when a draw closes so the transaction rolls into the next one.';
