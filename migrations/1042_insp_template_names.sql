-- Inspection sheets the firm makes itself, and names given to the built-in ones (Setări → Fișe de inspecție).
-- key: a built-in type (apartament, casa, teren, comercial, accesoriu) or "c-<id>" for a sheet made in the CRM; base: the built-in
-- type a new sheet started from (its CRM columns, rooms and photo categories). Deleted sheets stay for the inspections that used them.
CREATE TABLE IF NOT EXISTS insp_template_meta (
  key        TEXT PRIMARY KEY,
  name       TEXT,
  base       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);

-- The sheet chosen for an inspection when it is one made in the CRM (sheet_type keeps its built-in type).
ALTER TABLE inspections ADD COLUMN template TEXT;
