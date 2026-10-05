-- Report page: internal notes, delivery, and the report's own documents (source documents and the signed final PDF).
ALTER TABLE reports ADD COLUMN notes TEXT;
ALTER TABLE reports ADD COLUMN delivered_at TEXT;
ALTER TABLE reports ADD COLUMN delivered_by TEXT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS report_documents (
  id            TEXT PRIMARY KEY,
  report_id     TEXT NOT NULL REFERENCES reports(id),
  kind          TEXT NOT NULL DEFAULT 'source',         -- source | final
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER,
  r2_key        TEXT,                                   -- empty while the document is requested but missing
  status        TEXT NOT NULL DEFAULT 'uploaded',       -- uploaded | missing
  requested_at  TEXT,
  uploaded_by   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_report_documents_report ON report_documents(report_id, kind);
