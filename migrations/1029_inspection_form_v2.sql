-- Inspection sheets v2 (fields the BCR / BRD reports ask for): location, building details, findings against the documents.
-- property_features is close to D1's 100-column limit, so the new answers are kept together as JSON:
-- locality_position, zone_type, transport_distance_m, flood_risk, water_body_distance_m, building_kind, seismic_class,
-- common_areas, balcony_area, ceiling_height_m, entrance_door, interior_doors, telecom, renewables, thermal_renovation_year,
-- street_fronts, land_improvements, easements, inspection_scope, completed, completion_pct, doc_differences,
-- doc_differences_notes, defects (see EXTRA_FEATURES in src/lib/insp-forms.ts).
ALTER TABLE property_features ADD COLUMN extra TEXT;
