import { err, json, staffApi } from "@/lib/api";
import { getBillingText, sampleValues, saveBillingText } from "@/lib/billing";

const kindOf = (v: unknown) => (v === "collab" ? "collab" : "contract");

/** The invoice text of a framework contract / collaboration (?kind=&id=) with sample values from a recent report. */
export async function GET(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const sp = new URL(req.url).searchParams;
  const kind = kindOf(sp.get("kind")), id = sp.get("id") ?? "";
  const [text, sample] = await Promise.all([getBillingText(a.db, kind, id), sampleValues(a.db, kind, id)]);
  return Response.json({ text, sample });
}

export async function PUT(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const b = await json(req);
  const r = await saveBillingText(a.db, a.user.id, kindOf(b.kind), typeof b.id === "string" ? b.id : "", b);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
