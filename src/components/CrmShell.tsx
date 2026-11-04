import { getDb } from "@/lib/db";
import { initials } from "@/lib/guard";
import { isAdmin, roleLabel, type User } from "@/lib/users";
import { can, type Perm } from "@/lib/perms";
import { settingsHome } from "@/app/crm/setari/SettingsTabs";
import { mySql } from "@/lib/perms-db";
import { ViewAs } from "./ViewAs";
import { Shell, type NavEntry, type NavItem } from "./Shell";
import { GlobalSearch } from "./GlobalSearch";
import { Bell } from "./Bell";
import { Heartbeat } from "./Heartbeat";
import { Pwa } from "./Pwa";
import { TableLabels } from "./TableLabels";
import { photoUrl } from "@/lib/presence";
import { countNewInquiries } from "@/lib/listings";
import { basePath } from "@/lib/site";
import { scopeFilter } from "@/lib/scope";
import { ownBillingOnly, toBillCount } from "@/lib/billing-tasks";
import { inspChannel } from "@/lib/uvalo";
import { activeInspections } from "@/lib/inspections-board";
import { scopeOf } from "@/lib/perms";
import { openQuotes } from "@/lib/quotes";

export async function CrmShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; back?: { href: string; label: string }; actions?: React.ReactNode; bare?: boolean; dateTitle?: boolean; children: React.ReactNode }) {
  const b = props.base;
  // Badge on "Comenzi": orders nobody in the team has opened yet, plus new requests from the website.
  const db = await getDb();
  const [unread, open, inquiries] = db
    ? await Promise.all([
        // Sales offered on the website are not shown for now: only unopened orders count.
        // (only the orders the user works on: "Pe ce date" of Comenzi, or the contracts they are accredited on)
        can(props.user, "orders") ? (() => { const f = scopeFilter(props.user, "orders", "o"); return db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE o.viewed_at IS NULL AND o.status <> 'cancelled'${f ? ` AND ${f.sql}` : ""}`).bind(...(f?.binds ?? [])).first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0); })() : 0,
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
    ? (await db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, status FROM users WHERE kind = 'internal' AND status IN ('active', 'invited') AND role <> 'inspector'
        AND id <> ? ${realRole === "owner" ? "" : "AND role <> 'owner'"} ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END, name`)
        .bind(u.impersonator?.id ?? u.id).all<{ id: string; name: string; role: string; status: string }>()).results.map((x) => ({ id: x.id, name: x.name, role: `${roleLabel("internal", x.role)}${x.status === "invited" ? " · nu s-a logat încă" : ""}` }))
    : null;
  const myOpen = !allReports && db
    ? await db.prepare(`SELECT COUNT(*) AS n FROM reports r WHERE r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL AND ${mySql(u)}`).bind(u.id).first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0)
    : open;
  // With the personal dashboard (Permisiuni → Tablou de bord: personal) the menu is one flat list, without groups.
  const flat = !may("dashboard.all");
  const group = (g: string, key: string, items: (NavItem | false)[]): NavEntry[] => {
    const list = items.filter(Boolean) as NavItem[];
    return !list.length ? [] : flat ? list : [{ group: g, key, items: list }];
  };
  const settings = settingsHome(b, u);
  const inspApp = await basePath("insp");
  const inspViaApp = db ? (await inspChannel(db).catch(() => "app")) === "app" : true;
  // Facturare: how many reports wait for their invoice (the person's own, with "Doar ale lui").
  const toBillN = db && may("billing") ? await toBillCount(db, ownBillingOnly(u) ? u.id : null).catch(() => 0) : 0;
  // Inspecții: the ones still to do (to schedule or scheduled), as the page shows them to this user.
  // Oferte: the ones still open (to send or waiting for an answer).
  const quotesN = db && may("orders") ? await openQuotes(db) : 0;
  const inspN = db && may("inspections") ? await activeInspections(db, scopeOf(u, "inspections") as "all" | "lead" | "own", u.id) : 0;
  return (
    <Shell
      // "Vezi ca…" is picked on the dashboard only; elsewhere the banner just says whose CRM it is and leads back.
      search={<>{viewAs && !u.impersonator && props.active === "home" && <ViewAs users={viewAs} realName={u.name || u.email} />}<GlobalSearch base={b} /><Bell /></>}
      banner={viewAs && u.impersonator ? <ViewAs users={props.active === "home" ? viewAs : null} as={{ id: u.id, name: u.name || u.email, role: roleLabel("internal", u.role) }} realName={u.impersonator.name} /> : undefined}
      bare={props.bare}
      dateTitle={props.dateTitle}
      app="crm"
      label=""
      nav={[
        { key: "home", label: "Dashboard", href: b || "/" },
        ...group("CRM", "g-crm", [
          may("clients") && { key: "clients", label: "Clienți / Entități", href: `${b}/clienti` },
          may("contracts") && { key: "contracts", label: "Contracte", href: `${b}/contracte` },
          may("orders") && { key: "quotes", label: "Oferte", href: `${b}/oferte`, badge: quotesN },
          may("orders") && { key: "orders", label: "Comenzi", href: `${b}/comenzi`, badge: unread, hot: true },
          may("tenders") && { key: "tenders", label: "Licitații SEAP", href: `${b}/licitatii` },
          may("listings") && { key: "listings", label: "Anunțuri imobiliare", href: `${b}/anunturi`, badge: inquiries, hot: true },
        ]),
        ...group("Operațional", "g-ops", [
          may("reports") && { key: "reports", label: allReports ? "Rapoarte" : "Rapoartele mele", href: `${b}/rapoarte`, badge: myOpen },
          may("inspections") && { key: "inspections", label: may("inspections.all") ? "Inspecții" : "Inspecțiile mele", href: `${b}/agenda-inspectii`, badge: inspN },
          may("properties") && { key: "properties", label: "Proprietăți", href: `${b}/proprietati` },
          // The inspections app (phone: sheets, photos, signature), with the same sign-in: on phones only, and only
          // when the firm's inspections go through it (not through UVALO).
          may("inspections") && inspViaApp && { key: "inspapp", label: "Aplicația de inspecții", href: inspApp || "/", mobile: true },
        ]),
        ...group("Financiar", "g-fin", [
          may("billing") && { key: "invoicing", label: may("billing.all") || u.role === "owner" ? "Facturare" : "Facturile mele", href: `${b}/facturare`, badge: toBillN, hot: true },
          may("statements") && { key: "statements", label: may("statements.all") || u.role === "owner" ? "Borderouri" : "Borderoul meu", href: `${b}/borderouri` },
          // the owner's dashboard of the firm's profitability
          u.role === "owner" && { key: "analytics", label: "Analitice", href: `${b}/analitice` },
        ]),
        ...group("Administrare", "g-admin", [
          may("users") && { key: "users", label: "Utilizatori", href: `${b}/utilizatori` },
          may("anevar") && { key: "anevar", label: "Monitorizare ANEVAR", href: `${b}/anevar` },
          // Date firmă, permisiuni, fișe de inspecție, facturare, Claude, import: tabs of Setări.
          !!settings && { key: "settings", label: "Setări", href: settings },
        ]),
      ]}
      active={props.active}
      me={{ id: props.user.id, photo: photoUrl(props.user.id, props.user.avatar_at), initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: roleLabel("internal", props.user.role), profile: `${b}/utilizatori/${props.user.id}` }}
      title={props.title}
      subtitle={props.subtitle}
      back={props.back}
      actions={props.actions}
    >
      <Heartbeat url="/api/crm/presence" />
      <TableLabels />
      {props.children}
      <Pwa base={b} />
    </Shell>
  );
}
