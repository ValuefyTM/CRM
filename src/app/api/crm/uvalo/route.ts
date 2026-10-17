import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { canAssign } from "@/lib/insp-assign";
import { importSheet, inspChannel, ping, pushInspection, setInspChannel, syncTemplates, templateSync, uvaloConfigured, webhookSecretSet } from "@/lib/uvalo";

/** Inspections through UVALO: whether the key is set and works, the channel, when each sheet was sent. */
export async function GET() {
  const a = await staffApi("templates");
  if ("res" in a) return a.res;
  const configured = await uvaloConfigured();
  const p = configured ? await ping().then((r) => ({ ok: true, org: r.org?.name ?? null, key: r.key })).catch((e: Error) => ({ ok: false, error: e.message })) : null;
  return Response.json({ configured, webhook_secret: await webhookSecretSet(), channel: await inspChannel(a.db), ping: p, templates: await templateSync(a.db) });
}

/**
 * `{action: "channel", value: "uvalo" | "app"}` and `{action: "sync"}` (Setări → Fișe de inspecție, who edits the sheets);
 * `{action: "push" | "import", inspection, report}`: send again / bring the finished sheet (who allocates on the report).
 */
export async function POST(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const action = String(b.action ?? "");
  if (action === "channel" || action === "sync") {
    if (!can(a.user, "templates.E")) return err("Doar cine modifică fișele de inspecție poate schimba asta.", 403);
    if (action === "channel") {
      const r = await setInspChannel(a.db, a.user.id, String(b.value ?? ""));
      if (!r.ok) return err(r.error);
      if (b.value === "uvalo") await syncTemplates(a.db);
      return Response.json({ ok: true });
    }
    const out = await syncTemplates(a.db);
    const bad = out.filter((x) => !x.ok);
    return bad.length ? err(`Nu s-au trimis: ${bad.map((x) => `${x.type} (${x.error})`).join(", ")}`, 502) : Response.json({ ok: true, sent: out.length });
  }
  if (action === "push" || action === "import") {
    const report = String(b.report ?? ""), id = String(b.inspection ?? "");
    if (!(await canAssign(a.db, a.user, report))) return err("Doar evaluatorul principal al raportului poate face asta.", 403);
    const ok = await a.db.prepare("SELECT 1 AS x FROM inspections WHERE id = ? AND report_id = ?").bind(id, report).first();
    if (!ok) return err("Inspecția nu există.", 404);
    const r = action === "push" ? await pushInspection(a.db, id) : await importSheet(a.db, id);
    return r.ok ? Response.json({ ok: true }) : err(r.error, 502);
  }
  return err("Acțiune necunoscută.");
}
