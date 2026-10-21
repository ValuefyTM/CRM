-- The client's identity card: the photos (front / back) kept at the client, read in the browser (OCR, no AI).
CREATE TABLE IF NOT EXISTS entity_documents (
  id           TEXT PRIMARY KEY,
  entity_id    TEXT NOT NULL REFERENCES entities(id),
  kind         TEXT NOT NULL DEFAULT 'id_card',
  filename     TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  content_type TEXT,
  size_bytes   INTEGER,
  uploaded_by  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_entity_documents_entity ON entity_documents(entity_id, kind);
-- The card itself: series and number, valid until (the CNP and the address parts are on entities already).
ALTER TABLE entities ADD COLUMN id_series TEXT;
ALTER TABLE entities ADD COLUMN id_number TEXT;
ALTER TABLE entities ADD COLUMN id_expires TEXT;
CREATE INDEX IF NOT EXISTS idx_entities_cnp ON entities(cnp);
