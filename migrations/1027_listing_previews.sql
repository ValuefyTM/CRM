-- Preview links for unpublished listings: the CRM creates a token, valuefy.ro checks it and shows the draft.
-- (The listing tables themselves were created by the website's migrations, in the same database.)
CREATE TABLE IF NOT EXISTS listing_previews (
  token      TEXT PRIMARY KEY,
  user_id    TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
