import { jsonReply, mcpUrls, preflight } from "@/lib/mcp-http";

/** OAuth protected resource metadata (RFC 9728), served at /.well-known/oauth-protected-resource. */
export async function GET() {
  const u = await mcpUrls();
  return jsonReply({ resource: u.resource, authorization_servers: [u.issuer], bearer_methods_supported: ["header"], scopes_supported: ["crm.read"], resource_name: "CRM VALUEFY" });
}
export const OPTIONS = preflight;
