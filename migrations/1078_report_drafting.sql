-- Report drafting mode (Rapoarte → Redactare): the texts written for the bank's application, field by field.
-- `report_templates` keeps the firm's changes to a template (the defaults live in code, src/lib/report-templates.ts):
-- chapters, fields, AI instructions, limits and the style examples, as JSON.
CREATE TABLE IF NOT EXISTS report_templates (
  key         TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL
);

-- One text per report, asset and template field. `state`: draft (written, not copied yet) | copied | stale (written
-- before the market parameters changed). The field `_market` holds the market parameters (JSON), `_template` the
-- template chosen for the report, a facts field the keys of the values already copied (JSON).
CREATE TABLE IF NOT EXISTS report_drafts (
  report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  asset_id    TEXT NOT NULL DEFAULT '',
  field       TEXT NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'draft',
  missing     TEXT,
  model       TEXT,
  gen_at      TEXT,
  copied_at   TEXT,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (report_id, asset_id, field)
);
CREATE INDEX IF NOT EXISTS idx_report_drafts_field ON report_drafts(field, state);
