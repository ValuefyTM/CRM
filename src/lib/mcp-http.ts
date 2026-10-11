// Server-only: shared bits of the MCP connector's HTTP endpoints (addresses, CORS, JSON replies).
import { origin } from "./site";

/** Claude may call the metadata, registration, token and MCP endpoints from a browser too. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export const jsonReply = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra } });

/** Addresses of the connector on the host the request came to (crm.valuefy.ro in production). */
export async function mcpUrls() {
  const o = await origin();
  return {
    issuer: o,
    resource: `${o}/api/mcp`,
    resourceMetadata: `${o}/.well-known/oauth-protected-resource`,
    authorize: `${o}/api/mcp/oauth/authorize`,
    token: `${o}/api/mcp/oauth/token`,
    register: `${o}/api/mcp/oauth/register`,
  };
}
