-- Nightly sync of Development Fee monthly revenue actuals from QuickBooks,
-- 3:15 AM UTC (offset from the 3:00 AM risk-detection job to avoid both
-- hitting the DB at once). Runs for every org that has an active
-- QuickBooks connection, since dev_fee_qb_account_map/actuals are already
-- org-scoped.
SELECT cron.schedule(
  'nightly-dev-fee-quickbooks-sync',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zwkelhwxvfthpdlquill.supabase.co/functions/v1/sync-dev-fee-revenue-quickbooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('org_id', qc.org_id)
  )
  FROM quickbooks_connections qc;
  $$
);
