import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canSee, documentResponse, getOrder, orderDocuments } from "@/lib/orders";

/** Download / open a document of one of your orders. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const db = await getDb();
  const user = db ? await currentUser(db, "portal") : null;
  if (!db || !user) return new Response("Autentifică-te din nou.", { status: 401 });
  const { id, docId } = await params;
  const o = await getOrder(db, id);
  if (!o || !canSee(user, o)) return new Response("Documentul nu a fost găsit.", { status: 404 });
  const doc = (await orderDocuments(db, id)).find((d) => d.id === docId);
  return doc ? documentResponse(doc) : new Response("Documentul nu a fost găsit.", { status: 404 });
}
