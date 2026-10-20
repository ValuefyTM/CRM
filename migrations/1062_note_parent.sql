-- A valuation note (Notă de evaluare) belongs to an initial report (usually a building under construction, valued
-- again as the works go on): reports.parent_report_id. Orders carry it until their report is opened.
ALTER TABLE reports ADD COLUMN parent_report_id TEXT REFERENCES reports(id);
ALTER TABLE orders ADD COLUMN parent_report_id TEXT REFERENCES reports(id);
CREATE INDEX IF NOT EXISTS idx_reports_parent ON reports(parent_report_id);

-- The notes already in the CRM, linked to their initial report: an earlier report (not a note) on the same property,
-- or with the same CF / cadastral number, of the same client or on the very same property; the same client first,
-- then the same property, then the highest fee, then the latest.
UPDATE reports SET parent_report_id = (
  SELECT r2.id FROM assets an JOIN crm_properties pn ON pn.id = an.property_id
    JOIN crm_properties p2 ON p2.id = an.property_id
      OR (NULLIF(TRIM(pn.cf_number), '') IS NOT NULL AND p2.cf_number = pn.cf_number)
      OR (NULLIF(TRIM(pn.cad_building), '') IS NOT NULL AND p2.cad_building = pn.cad_building)
      OR (NULLIF(TRIM(pn.cad_land), '') IS NOT NULL AND p2.cad_land = pn.cad_land)
    JOIN assets a2 ON a2.property_id = p2.id
    JOIN reports r2 ON r2.id = a2.report_id
  WHERE an.report_id = reports.id AND r2.id <> reports.id
    AND COALESCE(r2.report_type, 'Raport de evaluare') NOT LIKE 'Not%'
    AND r2.status <> 'cancelled'
    AND COALESCE(r2.report_date, substr(r2.created_at, 1, 10)) <= COALESCE(reports.report_date, substr(reports.created_at, 1, 10))
    AND (r2.client_id = reports.client_id OR a2.property_id = an.property_id)
  ORDER BY r2.client_id = reports.client_id DESC, a2.property_id = an.property_id DESC, COALESCE(r2.fee, 0) DESC,
    COALESCE(r2.report_date, r2.created_at) DESC
  LIMIT 1)
WHERE report_type LIKE 'Not% de evaluare' AND parent_report_id IS NULL;

-- One property for the initial report and its notes: a note's (single) asset moves onto the initial report's property
-- (the same property, or the one with the same CF / cadastral number, else its main one); what the note's own property
-- knew (map point, photo, inspection features) goes with it, and the property left without assets is removed.
CREATE TABLE IF NOT EXISTS _note_merge (asset_id TEXT, old_p TEXT, new_p TEXT);
INSERT INTO _note_merge (asset_id, old_p, new_p)
  SELECT a.id, a.property_id, (
    SELECT a2.property_id FROM assets a2 JOIN crm_properties p2 ON p2.id = a2.property_id LEFT JOIN crm_properties pn ON pn.id = a.property_id
    WHERE a2.report_id = n.parent_report_id
    ORDER BY p2.id = pn.id DESC,
      (NULLIF(TRIM(pn.cf_number), '') IS NOT NULL AND p2.cf_number = pn.cf_number) DESC,
      (NULLIF(TRIM(pn.cad_building), '') IS NOT NULL AND p2.cad_building = pn.cad_building) DESC,
      (NULLIF(TRIM(pn.cad_land), '') IS NOT NULL AND p2.cad_land = pn.cad_land) DESC,
      a2.is_main DESC
    LIMIT 1)
  FROM assets a JOIN reports n ON n.id = a.report_id
  WHERE n.parent_report_id IS NOT NULL AND (SELECT COUNT(*) FROM assets x WHERE x.report_id = a.report_id) = 1;
DELETE FROM _note_merge WHERE new_p IS NULL OR new_p = old_p;
UPDATE crm_properties SET
    geo = COALESCE(NULLIF(geo, ''), (SELECT o.geo FROM _note_merge m JOIN crm_properties o ON o.id = m.old_p WHERE m.new_p = crm_properties.id AND NULLIF(o.geo, '') IS NOT NULL LIMIT 1)),
    image_url = COALESCE(NULLIF(image_url, ''), (SELECT o.image_url FROM _note_merge m JOIN crm_properties o ON o.id = m.old_p WHERE m.new_p = crm_properties.id AND NULLIF(o.image_url, '') IS NOT NULL LIMIT 1))
  WHERE id IN (SELECT new_p FROM _note_merge);
UPDATE assets SET property_id = (SELECT m.new_p FROM _note_merge m WHERE m.asset_id = assets.id) WHERE id IN (SELECT asset_id FROM _note_merge);
UPDATE property_features SET property_id = (SELECT m.new_p FROM _note_merge m WHERE m.old_p = property_features.property_id LIMIT 1)
  WHERE property_id IN (SELECT old_p FROM _note_merge) AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.property_id = property_features.property_id);
DELETE FROM crm_properties WHERE id IN (SELECT old_p FROM _note_merge)
  AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.property_id = crm_properties.id)
  AND NOT EXISTS (SELECT 1 FROM property_features f WHERE f.property_id = crm_properties.id);
DROP TABLE _note_merge;
