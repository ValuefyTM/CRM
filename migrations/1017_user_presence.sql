-- Last time a user was active in any of the apps (CRM, inspections, portal): shown as online / offline next to them.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_users_seen ON users(last_seen_at);
