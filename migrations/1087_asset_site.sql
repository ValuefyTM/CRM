-- The site analysis of an asset (tab „Amplasament” of the asset page): the parcel (its contour from the ANCPI plan in UVALO,
-- or from the CF / site plan among the documents, read with AI), the computed shape, frontage, depth, orientation, POT,
-- the area around (OpenStreetMap: amenities, roads, negative factors) and the text „Descrierea amplasamentului”.
CREATE TABLE IF NOT EXISTS asset_site (
  asset_id   TEXT PRIMARY KEY REFERENCES assets(id),
  report_id  TEXT NOT NULL REFERENCES reports(id),
  source     TEXT,                 -- ancpi | doc | zone
  doc_ref    TEXT,                 -- the document read (doc source)
  parcel     TEXT,                 -- JSON
  zone       TEXT,                 -- JSON
  text       TEXT,
  style      TEXT,                 -- scurt | detaliat | academic
  unverified TEXT,                 -- JSON: numbers of the text not found in the data
  situated   TEXT,                 -- intravilan | extravilan (the valuer says; not deduced)
  in_annex   INTEGER NOT NULL DEFAULT 0,
  figures    TEXT,                 -- JSON: R2 keys of the figures (zone map, site plan) for the photo annex
  sent_at    TEXT,                 -- the text sent to the drafting mode
  made_by    TEXT REFERENCES users(id),
  made_at    TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_asset_site_report ON asset_site(report_id);
