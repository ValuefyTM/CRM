-- Once, after this deploy: the open inspections already in UVALO are sent again (they get the report's client and its
-- user, the bank). Picked up by the CRM at its first activity (see resendPending in uvalo.ts), then removed.
INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by)
  VALUES ('uvalo_resend_pending', 'client, report_user', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system');
