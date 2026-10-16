import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { documentResponse, orderDocuments } from "@/lib/orders";
import { can } from "@/lib/perms";
import { inScope } from "@/lib/scope";
import { reportAccess } from "@/lib/perms-db";

/** Download / open an order document from the CRM. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const db = await getDb();
  const user = db ? await currentUser(db, "crm") : null;
  if (!db || !user) return new Response("Autentifică-te din nou.", { status: 401 });
  const { id, docId } = await params;
  // The team of a report sees the documents of its order too.
  if (!(can(user, "orders") && (await inScope(db, user, "orders", id)))) {
    const reports = (await db.prepare("SELECT id, status, delivered_at FROM reports WHERE order_id = ?").bind(id).all<{ id: string; status: string; delivered_at: string | null }>()).results;
    let ok = false;
    for (const r of reports) if (!ok) ok = (await reportAccess(db, user, r)).view;
    if (!ok) return new Response("Documentul nu a fost găsit.", { status: 404 });
  }
  const doc = (await orderDocuments(db, id)).find((d) => d.id === docId);
  return doc ? documentResponse(doc) : new Response("Documentul nu a fost găsit.", { status: 404 });
}
