import { zipSync, type Zippable } from "fflate";
import { reportApi } from "@/lib/api";
import { bucket } from "@/lib/orders";

/** At most this much in one archive (the worker builds it in memory). */
const MAX_BYTES = 90 * 1024 * 1024;

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 150) || "document";

/**
 * The report's documents in one ZIP: `?ids=r:<id>,o:<id>` (r = the report's own, o = the order's), or all of them
 * (the report's uploaded documents, the final report and the order's) when no ids are given.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  const want = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 300);
  const rIds = want.filter((x) => x.startsWith("r:")).map((x) => x.slice(2)), oIds = want.filter((x) => x.startsWith("o:")).map((x) => x.slice(2));
  const all = want.length === 0;
  const rep = await a.db.prepare(`SELECT r.number, r.label, r.order_id FROM reports r WHERE r.id = ?`).bind(id).first<{ number: string | null; label: string | null; order_id: string | null }>();
  if (!rep) return new Response("Raportul nu există.", { status: 404 });
  const [own, ord] = await Promise.all([
    all || rIds.length
      ? a.db.prepare(`SELECT id, filename, kind, r2_key, size_bytes FROM report_documents WHERE report_id = ? AND status = 'uploaded' AND r2_key IS NOT NULL
          ${all ? "" : `AND id IN (${rIds.map(() => "?").join(", ")})`} ORDER BY kind = 'final' DESC, created_at`).bind(id, ...(all ? [] : rIds))
        .all<{ id: string; filename: string; kind: string; r2_key: string; size_bytes: number | null }>().then((x) => x.results)
      : Promise.resolve([]),
    rep.order_id && (all || oIds.length)
      ? a.db.prepare(`SELECT id, filename, r2_key, size_bytes FROM order_documents WHERE order_id = ? AND r2_key IS NOT NULL
          ${all ? "" : `AND id IN (${oIds.map(() => "?").join(", ")})`} ORDER BY created_at`).bind(rep.order_id, ...(all ? [] : oIds))
        .all<{ id: string; filename: string; r2_key: string; size_bytes: number | null }>().then((x) => x.results)
      : Promise.resolve([]),
  ]);
  const files = [...own.map((d) => ({ ...d, dir: d.kind === "final" ? "Raport final/" : "" })), ...ord.map((d) => ({ ...d, dir: "Din comandă/" }))];
  if (!files.length) return new Response("Nu există acte de descărcat.", { status: 404 });
  if (files.reduce((s, f) => s + (f.size_bytes ?? 0), 0) > MAX_BYTES) return new Response("Actele depășesc 90 MB: alege mai puține și descarcă-le pe rând.", { status: 413 });
  const r2 = await bucket();
  if (!r2) return new Response("Stocarea fișierelor nu este disponibilă.", { status: 503 });
  const zip: Zippable = {};
  const used = new Set<string>();
  for (const f of files) {
    const obj = await r2.get(f.r2_key);
    if (!obj) continue;
    // the same name twice: "act (2).pdf"
    let name = `${f.dir}${clean(f.filename)}`, n = 2;
    while (used.has(name)) name = `${f.dir}${clean(f.filename).replace(/(\.\w+)?$/, ` (${n++})$1`)}`;
    used.add(name);
    // already compressed (PDF, images, Office, ZIP): stored as they are
    zip[name] = [new Uint8Array(await obj.arrayBuffer()), { level: 0 }];
  }
  if (!Object.keys(zip).length) return new Response("Fișierele nu au fost găsite.", { status: 404 });
  const out = zipSync(zip);
  const title = clean(`Acte ${rep.number ? `raport ${rep.number}` : rep.label ?? "raport"}`);
  return new Response(out, {
    headers: {
      "Content-Type": "application/zip", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${title}.zip`)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    },
  });
}
