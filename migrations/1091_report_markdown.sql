-- The signed final report read by a cheap model into Markdown (for search and for an agent) and its key facts as JSON.
-- One row per report; the reading runs in a batch (Message Batches API: half price, minutes to hours).
CREATE TABLE IF NOT EXISTS report_markdown (
  report_id     TEXT PRIMARY KEY REFERENCES reports(id),
  doc_id        TEXT NOT NULL,              -- the final PDF read (report_documents.id)
  model         TEXT NOT NULL,
  status        TEXT NOT NULL,              -- queued | done | error
  batch_id      TEXT,
  markdown      TEXT,
  facts         TEXT,                       -- JSON
  pages         INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      REAL,
  error         TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_markdown_status ON report_markdown(status, batch_id);
