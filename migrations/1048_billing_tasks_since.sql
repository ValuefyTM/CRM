-- "De facturat" starts now: only the reports finished from the CRM after this moment are listed for invoicing.
-- The ones already closed (before this deploy) were invoiced the old way.
INSERT OR IGNORE INTO settings (key, value, updated_at, updated_by)
  VALUES ('billing_tasks_since', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system');
