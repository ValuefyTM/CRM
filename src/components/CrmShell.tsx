import { getDb } from "@/lib/db";
import { countNewLeads } from "@/lib/leads";
import { initials } from "@/lib/guard";
import { roleLabel, type User } from "@/lib/users";
import { Shell } from "./Shell";
import { Heartbeat } from "./Heartbeat";
import { photoUrl } from "@/lib/presence";

export async function CrmShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const b = props.base;
  // Badge on "Comenzi": orders nobody in the team has opened yet, plus new requests from the website.
  const db = await getDb();
  const [unread, open] = db
    ? await Promise.all([
        (async () => ((await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE viewed_at IS NULL").first<{ n: number }>().catch(() => null))?.n ?? 0) + (await countNewLeads(db)))(),
        db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status IN ('draft', 'in_progress') AND delivered_at IS NULL").first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0),
      ])
    : [0, 0];
  const owner = props.user.role === "owner";
  return (
    <Shell
      app="crm"
      label="Evaluări ANEVAR · Cluj"
      nav={[
        { key: "home", label: "Dashboard", href: b || "/" },
        { group: "CRM", key: "g-crm", items: [
          { key: "clients", label: "Clienți / Entități", href: `${b}/clienti` },
          { key: "contracts", label: "Contracte", href: `${b}/contracte` },
          { key: "collabs", label: "Colaborări", soon: true },
          { key: "orders", label: "Comenzi", href: `${b}/comenzi`, badge: unread, hot: true },
          { key: "followups", label: "Follow-up-uri", soon: true },
        ] },
        { group: "Operațional", key: "g-ops", items: [
          { key: "reports", label: "Rapoarte", href: `${b}/rapoarte`, badge: open },
          { key: "inspections", label: "Inspecții", href: `${b}/agenda-inspectii` },
          { key: "properties", label: "Proprietăți", href: `${b}/proprietati` },
        ] },
        { group: "Financiar", key: "g-fin", items: [
          { key: "statements", label: "Borderouri", soon: true },
          { key: "invoicing", label: "Facturare", soon: true },
        ] },
        { group: "Administrare", key: "g-admin", items: [
          { key: "users", label: "Utilizatori", href: `${b}/utilizatori` },
          ...(owner ? [{ key: "import", label: "Import Glide", href: `${b}/setari/import` }] : []),
        ] },
        { group: "Personal", key: "g-me", items: [
          { key: "notes", label: "Notițe", soon: true },
          { key: "settings", label: "Setări", soon: true },
        ] },
      ]}
      active={props.active}
      me={{ id: props.user.id, photo: photoUrl(props.user.id, props.user.avatar_at), initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: roleLabel("internal", props.user.role) }}
      title={props.title}
      subtitle={props.subtitle}
      actions={props.actions}
    >
      <Heartbeat url="/api/crm/presence" />
      {props.children}
    </Shell>
  );
}
