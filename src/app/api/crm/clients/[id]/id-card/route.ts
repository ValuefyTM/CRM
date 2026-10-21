import { audit } from "@/lib/auth";
import { err, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { inScope } from "@/lib/scope";
import { addIdPhoto, cleanCard, idDocs, MAX_ID_PHOTOS, saveIdCard } from "@/lib/id-docs";

/** The photos of the client's identity card (newest first). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("clients");
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "clients", id))) return err("Nu există.", 404);
  return Response.json({ docs: await idDocs(a.db, id) });
}

/**
 * Keeps the identity card at the client: the photos and what was read from them (CNP, series, address).
 * Also from a new work / order, right after the client was registered (orders.A).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (!can(a.user, "clients.E") && !can(a.user, "orders.A") && !can(a.user, "contracts.A")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const { id } = await params;
  const e = await a.db.prepare("SELECT id, kind FROM entities WHERE id = ? AND kind IN ('person', 'company')").bind(id).first<{ id: string; kind: string }>();
  if (!e) return err("Clientul nu există.", 404);
  if (can(a.user, "clients") && !(await inScope(a.db, a.user, "clients", id))) return err("Nu există.", 404);
  const form = await req.formData().catch(() => null);
  if (!form) return err("Cerere invalidă.");
  let card: unknown = null;
  try { card = JSON.parse(String(form.get("card") ?? "null")); } catch { /* no fields */ }
  if (card) await saveIdCard(a.db, id, cleanCard(card));
  const photos = form.getAll("photo").filter((f): f is File => f instanceof File).slice(0, MAX_ID_PHOTOS);
  const ids: string[] = [];
  for (const f of photos) {
    const r = await addIdPhoto(a.db, id, f, a.user.id);
    if (!r.ok) return err(r.error);
    ids.push(r.id);
  }
  await audit(a.db, `user:${a.user.id}`, "client.id_card", "client", id, `${ids.length} poze CI${card ? " · date preluate din CI" : ""}`);
  return Response.json({ ok: true, ids });
}
