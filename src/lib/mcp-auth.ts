// Server-only: OAuth 2.1 for the MCP connector (crm.valuefy.ro/api/mcp). Claude registers itself (dynamic client
// registration), the team member signs in to the CRM and approves, and Claude gets a short access token plus a
// rotating refresh token. Only hashes of codes and tokens are stored. For now only the owner and administrators can connect.
import { randomToken, safeEqual, sha256 } from "./crypto";
import { getUser, isAdmin, type User } from "./users";

const ACCESS_SECONDS = 3600;
const REFRESH_DAYS = 30;
const CODE_MINUTES = 5;

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const now = () => new Date().toISOString();

/** Who may connect Claude to the CRM (v1: owner and administrators). */
// Never while looking at the CRM as someone else ("Vezi ca…").
export const mcpAllowed = (u: User | null): u is User => !!u && u.kind === "internal" && u.status === "active" && isAdmin(u) && !u.impersonator;

/** Apps may only send the user back to Claude (web, desktop) or to a local address (Claude Code); MCP_REDIRECT_HOSTS adds more. */
export function redirectAllowed(uri: string) {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && (u.protocol === "http:" || u.protocol === "https:")) return true;
  const extra = (process.env.MCP_REDIRECT_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return u.protocol === "https:" && ["claude.ai", "claude.com", ...extra].includes(u.hostname.toLowerCase());
}

// ---------- clients ----------

export type McpClient = { id: string; name: string; redirect_uris: string; secret_hash: string | null };

export async function registerClient(db: D1Database, b: Record<string, unknown>) {
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String).slice(0, 10) : [];
  if (!uris.length) return { error: "invalid_redirect_uri", error_description: "redirect_uris is required" } as const;
  const bad = uris.find((u) => !redirectAllowed(u));
  if (bad) return { error: "invalid_redirect_uri", error_description: `Redirect URI not allowed: ${bad}` } as const;
  const method = typeof b.token_endpoint_auth_method === "string" ? b.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return { error: "invalid_client_metadata", error_description: "Unsupported token_endpoint_auth_method" } as const;
  }
  const id = `mcp_${randomToken().slice(0, 24)}`;
  const secret = method === "none" ? null : randomToken();
  const name = (typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim() : "Aplicație MCP").slice(0, 80);
  await db.prepare("INSERT INTO mcp_clients (id, name, redirect_uris, secret_hash) VALUES (?, ?, ?, ?)")
    .bind(id, name, JSON.stringify(uris), secret ? await sha256(secret) : null).run();
  return {
    client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

export async function getClient(db: D1Database, id: string) {
  return db.prepare("SELECT id, name, redirect_uris, secret_hash FROM mcp_clients WHERE id = ?").bind(id).first<McpClient>();
}

export const clientRedirects = (c: McpClient): string[] => { try { return JSON.parse(c.redirect_uris); } catch { return []; } };

// ---------- authorization codes ----------

export async function issueCode(db: D1Database, c: { clientId: string; userId: string; redirectUri: string; challenge: string }) {
  const code = randomToken();
  await db.batch([
    db.prepare("DELETE FROM mcp_codes WHERE expires_at < ?").bind(now()),
    db.prepare("INSERT INTO mcp_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256(code), c.clientId, c.userId, c.redirectUri, c.challenge, iso(CODE_MINUTES * 60_000)),
  ]);
  return code;
}

async function s256(verifier: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- tokens ----------

async function tokensFor(db: D1Database, grantId: string) {
  const access = randomToken(), refresh = randomToken();
  await db.batch([
    db.prepare("INSERT INTO mcp_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, 'access', ?)").bind(await sha256(access), grantId, iso(ACCESS_SECONDS * 1000)),
    db.prepare("INSERT INTO mcp_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, 'refresh', ?)").bind(await sha256(refresh), grantId, iso(REFRESH_DAYS * 86400_000)),
    db.prepare("DELETE FROM mcp_tokens WHERE expires_at < ?").bind(now()),
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: "crm.read" };
}

type TokenError = { error: string; error_description?: string };

/** Checks the client's credentials when it registered with a secret. */
async function clientOk(c: McpClient, secret: string | null) {
  if (!c.secret_hash) return true;
  return !!secret && safeEqual(await sha256(secret), c.secret_hash);
}

/** POST /token: authorization_code (with PKCE) or refresh_token (rotated on every use). */
export async function exchange(db: D1Database, p: URLSearchParams, basic: { id: string; secret: string } | null) {
  const clientId = basic?.id ?? p.get("client_id") ?? "";
  const client = clientId ? await getClient(db, clientId) : null;
  if (!client || !(await clientOk(client, basic?.secret ?? p.get("client_secret")))) return { error: "invalid_client" } as TokenError;
  const grantType = p.get("grant_type");

  if (grantType === "authorization_code") {
    const code = p.get("code") ?? "", verifier = p.get("code_verifier") ?? "";
    const row = await db.prepare("SELECT * FROM mcp_codes WHERE code_hash = ?").bind(await sha256(code))
      .first<{ code_hash: string; client_id: string; user_id: string; redirect_uri: string; code_challenge: string; expires_at: string }>();
    if (row) await db.prepare("DELETE FROM mcp_codes WHERE code_hash = ?").bind(row.code_hash).run(); // single use
    if (!row || row.client_id !== client.id || row.expires_at < now()) return { error: "invalid_grant", error_description: "Code expired or already used" } as TokenError;
    if (p.get("redirect_uri") && p.get("redirect_uri") !== row.redirect_uri) return { error: "invalid_grant", error_description: "redirect_uri mismatch" } as TokenError;
    if (!verifier || !safeEqual(await s256(verifier), row.code_challenge)) return { error: "invalid_grant", error_description: "PKCE verification failed" } as TokenError;
    if (!mcpAllowed(await getUser(db, row.user_id))) return { error: "access_denied" } as TokenError;
    const grantId = crypto.randomUUID();
    await db.prepare("INSERT INTO mcp_grants (id, client_id, user_id) VALUES (?, ?, ?)").bind(grantId, client.id, row.user_id).run();
    await audit(db, row.user_id, "mcp.connect", client.name);
    return tokensFor(db, grantId);
  }

  if (grantType === "refresh_token") {
    const h = await sha256(p.get("refresh_token") ?? "");
    const row = await db.prepare(`SELECT t.token_hash, t.expires_at, g.id AS grant_id, g.client_id, g.user_id, g.revoked_at
      FROM mcp_tokens t JOIN mcp_grants g ON g.id = t.grant_id WHERE t.token_hash = ? AND t.kind = 'refresh'`).bind(h)
      .first<{ token_hash: string; expires_at: string; grant_id: string; client_id: string; user_id: string; revoked_at: string | null }>();
    if (!row || row.client_id !== client.id || row.revoked_at || row.expires_at < now()) return { error: "invalid_grant" } as TokenError;
    if (!mcpAllowed(await getUser(db, row.user_id))) return { error: "invalid_grant" } as TokenError;
    await db.prepare("DELETE FROM mcp_tokens WHERE token_hash = ?").bind(row.token_hash).run();
    return tokensFor(db, row.grant_id);
  }

  return { error: "unsupported_grant_type" } as TokenError;
}

/** The team member behind a Bearer access token, or null (expired, revoked, or no longer allowed). */
export async function userFromToken(db: D1Database, header: string | null) {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const row = await db.prepare(`SELECT g.id AS grant_id, g.user_id, g.last_used_at FROM mcp_tokens t JOIN mcp_grants g ON g.id = t.grant_id
    WHERE t.token_hash = ? AND t.kind = 'access' AND t.expires_at > ? AND g.revoked_at IS NULL`).bind(await sha256(m[1].trim()), now())
    .first<{ grant_id: string; user_id: string; last_used_at: string | null }>();
  if (!row) return null;
  const user = await getUser(db, row.user_id);
  if (!mcpAllowed(user)) return null;
  // "Last used" for the connections list, at most once a minute.
  if (!row.last_used_at || Date.parse(row.last_used_at) < Date.now() - 60_000) {
    await db.prepare("UPDATE mcp_grants SET last_used_at = ? WHERE id = ?").bind(now(), row.grant_id).run();
  }
  return { user, grantId: row.grant_id };
}

// ---------- connections (settings page) ----------

export type McpGrant = { id: string; client_name: string; created_at: string; last_used_at: string | null };

export async function listGrants(db: D1Database, userId: string) {
  return (await db.prepare(`SELECT g.id, COALESCE(c.name, 'Aplicație') AS client_name, g.created_at, g.last_used_at FROM mcp_grants g
    LEFT JOIN mcp_clients c ON c.id = g.client_id WHERE g.user_id = ? AND g.revoked_at IS NULL ORDER BY g.created_at DESC`).bind(userId).all<McpGrant>()).results;
}

export async function revokeGrant(db: D1Database, userId: string, grantId: string) {
  await db.batch([
    db.prepare("UPDATE mcp_grants SET revoked_at = ? WHERE id = ? AND user_id = ?").bind(now(), grantId, userId),
    db.prepare("DELETE FROM mcp_tokens WHERE grant_id = ? AND grant_id IN (SELECT id FROM mcp_grants WHERE user_id = ?)").bind(grantId, userId),
  ]);
  await audit(db, userId, "mcp.revoke", grantId);
}

export async function audit(db: D1Database, userId: string, action: string, details?: string, entity?: string, entityId?: string) {
  await db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(`user:${userId}`, action, entity ?? "mcp", entityId ?? null, details?.slice(0, 500) ?? null).run().catch(() => {});
}
