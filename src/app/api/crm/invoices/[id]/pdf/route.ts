import { staffApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { fileHeaders } from "@/lib/file-response";

/** The invoice PDF: our copy, else (not copied yet) the Oblio link. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const inv = await a.db.prepare("SELECT kind, series, number, r2_key, oblio_link FROM invoices WHERE id = ?").bind((await params).id)
    .first<{ kind: string; series: string; number: string; r2_key: string | null; oblio_link: string | null }>();
  if (!inv) return new Response("Factura nu există.", { status: 404 });
  const obj = inv.r2_key ? await (await bucket())?.get(inv.r2_key) : null;
  if (obj) return new Response(obj.body, { headers: fileHeaders(`${inv.kind === "proforma" ? "Proforma" : "Factura"} ${inv.series} ${inv.number}.pdf`) });
  if (inv.oblio_link && /^https:\/\/([a-z0-9-]+\.)*oblio\.eu\//i.test(inv.oblio_link)) return Response.redirect(inv.oblio_link, 302);
  return new Response("PDF-ul nu este disponibil.", { status: 404 });
}
