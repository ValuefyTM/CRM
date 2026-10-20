-- The open inspections in UVALO are sent again once (at the CRM's first activity), so each keeps only the documents
-- ticked in the CRM: duplicates, unticked and old documents given by the firm are removed there.
INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('uvalo_resend_pending', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system')
  ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at;
