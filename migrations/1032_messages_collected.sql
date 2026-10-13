-- Messages on a report or an order (the Glide chat, VFY_PC_CHATS, and the ones written in the CRM from now on).
CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  glide_id       TEXT UNIQUE,
  entity         TEXT NOT NULL,                          -- report | order
  entity_id      TEXT NOT NULL,
  author_id      TEXT REFERENCES users(id),
  author_name    TEXT,
  author_email   TEXT,
  body           TEXT NOT NULL,
  attachment_url TEXT,                                   -- r2:<key> once moved from Glide
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_entity ON messages(entity, entity_id, created_at);

-- Payment collected for a report (marked by hand; most reports are paid through their invoice).
ALTER TABLE reports ADD COLUMN collected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN collected_at TEXT;
