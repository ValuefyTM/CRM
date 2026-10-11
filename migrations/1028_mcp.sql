-- MCP connector (crm.valuefy.ro/api/mcp): Claude reads CRM data on behalf of a signed-in team member.
-- OAuth 2.1 with dynamic client registration and PKCE; codes and tokens are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS mcp_clients (
  id            TEXT PRIMARY KEY,                 -- client_id given to the app (Claude) at registration
  name          TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,                    -- JSON array
  secret_hash   TEXT,                             -- only for clients that asked for a secret
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS mcp_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at     TEXT NOT NULL
);

-- A grant = one connection of one app for one user; access tokens are short, the refresh token rotates.
CREATE TABLE IF NOT EXISTS mcp_grants (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_user ON mcp_grants(user_id);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id   TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                      -- access | refresh
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_grant ON mcp_tokens(grant_id);
