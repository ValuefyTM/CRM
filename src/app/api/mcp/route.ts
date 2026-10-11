import { getDb } from "@/lib/db";
import { basePath, origin } from "@/lib/site";
import { audit, userFromToken } from "@/lib/mcp-auth";
import { CORS, jsonReply, mcpUrls, preflight } from "@/lib/mcp-http";
import { toolsFor, type Ctx } from "@/lib/mcp-tools";

// MCP endpoint (Streamable HTTP, stateless JSON replies): Claude calls the CRM's read-only tools here with a Bearer token
// obtained through the OAuth flow under /api/mcp/oauth. Every tool call is written to the CRM's audit log.

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "valuefy-crm", title: "CRM VALUEFY", version: "1.0.0" };
const INSTRUCTIONS = `CRM-ul VALUEFY (firmă de evaluări imobiliare autorizată ANEVAR): comenzi, rapoarte de evaluare, clienți, inspecții, proprietăți evaluate, facturi.
Răspunde utilizatorului în română. Datele sunt doar pentru citire. Sumele sunt în lei. Când dai un rezultat concret, include linkul către pagina din CRM.
Pentru o persoană, o adresă sau un număr pe care nu-l știi sigur, începe cu „cauta”, apoi folosește id-ul găsit în celelalte acțiuni.`;

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function unauthorized() {
  const u = await mcpUrls();
  return jsonReply({ error: "invalid_token", error_description: "Autentificare necesară" }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${u.resourceMetadata}"`,
  });
}

async function handle(c: Ctx, m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, {
        tools: toolsFor(c.user).map((t) => ({
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      const tool = toolsFor(c.user).find((t) => t.name === name);
      if (!tool) return fail(m.id, -32602, `Acțiune necunoscută: ${name}`);
      await audit(c.db, c.user.id, `mcp.${name}`, JSON.stringify(args));
      try {
        const data = await tool.run(c, args);
        const isError = !!data && typeof data === "object" && "eroare" in data;
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(data) }], isError });
      } catch (e) {
        console.error(`[mcp] ${name}`, e);
        return ok(m.id, { content: [{ type: "text", text: "A apărut o eroare în CRM la această acțiune. Încearcă din nou sau cu alți parametri." }], isError: true });
      }
    }
    case "resources/list":
      return ok(m.id, { resources: [] });
    case "prompts/list":
      return ok(m.id, { prompts: [] });
    default:
      return fail(m.id, -32601, `Metodă nesuportată: ${m.method}`);
  }
}

export async function POST(req: Request) {
  const db = await getDb();
  if (!db) return jsonReply(fail(null, -32603, "Baza de date nu este disponibilă."), 503);
  const who = await userFromToken(db, req.headers.get("authorization"));
  if (!who) return unauthorized();

  const body = (await req.json().catch(() => undefined)) as Rpc | Rpc[] | undefined;
  if (!body || typeof body !== "object") return jsonReply(fail(null, -32700, "JSON invalid"), 400);
  const o = await origin(), base = await basePath("crm");
  const c: Ctx = { db, user: who.user, link: (p) => `${o}${base}${p}` };

  const list = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const m of list.slice(0, 20)) {
    // Notifications (no id) and replies from the client get no answer.
    if (m.id === undefined || m.id === null || !m.method) continue;
    replies.push(await handle(c, m));
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return jsonReply(Array.isArray(body) ? replies : replies[0]);
}

/** No server-initiated stream: the connector only answers requests. */
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export const OPTIONS = preflight;
