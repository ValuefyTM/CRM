import { jsonReply, mcpUrls, preflight } from "@/lib/mcp-http";

/** OAuth authorization server metadata (RFC 8414), served at /.well-known/oauth-authorization-server. */
export async function GET() {
  const u = await mcpUrls();
  return jsonReply({
    issuer: u.issuer,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["crm.read"],
    authorization_response_iss_parameter_supported: true,
  });
}
export const OPTIONS = preflight;
