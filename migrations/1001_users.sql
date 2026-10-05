-- One table for every account, organised by kind:
--   internal — VALUEFY team: owners, administrators, operators and evaluators (employees or external contractors)
--   partner  — people who order valuations on behalf of a partner firm (brokers, agencies…), portal.valuefy.ro
--   client   — clients with an account in the client portal, portal.valuefy.ro
-- Replaces staff_users and partner_users (their rows are copied with the same ids, so sessions stay valid).

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,                     -- 'internal' | 'partner' | 'client'
  email           TEXT NOT NULL,                     -- lower-case; unique per kind
  name            TEXT NOT NULL DEFAULT '',
  phone           TEXT,
  role            TEXT NOT NULL,                     -- internal: owner|admin|evaluator|operator · partner: owner|member · client: client
  status          TEXT NOT NULL DEFAULT 'invited',   -- 'invited' | 'active' | 'disabled'
  partner_id      TEXT REFERENCES partners(id),      -- partner users: their firm
  engagement      TEXT,                              -- internal: 'employee' | 'contractor'
  anevar_no       TEXT,                              -- evaluators: ANEVAR membership card number
  specializations TEXT,                              -- evaluators: comma list (EPI,EBM,EI,EIF)
  coverage        TEXT,                              -- evaluators: counties / area they cover
  client_type     TEXT,                              -- clients: 'person' | 'company'
  company         TEXT,                              -- clients that are companies
  cui             TEXT,
  city            TEXT,
  notes           TEXT,                              -- internal notes, never shown to the user
  created_by      TEXT,
  invited_at      TEXT,
  activated_at    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kind_email ON users(kind, email);
CREATE INDEX IF NOT EXISTS idx_users_partner ON users(partner_id);

INSERT INTO users (id, kind, email, name, role, status, engagement, activated_at, last_login_at, created_at, updated_at)
  SELECT id, 'internal', email, name, CASE role WHEN 'staff' THEN 'operator' ELSE role END, status, 'employee',
         COALESCE(last_login_at, created_at), last_login_at, created_at, created_at
  FROM staff_users;

INSERT INTO users (id, kind, email, name, phone, role, status, partner_id, invited_at, activated_at, last_login_at, created_at, updated_at)
  SELECT id, 'partner', email, name, phone, role, status, partner_id, invited_at, activated_at, last_login_at, created_at, created_at
  FROM partner_users;

-- Sessions and sign-in codes are now keyed by the user kind.
UPDATE sessions SET audience = 'internal' WHERE audience = 'staff';
UPDATE auth_codes SET audience = 'internal' WHERE audience = 'staff';

DROP TABLE partner_users;
DROP TABLE staff_users;
