-- ============================================================================
-- Local development overrides
-- ============================================================================

-- Override cleanup schedule: run every 5 minutes with a 5-minute cutoff
SELECT cron.unschedule('cleanup-expired-records');

SELECT cron.schedule(
  'cleanup-expired-records',
  '*/5 * * * *',
  $$SELECT public.cleanup_expired_records('5 minutes'::interval)$$
);
