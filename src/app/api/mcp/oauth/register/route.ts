import { getDb } from "@/lib/db";
import { registerClient } from "@/lib/mcp-auth";
import { jsonReply, preflight } from "@/lib/mcp-http";

/** Dynamic client registration (RFC 7591): Claude registers itself before asking for access. */
export async function POST(req: Request) {
  const db = await getDb();
  if (!db) return jsonReply({ error: "temporarily_unavailable" }, 503);
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const r = await registerClient(db, body);
  return jsonReply(r, "error" in r ? 400 : 201);
}
export const OPTIONS = preflight;
