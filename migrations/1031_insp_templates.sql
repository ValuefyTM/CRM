-- Inspection sheet templates edited in the CRM (Setări → Fișe de inspecție): one row per sheet type, the groups and
-- questions as JSON (see src/lib/insp-templates.ts). No row: the built-in form.
CREATE TABLE IF NOT EXISTS insp_templates (
  sheet_type TEXT PRIMARY KEY,
  groups     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
