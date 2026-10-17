-- Inspections done in UVALO (the phone app of app.uvalo.ro) instead of the CRM's own app, by a setting (Setări → Fișe de
-- inspecție → "Inspecții prin UVALO"): the CRM sends the inspection through the UVALO integration API (the inspector found by
-- the ANEVAR card), UVALO calls back the webhook /api/integrations/uvalo/webhook, and the finished sheet (answers, rooms,
-- photos, signature) is brought into the CRM as an inspection sheet. The CRM app stays as the fallback.
ALTER TABLE inspections ADD COLUMN uvalo_id TEXT;           -- the inspection in UVALO (its ref there = this id)
ALTER TABLE inspections ADD COLUMN uvalo_code TEXT;         -- INS-2026-0001
ALTER TABLE inspections ADD COLUMN uvalo_status TEXT;       -- prog | plan | lucru | gata | pred | deleted (as UVALO says)
ALTER TABLE inspections ADD COLUMN uvalo_error TEXT;        -- why the last send / import failed (shown on the report)
ALTER TABLE inspections ADD COLUMN uvalo_docs TEXT;         -- JSON: refs of the documents already sent
ALTER TABLE inspections ADD COLUMN uvalo_synced_at TEXT;
CREATE INDEX IF NOT EXISTS idx_inspections_uvalo ON inspections(uvalo_id);
