import { getDb } from "@/lib/db";
import { initials } from "@/lib/guard";
import { isAdmin, roleLabel, type User } from "@/lib/users";
import { can, type Perm } from "@/lib/perms";
import { mySql } from "@/lib/perms-db";
import { ViewAs } from "./ViewAs";
import { Shell, type NavEntry, type NavItem } from "./Shell";
import { GlobalSearch } from "./GlobalSearch";
import { Heartbeat } from "./Heartbeat";
import { TableLabels } from "./TableLabels";
import { photoUrl } from "@/lib/presence";
import { countNewInquiries } from "@/lib/listings";

export async function CrmShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; actions?: React.ReactNode; bare?: boolean; children: React.ReactNode }) {
  const b = props.base;
  // Badge on "Comenzi": orders nobody in the team has opened yet, plus new requests from the website.
  const db = await getDb();
  const [unread, open, inquiries] = db
    ? await Promise.all([
        // Sales offered on the website are not shown for now: only unopened orders count.
        can(props.user, "orders") ? db.prepare("SELECT COUNT(*) AS n FROM orders WHERE viewed_at IS NULL").first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0) : 0,
        db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status IN ('draft', 'in_progress') AND delivered_at IS NULL").first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0),
        // Viewing / report requests from the listings on valuefy.ro not handled yet.
        can(props.user, "listings") ? countNewInquiries(db) : 0,
      ])
    : [0, 0, 0];
  const u = props.user;
  const may = (p: Perm) => can(u, p);
  const allReports = may("reports.all");
  // "Vezi ca…": owners and administrators (also while looking as someone else) pick the next person from the list.
  const realRole = u.impersonator?.role ?? u.role;
  const viewAs = db && (u.impersonator || isAdmin(u))
    ? (await db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role FROM users WHERE kind = 'internal' AND status = 'active' AND role <> 'inspector'
        AND id <> ? ${realRole === "owner" ? "" : "AND role <> 'owner'"} ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END, name`)
        .bind(u.impersonator?.id ?? u.id).all<{ id: string; name: string; role: string }>()).results.map((x) => ({ ...x, role: roleLabel("internal", x.role) }))
    : null;
  const myOpen = !allReports && db
    ? await db.prepare(`SELECT COUNT(*) AS n FROM reports r WHERE r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL AND ${mySql(u)}`).bind(u.id).first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0)
    : open;
  const group = (g: string, key: string, items: (NavItem | false)[]): NavEntry[] => {
    const list = items.filter(Boolean) as NavItem[];
    return list.length ? [{ group: g, key, items: list }] : [];
  };
  return (
    <Shell
      // "Vezi ca…" is picked on the dashboard only; elsewhere the banner just says whose CRM it is and leads back.
      search={<>{viewAs && !u.impersonator && props.active === "home" && <ViewAs users={viewAs} realName={u.name || u.email} />}<GlobalSearch base={b} /></>}
      banner={viewAs && u.impersonator ? <ViewAs users={props.active === "home" ? viewAs : null} as={{ id: u.id, name: u.name || u.email, role: roleLabel("internal", u.role) }} realName={u.impersonator.name} /> : undefined}
      bare={props.bare}
      app="crm"
      label=""
      nav={[
        { key: "home", label: "Dashboard", href: b || "/" },
        ...group("CRM", "g-crm", [
          may("clients") && { key: "clients", label: "Clienți / Entități", href: `${b}/clienti` },
          may("contracts") && { key: "contracts", label: "Contracte", href: `${b}/contracte` },
          may("orders") && { key: "orders", label: "Comenzi", href: `${b}/comenzi`, badge: unread, hot: true },
          may("tenders") && { key: "tenders", label: "Licitații SEAP", href: `${b}/licitatii` },
          may("listings") && { key: "listings", label: "Anunțuri imobiliare", href: `${b}/anunturi`, badge: inquiries, hot: true },
        ]),
        ...group("Operațional", "g-ops", [
          may("reports") && { key: "reports", label: allReports ? "Rapoarte" : "Rapoartele mele", href: `${b}/rapoarte`, badge: myOpen },
          may("inspections") && { key: "inspections", label: may("inspections.all") ? "Inspecții" : "Inspecțiile mele", href: `${b}/agenda-inspectii` },
          may("properties") && { key: "properties", label: may("reports.all") ? "Proprietăți" : "Proprietăți / comparabile", href: `${b}/proprietati` },
        ]),
        ...group("Financiar", "g-fin", [
          may("billing") && { key: "invoicing", label: "Facturare", href: `${b}/facturare` },
        ]),
        ...group("Administrare", "g-admin", [
          may("users") && { key: "users", label: "Utilizatori", href: `${b}/utilizatori` },
          // Date firmă, permisiuni, fișe de inspecție, facturare, Claude, import: tabs of Setări.
          { key: "settings", label: "Setări", href: `${b}/setari` },
        ]),
      ]}
      active={props.active}
      me={{ id: props.user.id, photo: photoUrl(props.user.id, props.user.avatar_at), initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: roleLabel("internal", props.user.role), profile: `${b}/utilizatori/${props.user.id}` }}
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
