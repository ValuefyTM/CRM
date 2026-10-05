-- VALUEFY CRM — phase 1: team accounts, partners (colaboratori) and email sign-in.
-- Shares the website's database (valuefy-db). CRM migrations are numbered 1xxx.

-- VALUEFY team members who use the CRM.
CREATE TABLE IF NOT EXISTS staff_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,           -- lower-case
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'staff',  -- 'owner' | 'admin' | 'staff'
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'disabled'
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);

-- Partner organisations: credit brokers, real-estate agencies, banks, lawyers, accountants…
CREATE TABLE IF NOT EXISTS partners (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,                    -- see PARTNER_KINDS in src/lib/partners.ts
  cui         TEXT,
  reg_com     TEXT,
  email       TEXT,
  phone       TEXT,
  city        TEXT,
  address     TEXT,
  notes       TEXT,                             -- internal, never shown to the partner
  status      TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'suspended'
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(name);

-- People who sign in to the partner portal on behalf of a partner.
CREATE TABLE IF NOT EXISTS partner_users (
  id            TEXT PRIMARY KEY,
  partner_id    TEXT NOT NULL REFERENCES partners(id),
  email         TEXT NOT NULL UNIQUE,           -- lower-case
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  status        TEXT NOT NULL DEFAULT 'invited',-- 'invited' | 'active' | 'disabled'
  invited_at    TEXT,
  activated_at  TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_users_partner ON partner_users(partner_id);

-- One-time sign-in codes / links and invitations. Only hashes are stored.
CREATE TABLE IF NOT EXISTS auth_codes (
  id          TEXT PRIMARY KEY,
  audience    TEXT NOT NULL,                    -- 'staff' | 'partner'
  purpose     TEXT NOT NULL,                    -- 'login' | 'invite'
  email       TEXT NOT NULL,
  code_hash   TEXT,                             -- 6-digit code (login only)
  token_hash  TEXT NOT NULL,                    -- link token
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email, audience, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_codes_token ON auth_codes(token_hash);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  audience    TEXT NOT NULL,                    -- 'staff' | 'partner'
  user_id     TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Who did what (team actions and partner account events).
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor      TEXT NOT NULL,                     -- 'staff:<id>' | 'partner:<id>' | 'system'
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
