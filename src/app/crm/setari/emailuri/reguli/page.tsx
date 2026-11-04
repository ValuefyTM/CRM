import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { BASE_ROLES, loadRules } from "@/lib/mail-rules";
import { getConfig } from "@/lib/perms-db";
import { niceName } from "@/lib/labels";
import { SettingsTabs } from "../../SettingsTabs";
import { RulesEditor, type RuleForm } from "./RulesEditor";

export const metadata: Metadata = { title: "Reguli emailuri | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The rules of Emailuri primite: pattern → action, in order (the first that matches wins). Administrators only. */
export default async function MailRulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, user, base } = await staffPage();
  if (user.role !== "owner") redirect(base || "/");
  const sp = await searchParams;
  const [rules, cfg, banks, people] = await Promise.all([
    loadRules(db, true),
    getConfig(db),
    db.prepare("SELECT id, name, code FROM entities WHERE kind IN ('bank', 'ifn') ORDER BY kind <> 'bank', name").all<{ id: string; name: string; code: string | null }>().then((r) => r.results),
    db.prepare("SELECT id, COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE kind = 'internal' AND status = 'active' ORDER BY name").all<{ id: string; name: string }>().then((r) => r.results),
  ]);
  const roles = [...BASE_ROLES.filter(([k]) => k === "owner"), ...cfg.roles.map((r) => [r.id, r.name] as [string, string]), ...(cfg.roles.some((r) => r.id === "inspector") ? [] : [["inspector", "Inspector"] as [string, string]])];
  // a rule started from an email (Emailuri primite → email → selection)
  const fromEmail = sp.din ? await db.prepare("SELECT id, mail_from, subject, body FROM bank_emails WHERE id = ?").bind(sp.din).first<{ id: string; mail_from: string | null; subject: string | null; body: string | null }>() : null;
  const draft: RuleForm | null = fromEmail ? {
    id: null, name: "", active: true, from_has: sp.body_has ? "" : sp.from_has ?? "", subject_has: "", body_has: sp.body_has ?? "", ref_after: sp.ref_after ?? "", ref_shape: sp.ref_shape ?? "",
    client_after: sp.client_after ?? "", type_after: "", action: "bank_order", bank_id: "", task_title: "", notify_roles: ["owner", "admin", "operator"], notify_users: [],
  } : null;
  const form = (r: (typeof rules)[number]): RuleForm => ({
    id: r.id, name: r.name, active: !!r.active, from_has: r.from_has ?? "", subject_has: r.subject_has ?? "", body_has: r.body_has ?? "", ref_after: r.ref_after ?? "", ref_shape: r.ref_shape ?? "",
    client_after: r.client_after ?? "", type_after: r.type_after ?? "", action: r.action, bank_id: r.bank_id ?? "", task_title: r.task_title ?? "",
    notify_roles: (r.notify_roles ?? "").split(",").filter(Boolean), notify_users: (r.notify_users ?? "").split(",").filter(Boolean),
  });
  return (
    <CrmShell back={{ href: `${base}/setari/emailuri`, label: "Emailuri primite" }} user={user} base={base} active="settings" title="Reguli pentru emailuri"
      subtitle="Ce devine fiecare email primit: regulile se încearcă în ordine, prima care se potrivește decide">
      <SettingsTabs base={base} active="emailuri" user={user} />
      <RulesEditor rules={rules.map(form)} draft={draft} openId={sp.regula ?? null} fromEmail={fromEmail ? { id: fromEmail.id, subject: fromEmail.subject ?? "", from: fromEmail.mail_from ?? "" } : null}
        banks={banks.map((b) => ({ id: b.id, name: b.code ? `${b.code} · ${niceName(b.name) || b.name}` : niceName(b.name) || b.name }))} roles={roles} people={people} base={base} />
    </CrmShell>
  );
}
