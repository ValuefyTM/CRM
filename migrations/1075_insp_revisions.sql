-- Completions asked by the evaluator on a submitted inspection sheet: the sheet goes back to the inspector's phone
-- (inspection_sheets.status = 'revision') with the evaluator's message, and is sent again from the app.
CREATE TABLE IF NOT EXISTS inspection_revisions (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  note          TEXT NOT NULL,
  requested_by  TEXT,
  requested_at  TEXT NOT NULL,
  done_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_inspection_revisions_insp ON inspection_revisions(inspection_id, requested_at);

-- Which app a device subscribed from: the CRM (the bell) or the inspections app (its own messages).
ALTER TABLE push_subscriptions ADD COLUMN app TEXT NOT NULL DEFAULT 'crm';
