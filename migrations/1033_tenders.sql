-- Public procurement notices from SEAP / SICAP (e-licitatie.ro) that match the firm's criteria (valuations for
-- town halls and other institutions): read every morning, kept here, followed in the CRM (Licitații).
CREATE TABLE IF NOT EXISTS tenders (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'sicap',
  kind            TEXT NOT NULL,                          -- notice (call for bids) | direct (direct acquisition)
  ext_id          TEXT NOT NULL,                          -- SICAP id of the notice
  notice_no       TEXT,
  title           TEXT NOT NULL,
  authority       TEXT,
  county          TEXT,
  cpv             TEXT,
  value_ron       REAL,
  published_at    TEXT,
  deadline_at     TEXT,
  procedure       TEXT,                                   -- procedure type / state as SICAP shows it
  url             TEXT,
  match_reason    TEXT,
  status          TEXT NOT NULL DEFAULT 'new',            -- new | analyze | bid | skip
  notes           TEXT,
  raw             TEXT,                                   -- the SICAP row, for fields not mapped yet
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source, kind, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status, published_at);
