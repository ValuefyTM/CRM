import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { extract, loadRules, matches, type MailRule } from "@/lib/mail-rules";

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) || null : null);
const csv = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string" && /^[\w-]{1,80}$/.test(x)).slice(0, 50).join(",") || null : null);

/** The rule as sent by the editor (validated). */
function ruleOf(b: Record<string, unknown>): { ok: true; rule: Omit<MailRule, "id" | "sort" | "updated_at"> } | { ok: false; error: string } {
  const action = b.action === "task" || b.action === "ignore" || b.action === "resume_report" ? b.action : "bank_order";
  const rule = {
    name: s(b.name, 120) ?? "", active: b.active === false ? 0 : 1,
    from_has: s(b.from_has, 300), subject_has: s(b.subject_has, 300), body_has: s(b.body_has, 600),
    ref_after: s(b.ref_after, 200), ref_shape: s(b.ref_shape, 60), client_after: s(b.client_after, 200), type_after: s(b.type_after, 200),
    action, bank_id: action === "bank_order" || action === "resume_report" ? s(b.bank_id, 80) : null, task_title: action === "task" ? s(b.task_title, 200) : null,
    notify_roles: action === "ignore" || action === "resume_report" ? null : csv(b.notify_roles), notify_users: action === "ignore" || action === "resume_report" ? null : csv(b.notify_users),
  } as Omit<MailRule, "id" | "sort" | "updated_at">;
  if (!rule.name) return { ok: false, error: "Dă un nume regulii (ex. Procesare comandă BRD)." };
  if (!rule.from_has && !rule.subject_has && !rule.body_has) return { ok: false, error: "Completează cel puțin o condiție: expeditorul, subiectul sau textul conține…" };
  if (action === "bank_order" && !rule.bank_id) return { ok: false, error: "Alege banca." };
  if ((action === "bank_order" || action === "resume_report") && !rule.ref_after && !rule.ref_shape) return { ok: false, error: "Spune de unde se ia numărul comenzii (textul dinainte sau literele codului)." };
  if (action !== "ignore" && action !== "resume_report" && !rule.notify_roles && !rule.notify_users) return { ok: false, error: "Alege pe cine anunță regula." };
  return { ok: true, rule };
}

/** Save a rule (new or changed), test one on the emails received, or move one up / down. The owner only. */
export async function POST(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Regulile le modifică doar proprietarul.", 403);
  const b = await json(req);
  const actor = `user:${a.user.id}`;

  if (b.op === "test") {
    const v = ruleOf({ ...(b.rule as Record<string, unknown>), name: "test", notify_roles: ["owner"], bank_id: "x" });
    if (!v.ok) return err(v.error);
    const rule = { ...v.rule, id: "test", sort: 0, updated_at: null } as MailRule;
    const { results } = await a.db.prepare("SELECT id, received_at, mail_from, subject, body FROM bank_emails ORDER BY received_at DESC LIMIT 300")
      .all<{ id: string; received_at: string; mail_from: string | null; subject: string | null; body: string | null }>();
    const hits = results.map((e) => ({ e, m: { from: e.mail_from, subject: e.subject, text: e.body } }))
      .filter(({ m }) => matches(rule, m)).slice(0, 30)
      .map(({ e, m }) => ({ id: e.id, at: e.received_at, subject: e.subject, from: e.mail_from, ...extract(rule, m) }));
    const one = typeof b.email === "string" ? results.find((e) => e.id === b.email) : null;
    return Response.json({ ok: true, total: results.length, hits, here: one ? { matches: matches(rule, { from: one.mail_from, subject: one.subject, text: one.body }), ...extract(rule, { from: one.mail_from, subject: one.subject, text: one.body }) } : null });
  }

  if (b.op === "move") {
    const rules = await loadRules(a.db, true);
    const i = rules.findIndex((r) => r.id === b.id), j = i + (b.dir === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= rules.length) return Response.json({ ok: true });
    [rules[i], rules[j]] = [rules[j], rules[i]];
    await a.db.batch(rules.map((r, k) => a.db.prepare("UPDATE mail_rules SET sort = ? WHERE id = ?").bind((k + 1) * 10, r.id)));
    return Response.json({ ok: true });
  }

  if (b.op === "active") {
    await a.db.prepare("UPDATE mail_rules SET active = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(b.active ? 1 : 0, new Date().toISOString(), a.user.id, String(b.id ?? "")).run();
    await audit(a.db, actor, "mailrule.active", "mail_rule", String(b.id ?? ""), b.active ? "pornită" : "oprită");
    return Response.json({ ok: true });
  }

  const v = ruleOf((b.rule ?? {}) as Record<string, unknown>);
  if (!v.ok) return err(v.error);
  const r = v.rule, t = new Date().toISOString();
  const id = typeof b.id === "string" && /^[\w-]{1,80}$/.test(b.id) ? b.id : null;
  const vals = [r.name, r.active, r.from_has, r.subject_has, r.body_has, r.ref_after, r.ref_shape, r.client_after, r.type_after, r.action, r.bank_id, r.task_title, r.notify_roles, r.notify_users, t, a.user.id];
  if (id) {
    const ch = await a.db.prepare(`UPDATE mail_rules SET name = ?, active = ?, from_has = ?, subject_has = ?, body_has = ?, ref_after = ?, ref_shape = ?, client_after = ?, type_after = ?, action = ?, bank_id = ?,
        task_title = ?, notify_roles = ?, notify_users = ?, updated_at = ?, updated_by = ? WHERE id = ?`).bind(...vals, id).run();
    if (!ch.meta.changes) return err("Regula nu există.", 404);
    await audit(a.db, actor, "mailrule.update", "mail_rule", id, r.name);
    return Response.json({ ok: true, id });
  }
  const nid = crypto.randomUUID();
  await a.db.prepare(`INSERT INTO mail_rules (name, active, from_has, subject_has, body_has, ref_after, ref_shape, client_after, type_after, action, bank_id, task_title, notify_roles, notify_users, updated_at, updated_by, id, sort, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 10 FROM mail_rules), ?)`).bind(...vals, nid, t).run();
  await audit(a.db, actor, "mailrule.create", "mail_rule", nid, r.name);
  return Response.json({ ok: true, id: nid });
}

export async function DELETE(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Regulile le modifică doar proprietarul.", 403);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await a.db.prepare("UPDATE bank_emails SET rule_id = NULL WHERE rule_id = ?").bind(id).run();
  await a.db.prepare("UPDATE mail_tasks SET rule_id = NULL WHERE rule_id = ?").bind(id).run();
  const r = await a.db.prepare("DELETE FROM mail_rules WHERE id = ?").bind(id).run();
  if (r.meta.changes) await audit(a.db, `user:${a.user.id}`, "mailrule.delete", "mail_rule", id);
  return Response.json({ ok: true });
}
