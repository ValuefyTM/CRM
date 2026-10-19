-- Monitorizare ANEVAR: the yearly activity report (Anexa 4) computed live from the reports.
-- A year is frozen when it is reported: the set of reports declared is kept, and whatever is finished later in that
-- year goes into the next year's report.
CREATE TABLE IF NOT EXISTS anevar_freezes (
  year INTEGER PRIMARY KEY,
  frozen_at TEXT NOT NULL,
  frozen_by TEXT,
  ids_json TEXT NOT NULL,
  summary_json TEXT,
  note TEXT
);
-- Per-report decisions: left out of the report, or counted on another line / specialisation than the automatic one.
CREATE TABLE IF NOT EXISTS anevar_marks (
  report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  excluded INTEGER NOT NULL DEFAULT 0,
  line INTEGER,
  spec INTEGER,
  note TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
