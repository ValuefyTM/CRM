-- Inspections app (inspectii.valuefy.ro): scheduling, the sheet filled in on site, photos and the property
-- characteristics observed at the inspection. Inspectors and evaluators use it; the CRM only reads it for now.
-- Times of a scheduled visit are Bucharest local time "YYYY-MM-DDTHH:MM", as imported from Glide.

-- ---------- scheduling ----------
ALTER TABLE inspections ADD COLUMN order_id TEXT REFERENCES orders(id);
ALTER TABLE inspections ADD COLUMN sheet_type TEXT;                 -- apartament | casa | teren | comercial (chosen form)
ALTER TABLE inspections ADD COLUMN duration_min INTEGER;            -- planned length of the visit
ALTER TABLE inspections ADD COLUMN address TEXT;                    -- where to meet, when it differs from the property address
ALTER TABLE inspections ADD COLUMN lat REAL;                        -- pin for the map (else the property's geo)
ALTER TABLE inspections ADD COLUMN lng REAL;
ALTER TABLE inspections ADD COLUMN scheduled_by TEXT REFERENCES users(id);
ALTER TABLE inspections ADD COLUMN scheduled_via TEXT;              -- app | crm
ALTER TABLE inspections ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspections ADD COLUMN reschedule_reason TEXT;
ALTER TABLE inspections ADD COLUMN contact_notified_at TEXT;        -- the contact was told the date (call / SMS), set by the inspector
ALTER TABLE inspections ADD COLUMN started_at TEXT;                 -- inspector opened the sheet on site
ALTER TABLE inspections ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_inspections_scheduled ON inspections(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspections_asset ON inspections(asset_id);

-- History of every (re)scheduling, so the CRM can show who moved a visit and why.
CREATE TABLE IF NOT EXISTS inspection_schedule_log (
  id             TEXT PRIMARY KEY,
  inspection_id  TEXT NOT NULL REFERENCES inspections(id),
  scheduled_at   TEXT,                                -- new date (empty when the visit was unscheduled / cancelled)
  previous_at    TEXT,
  inspector_id   TEXT REFERENCES users(id),
  reason         TEXT,
  via            TEXT NOT NULL DEFAULT 'app',         -- app | crm
  by_user        TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_schedule_log_inspection ON inspection_schedule_log(inspection_id, created_at);

-- ---------- the sheet ----------
ALTER TABLE inspection_sheets ADD COLUMN sheet_type TEXT;           -- apartament | casa | teren | comercial
ALTER TABLE inspection_sheets ADD COLUMN status TEXT NOT NULL DEFAULT 'submitted'; -- draft | submitted (Glide sheets are submitted)
ALTER TABLE inspection_sheets ADD COLUMN form_version INTEGER;      -- version of the form definition the answers follow
ALTER TABLE inspection_sheets ADD COLUMN started_at TEXT;
ALTER TABLE inspection_sheets ADD COLUMN submitted_at TEXT;
ALTER TABLE inspection_sheets ADD COLUMN present_role TEXT;         -- owner | client | tenant | agent | other
ALTER TABLE inspection_sheets ADD COLUMN present_phone TEXT;
ALTER TABLE inspection_sheets ADD COLUMN signed_at TEXT;
ALTER TABLE inspection_sheets ADD COLUMN lat REAL;                  -- GPS where the sheet was signed
ALTER TABLE inspection_sheets ADD COLUMN lng REAL;
ALTER TABLE inspection_sheets ADD COLUMN accuracy_m REAL;
ALTER TABLE inspection_sheets ADD COLUMN photos_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspection_sheets ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sheets_inspection ON inspection_sheets(inspection_id) WHERE inspection_id IS NOT NULL AND glide_id IS NULL;

-- Photos taken during the inspection (files in R2 under inspectii/<inspection id>/).
CREATE TABLE IF NOT EXISTS inspection_photos (
  id             TEXT PRIMARY KEY,                    -- generated on the phone, so a retried upload is not duplicated
  inspection_id  TEXT NOT NULL REFERENCES inspections(id),
  sheet_id       TEXT REFERENCES inspection_sheets(id),
  category       TEXT NOT NULL DEFAULT 'other',       -- exterior | interior | kitchen | bathroom | installations | meters | defects | surroundings | documents | other
  caption        TEXT,
  r2_key         TEXT NOT NULL,
  content_type   TEXT,
  size_bytes     INTEGER,
  width          INTEGER,
  height         INTEGER,
  taken_at       TEXT,
  lat            REAL,
  lng            REAL,
  sort           INTEGER NOT NULL DEFAULT 0,
  uploaded_by    TEXT REFERENCES users(id),
  deleted_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_inspection_photos ON inspection_photos(inspection_id, category, sort);

-- ---------- property characteristics observed at the inspection ----------
-- One row per sheet: a snapshot of the property on the inspection day (the next valuation of the same property gets
-- its own row). Choice fields hold the label shown in the form; multiple choices are joined by ", ".
-- Utilities: *_connected 1/0, *_meter 1/0 (meter fitted, when connected), *_distance_m (to the network, when not).
CREATE TABLE IF NOT EXISTS property_features (
  id                      TEXT PRIMARY KEY,
  sheet_id                TEXT NOT NULL UNIQUE REFERENCES inspection_sheets(id),
  inspection_id           TEXT REFERENCES inspections(id),
  property_id             TEXT REFERENCES crm_properties(id),
  sheet_type              TEXT NOT NULL,              -- apartament | casa | teren | comercial
  observed_at             TEXT,
  -- building
  year_built              INTEGER,
  height_regime           TEXT,                       -- e.g. P+10, S+P+1+M
  floor                   TEXT,                       -- floor of the unit
  structure               TEXT,
  foundation              TEXT,
  walls                   TEXT,                       -- exterior walls (închideri)
  roof                    TEXT,
  roof_cover              TEXT,
  exterior_finish         TEXT,
  elevator                TEXT,
  thermal_insulation      TEXT,
  building_condition      TEXT,
  -- unit / built areas
  rooms                   INTEGER,
  bathrooms               INTEGER,
  usable_area             REAL,                       -- m², measured
  built_area              REAL,                       -- m²
  layout                  TEXT,                       -- decomandat, semidecomandat…
  balconies               TEXT,
  orientation             TEXT,
  -- finishes
  finish_level            TEXT,
  floors_rooms            TEXT,
  floors_wet              TEXT,
  wall_finish             TEXT,
  windows                 TEXT,
  last_renovation         INTEGER,
  -- installations
  heating                 TEXT,
  air_conditioning        TEXT,
  installations_condition TEXT,
  own_sources             TEXT,                       -- well, septic tank, solar panels
  power_kw                REAL,
  fire_safety             TEXT,
  -- utility connections
  water_connected         INTEGER,
  water_meter             INTEGER,
  water_distance_m        REAL,
  sewer_connected         INTEGER,
  sewer_distance_m        REAL,
  gas_connected           INTEGER,
  gas_meter               INTEGER,
  gas_distance_m          REAL,
  power_connected         INTEGER,
  power_meter             INTEGER,
  power_distance_m        REAL,
  -- land
  land_area               REAL,                       -- m², measured
  frontage_m              REAL,
  depth_m                 REAL,
  shape                   TEXT,
  slope                   TEXT,
  fencing                 TEXT,
  access_road             TEXT,
  urban_zone              TEXT,                       -- intravilan | extravilan
  land_use                TEXT,                       -- categorie de folosință
  urban_docs              TEXT,                       -- PUG, PUZ, CU
  land_constructions      TEXT,
  -- commercial / industrial
  use_type                TEXT,
  clear_height_m          REAL,
  occupancy               TEXT,                       -- owner-occupied, rented, vacant
  floor_type              TEXT,
  logistics               TEXT,                       -- doors, docks, truck access, crane
  offices_area            REAL,
  offices_finish          TEXT,
  sanitary                TEXT,
  road_access             TEXT,
  yard_area               REAL,
  visibility              TEXT,
  -- surroundings
  neighbourhood           TEXT,
  surroundings            TEXT,                       -- residential, agricultural, industrial…
  public_transport        TEXT,
  parking                 TEXT,
  annexes                 TEXT,
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_property_features_property ON property_features(property_id, observed_at);
