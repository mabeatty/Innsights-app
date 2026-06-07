
-- Fix Draw #3 total_amount: recalculate from tagged transactions (net of retainage)
UPDATE draw_history
SET total_amount = (
  SELECT COALESCE(SUM(bt.amount) - SUM(bt.retainage_amount), 0)
  FROM budget_transactions bt
  WHERE bt.draw_id = draw_history.id
    AND bt.status IN ('Approved', 'Paid', 'Deferred')
)
WHERE id = '80d38edb-7fda-46ff-83a1-cb6d80c1c1c3';

-- Also update the cash flow plan for Draw #3's month (February 2026)
UPDATE capital_cash_flow
SET draw_amount = (
  SELECT total_amount FROM draw_history WHERE id = '80d38edb-7fda-46ff-83a1-cb6d80c1c1c3'
)
WHERE project_id = (SELECT project_id FROM draw_history WHERE id = '80d38edb-7fda-46ff-83a1-cb6d80c1c1c3')
  AND month_year = '2026-02';
