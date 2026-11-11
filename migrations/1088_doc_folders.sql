-- The documents of a report as folders („Acte & livrare”, like the folders of Windows): the report's folder holds one
-- folder per asset (with „Acte” and „Poze inspecție” inside), „Livrabile” and the folders the team makes; a file
-- uploaded with the name of one already in its folder replaces it, the earlier versions kept.

-- Where a document sits. NULL: where it goes by default (on an asset: its „Acte”; the signed report: „Livrabile”; else
-- the report's folder). Else: 'root' | 'livrabile' | 'a:<asset>' | 'a:<asset>:acte' | 'a:<asset>:poze' | 'f:<folder id>'.
ALTER TABLE report_documents ADD COLUMN folder TEXT;
-- The version of the file the row holds now (1 for the first upload).
ALTER TABLE report_documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- The folders made by the team, inside the report's folder or one of its folders (`parent`: a folder key as above).
CREATE TABLE IF NOT EXISTS report_folders (
  id         TEXT PRIMARY KEY,
  report_id  TEXT NOT NULL REFERENCES reports(id),
  parent     TEXT NOT NULL DEFAULT 'root',
  name       TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_report_folders_report ON report_folders(report_id);

-- The earlier versions of a document (the row of report_documents holds the current one).
CREATE TABLE IF NOT EXISTS report_document_versions (
  id           TEXT PRIMARY KEY,
  doc_id       TEXT NOT NULL,
  report_id    TEXT NOT NULL REFERENCES reports(id),
  version      INTEGER NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT,
  size_bytes   INTEGER,
  r2_key       TEXT NOT NULL,
  uploaded_by  TEXT REFERENCES users(id),
  uploaded_at  TEXT,
  replaced_at  TEXT NOT NULL,
  replaced_by  TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_report_doc_versions_doc ON report_document_versions(doc_id, version);
