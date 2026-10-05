-- Core CRM data, aligned with the VALUEFY Glide schema (crm_evaluari_schema_v2) and adapted to D1/SQLite:
-- enums are TEXT with the allowed values in comments, money is REAL, dates are ISO text.
-- Every table that receives Glide data has glide_id, so the import can run again without duplicates.

-- Clients, banks, IFN, UAT, ANAF, brokers and valuation firms (VALUEFY, collaborating firms).
CREATE TABLE IF NOT EXISTS entities (
  id              TEXT PRIMARY KEY,
  glide_id        TEXT UNIQUE,
  kind            TEXT NOT NULL,         -- person | company | bank | ifn | uat | anaf | broker | valuation_firm | other
  name            TEXT NOT NULL,
  cui             TEXT,                  -- companies only (CNPs of individuals are not stored)
  reg_no          TEXT,
  billing_address TEXT,
  phone           TEXT,
  email           TEXT,
  code            TEXT,                  -- short code used on reports, e.g. BCR, BRD, UCB
  approved        INTEGER,               -- banks: VALUEFY is on the bank's approved list (1/0)
  partner_visible INTEGER,               -- banks: available to partners when they order
  anevar_auth     TEXT,                  -- valuation firms: ANEVAR authorisation number
  logo_url        TEXT,
  partner_id      TEXT REFERENCES partners(id),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind, name);

-- Contracts: classic (one client, one job) or framework (banks).
CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  glide_id        TEXT UNIQUE,
  kind            TEXT NOT NULL,         -- classic | framework
  number          TEXT,
  signed_on       TEXT,
  client_id       TEXT REFERENCES entities(id),
  currency        TEXT NOT NULL DEFAULT 'RON',
  fee             REAL,
  services        TEXT,
  valuation_types TEXT,                  -- EPI,EBM,EI
  report_type     TEXT,
  purpose         TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);

-- Collaboration agreements with other valuation firms (VALUEFY works for them for a share of the fee).
CREATE TABLE IF NOT EXISTS collaborations (
  id          TEXT PRIMARY KEY,
  glide_id    TEXT UNIQUE,
  firm_id     TEXT NOT NULL REFERENCES entities(id),
  number      TEXT,
  signed_on   TEXT,
  share       REAL,                      -- share of the fee that goes to VALUEFY (0.7 = 70%)
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Billing statements sent to a bank (a batch of orders).
CREATE TABLE IF NOT EXISTS statements (
  id          TEXT PRIMARY KEY,
  glide_id    TEXT UNIQUE,
  contract_id TEXT REFERENCES contracts(id),
  number      TEXT,
  issued_on   TEXT,
  total       REAL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Orders: the portal ones (phase 2a) plus bank, collaboration and historical partner orders.
-- Rebuilt so the portal-only columns can be empty for orders that came another way.
PRAGMA defer_foreign_keys = true;
CREATE TABLE orders_new (
  id                  TEXT PRIMARY KEY,
  seq                 INTEGER UNIQUE,                   -- CO-<seq> for orders placed in this CRM / portal
  source              TEXT NOT NULL,                    -- partner | client | bank | collab
  created_by          TEXT REFERENCES users(id),
  partner_id          TEXT REFERENCES partners(id),
  property_type       TEXT,
  city                TEXT,
  address             TEXT,
  surface_area        REAL,
  land_area           REAL,
  rooms               INTEGER,
  purpose             TEXT,
  bank                TEXT,
  urgent              INTEGER NOT NULL DEFAULT 0,
  client_name         TEXT,
  client_phone        TEXT,
  client_email        TEXT,
  contact_name        TEXT,
  contact_phone       TEXT,
  inspection_notes    TEXT,
  may_contact_client  INTEGER NOT NULL DEFAULT 1,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'received', -- received | draft | in_progress | suspended | done | cancelled
  docs_missing        INTEGER NOT NULL DEFAULT 0,
  viewed_at           TEXT,
  viewed_by           TEXT,
  -- bank / collaboration orders
  glide_id            TEXT UNIQUE,
  contract_id         TEXT REFERENCES contracts(id),
  collaboration_id    TEXT REFERENCES collaborations(id),
  client_id           TEXT REFERENCES entities(id),
  bank_id             TEXT REFERENCES entities(id),
  bank_branch         TEXT,
  bank_ref            TEXT,                             -- order number in the bank's application
  report_type         TEXT,
  fee                 REAL,
  share               REAL,
  fee_net             REAL,
  statement_id        TEXT REFERENCES statements(id),
  referral_order_id   TEXT,                             -- partner order that led to this order
  ordered_on          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO orders_new (id, seq, source, created_by, partner_id, property_type, city, address, surface_area, land_area, rooms, purpose, bank, urgent,
  client_name, client_phone, client_email, contact_name, contact_phone, inspection_notes, may_contact_client, notes, status, docs_missing,
  viewed_at, viewed_by, created_at, updated_at)
SELECT id, seq, source, created_by, partner_id, property_type, city, address, surface_area, land_area, rooms, purpose, bank, urgent,
  client_name, client_phone, client_email, contact_name, contact_phone, inspection_notes, may_contact_client, notes, status, docs_missing,
  viewed_at, viewed_by, created_at, updated_at
FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_creator ON orders(created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_contract ON orders(contract_id);

-- Reports: the deliverable. Linked to a contract and/or an order.
CREATE TABLE IF NOT EXISTS reports (
  id               TEXT PRIMARY KEY,
  glide_id         TEXT UNIQUE,
  number           TEXT,
  label            TEXT,
  issuer_id        TEXT REFERENCES entities(id),        -- valuation firm that signs the report
  contract_id      TEXT REFERENCES contracts(id),
  order_id         TEXT REFERENCES orders(id),
  client_id        TEXT REFERENCES entities(id),
  recipient_id     TEXT REFERENCES entities(id),        -- bank / user of the report
  bank_branch      TEXT,
  report_type      TEXT,
  valuation_types  TEXT,
  purpose          TEXT,
  value_type       TEXT,
  valuation_date   TEXT,
  report_date      TEXT,
  received_on      TEXT,                                -- date the job came in
  uploaded_on      TEXT,
  result_value     REAL,
  currency         TEXT NOT NULL DEFAULT 'RON',
  fee              REAL,
  collab_fee       REAL,
  status           TEXT NOT NULL DEFAULT 'draft',       -- draft | in_progress | suspended | done | cancelled
  suspend_reason   TEXT,
  reporting_year   INTEGER,
  referral_user_id TEXT REFERENCES users(id),           -- partner who brought the job
  market_analysis  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_order ON reports(order_id);
CREATE INDEX IF NOT EXISTS idx_reports_contract ON reports(contract_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date);

CREATE TABLE IF NOT EXISTS report_members (
  report_id  TEXT NOT NULL REFERENCES reports(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL,                             -- inspector | evaluator | verifier | assistant
  PRIMARY KEY (report_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_report_members_user ON report_members(user_id, role);

-- Properties (stable identity, reused across valuations) and the assets valued in each report.
CREATE TABLE IF NOT EXISTS properties (
  id             TEXT PRIMARY KEY,
  glide_id       TEXT UNIQUE,
  category       TEXT,
  type           TEXT,
  construction   TEXT,                                  -- existing | under_construction
  county         TEXT,
  city           TEXT,
  street_type    TEXT,
  street         TEXT,
  number         TEXT,
  block          TEXT,
  stair          TEXT,
  floor          TEXT,
  apartment      TEXT,
  zone           TEXT,
  full_address   TEXT,
  geo            TEXT,
  cf_number      TEXT,
  cad_building   TEXT,
  cad_land       TEXT,
  usable_area    REAL,
  year_built     INTEGER,
  description    TEXT,
  image_url      TEXT,
  cf_file        TEXT,                                  -- Glide/AppSheet path until the files are moved to R2
  plan_file      TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_properties_cf ON properties(cf_number);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);

CREATE TABLE IF NOT EXISTS assets (
  id            TEXT PRIMARY KEY,
  glide_id      TEXT UNIQUE,
  report_id     TEXT REFERENCES reports(id),            -- empty for historical assets whose report is missing
  property_id   TEXT NOT NULL REFERENCES properties(id),
  is_main       INTEGER NOT NULL DEFAULT 0,
  value         REAL,
  currency      TEXT NOT NULL DEFAULT 'RON',
  approach      TEXT,                                   -- market | income | cost
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_report ON assets(report_id);
CREATE INDEX IF NOT EXISTS idx_assets_property ON assets(property_id);

-- Inspection of an asset (schedule / reschedule) and the sheet filled in on site.
CREATE TABLE IF NOT EXISTS inspections (
  id             TEXT PRIMARY KEY,
  glide_id       TEXT UNIQUE,
  asset_id       TEXT NOT NULL REFERENCES assets(id),
  report_id      TEXT REFERENCES reports(id),
  inspector_id   TEXT REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'to_schedule',   -- to_schedule | scheduled | done | cancelled
  scheduled_at   TEXT,
  done_at        TEXT,
  contact_kind   TEXT,                                  -- client | owner | agent | other
  contact_name   TEXT,
  contact_phone  TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_inspections_inspector ON inspections(inspector_id, status);
CREATE INDEX IF NOT EXISTS idx_inspections_report ON inspections(report_id);

CREATE TABLE IF NOT EXISTS inspection_sheets (
  id              TEXT PRIMARY KEY,
  glide_id        TEXT UNIQUE,
  inspection_id   TEXT REFERENCES inspections(id),
  asset_id        TEXT REFERENCES assets(id),
  inspector_id    TEXT REFERENCES users(id),
  done_at         TEXT,
  present_person  TEXT,
  signature_url   TEXT,
  location        TEXT,
  photo_url       TEXT,
  description     TEXT,
  details         TEXT,                                 -- JSON
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sheets_asset ON inspection_sheets(asset_id);

-- Personal to-dos.
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  glide_id    TEXT UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',             -- todo | in_progress | done
  deadline    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Team members: Glide id and fee shares.
ALTER TABLE users ADD COLUMN glide_id TEXT;
ALTER TABLE users ADD COLUMN share_evaluator REAL;      -- % of the fee for reports they evaluate
ALTER TABLE users ADD COLUMN share_verifier REAL;       -- % for reports they verify
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_glide ON users(glide_id);
-- Partner firms imported from Glide.
ALTER TABLE partners ADD COLUMN glide_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_glide ON partners(glide_id);
PRAGMA defer_foreign_keys = false;
