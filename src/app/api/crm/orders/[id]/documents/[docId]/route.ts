import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { documentResponse, orderDocuments } from "@/lib/orders";

/** Download / open an order document from the CRM. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const db = await getDb();
  const user = db ? await currentUser(db, "crm") : null;
  if (!db || !user) return new Response("Autentifică-te din nou.", { status: 401 });
  const { id, docId } = await params;
  const doc = (await orderDocuments(db, id)).find((d) => d.id === docId);
  return doc ? documentResponse(doc) : new Response("Documentul nu a fost găsit.", { status: 404 });
}
