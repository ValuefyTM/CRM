-- Where a property's coordinates come from, and when the cadastral lookup was last tried (so a number missing from the
-- plans is not asked again on every pass).
ALTER TABLE crm_properties ADD COLUMN geo_source TEXT;   -- cadastru | glide | gps (inspection) | manual
ALTER TABLE crm_properties ADD COLUMN geo_note TEXT;     -- e.g. "plan UAT Săcălaz, nr. 417800" or why it was not found
ALTER TABLE crm_properties ADD COLUMN geo_checked_at TEXT;
UPDATE crm_properties SET geo_source = 'glide' WHERE geo LIKE '%_,_%' AND geo_source IS NULL;
