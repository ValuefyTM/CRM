import { getDb } from "@/lib/db";
import { exchange } from "@/lib/mcp-auth";
import { jsonReply, preflight } from "@/lib/mcp-http";

/** Token endpoint: authorization code (PKCE) → tokens, and refresh. */
export async function POST(req: Request) {
  const db = await getDb();
  if (!db) return jsonReply({ error: "temporarily_unavailable" }, 503);
  const type = req.headers.get("content-type") ?? "";
  const params = type.includes("application/json")
    ? new URLSearchParams(Object.entries(((await req.json().catch(() => ({}))) ?? {}) as Record<string, string>).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text());
  let basic: { id: string; secret: string } | null = null;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const [id, secret] = atob(auth.slice(6)).split(":");
      basic = { id: decodeURIComponent(id), secret: decodeURIComponent(secret ?? "") };
    } catch { /* malformed: treated as missing */ }
  }
  const r = await exchange(db, params, basic);
  return jsonReply(r, "error" in r ? (r.error === "invalid_client" ? 401 : 400) : 200);
}
export const OPTIONS = preflight;
