import { getDb } from "@/lib/db";
import { initials } from "@/lib/guard";
import { roleLabel, type User } from "@/lib/users";
import { Shell } from "./Shell";
import { GlobalSearch } from "./GlobalSearch";
import { Heartbeat } from "./Heartbeat";
import { TableLabels } from "./TableLabels";
import { photoUrl } from "@/lib/presence";
import { countNewInquiries } from "@/lib/listings";

export async function CrmShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const b = props.base;
  // Badge on "Comenzi": orders nobody in the team has opened yet, plus new requests from the website.
  const db = await getDb();
  const [unread, open, inquiries] = db
    ? await Promise.all([
        // Sales offered on the website are not shown for now: only unopened orders count.
        db.prepare("SELECT COUNT(*) AS n FROM orders WHERE viewed_at IS NULL").first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0),
        db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status IN ('draft', 'in_progress') AND delivered_at IS NULL").first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0),
        // Viewing / report requests from the listings on valuefy.ro not handled yet.
        countNewInquiries(db),
      ])
    : [0, 0, 0];
  const owner = props.user.role === "owner";
  return (
    <Shell
      search={<GlobalSearch base={b} />}
      app="crm"
      label="Evaluări ANEVAR · Cluj"
      nav={[
        { key: "home", label: "Dashboard", href: b || "/" },
        { group: "CRM", key: "g-crm", items: [
          { key: "clients", label: "Clienți / Entități", href: `${b}/clienti` },
          { key: "contracts", label: "Contracte", href: `${b}/contracte` },
          { key: "collabs", label: "Colaborări", soon: true },
          { key: "orders", label: "Comenzi", href: `${b}/comenzi`, badge: unread, hot: true },
          { key: "tenders", label: "Licitații SEAP", href: `${b}/licitatii` },
          { key: "followups", label: "Follow-up-uri", soon: true },
          { key: "listings", label: "Anunțuri imobiliare", href: `${b}/anunturi`, badge: inquiries, hot: true },
        ] },
        { group: "Operațional", key: "g-ops", items: [
          { key: "reports", label: "Rapoarte", href: `${b}/rapoarte`, badge: open },
          { key: "inspections", label: "Inspecții", href: `${b}/agenda-inspectii` },
          { key: "properties", label: "Proprietăți", href: `${b}/proprietati` },
        ] },
        { group: "Financiar", key: "g-fin", items: [
          { key: "statements", label: "Borderouri", soon: true },
          { key: "invoicing", label: "Facturare", href: `${b}/facturare` },
        ] },
        { group: "Administrare", key: "g-admin", items: [
          { key: "users", label: "Utilizatori", href: `${b}/utilizatori` },
          { key: "templates", label: "Fișe de inspecție", href: `${b}/setari/fise` },
          ...(owner ? [{ key: "import", label: "Import Glide", href: `${b}/setari/import` }] : []),
        ] },
        { group: "Personal", key: "g-me", items: [
          { key: "notes", label: "Notițe", soon: true },
          { key: "settings", label: "Setări", href: `${b}/setari` },
        ] },
      ]}
      active={props.active}
      me={{ id: props.user.id, photo: photoUrl(props.user.id, props.user.avatar_at), initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: roleLabel("internal", props.user.role) }}
      title={props.title}
      subtitle={props.subtitle}
      actions={props.actions}
    >
      <Heartbeat url="/api/crm/presence" />
      <TableLabels />
      {props.children}
    </Shell>
  );
}
