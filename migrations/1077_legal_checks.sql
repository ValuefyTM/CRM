-- Legal check of an asset's documents (Acte & livrare → Analiză juridică): run on demand, kept per report and asset.
-- `result` holds the verdict, the issues, the concordance table and the ownership chain (JSON); `resolved` the
-- evaluator's marks on the issues (issue key → state, note, who, when).
CREATE TABLE IF NOT EXISTS legal_checks (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  asset_id    TEXT,
  verdict     TEXT NOT NULL,                 -- ok | incomplete | problems | failed
  result      TEXT NOT NULL,
  resolved    TEXT,
  docs_count  INTEGER NOT NULL DEFAULT 0,
  ms          INTEGER,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_checks_report ON legal_checks(report_id, asset_id, created_at);

-- What was read from each document (an uploaded file does not change, so it is read once): `ref` = origin:id.
CREATE TABLE IF NOT EXISTS doc_extracts (
  ref         TEXT PRIMARY KEY,
  model       TEXT,
  data        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
