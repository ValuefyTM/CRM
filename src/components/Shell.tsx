import { Avatar } from "./Avatar";
import { cookies } from "next/headers";
import { MeMenu, MobileMenu, SideBrand, SideNav, type NavEntry, type NavGroup, type NavItem } from "./SideNav";

export type { NavItem, NavGroup, NavEntry } from "./SideNav";

/** Sidebar layout used by the CRM and the portal: white logo, grouped menu, the signed-in user at the bottom. */
export async function Shell(props: {
  app: "crm" | "portal";
  label: string;
  nav: NavEntry[];
  active: string;
  cta?: { label: string; href?: string };
  me: { id?: string; initials: string; name: string; sub: string; photo?: string | null; profile?: string };
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Shown in the top bar between the page title and its actions (the CRM's general search). */
  search?: React.ReactNode;
  /** No top bar (title, search, actions): pages with their own header, like a report. */
  bare?: boolean;
  /** A strip above the top bar (the CRM's "Vezi ca…" banner). */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const flat: NavItem[] = props.nav.flatMap((e) => ("group" in e ? (e as NavGroup).items : [e as NavItem]));
  // The sidebar folded to its icons (desktop), remembered in a cookie so the page opens the same way.
  const mini = (await cookies()).get("vf_side")?.value === "mini";
  return (
    <div className="shell" data-mini={mini ? "" : undefined}>
      <aside className="side">
        <SideBrand href={flat[0]?.href ?? "/"} label={props.label} mini={mini} />
        {props.cta &&
          (props.cta.href ? (
            <a href={props.cta.href} className="sideCta">{props.cta.label}</a>
          ) : (
            <span className="sideCta" aria-disabled="true" title="Disponibil în curând">{props.cta.label}</span>
          ))}
        <SideNav nav={props.nav} active={props.active} />
        <div className="me">
          <MeMenu app={props.app} profile={props.me.profile}>
            {props.me.photo
              ? <Avatar id={props.me.id ?? props.me.name} name={props.me.name} size={32} photo={props.me.photo} />
              : <span className="meAv" aria-hidden="true">{props.me.initials}</span>}
            <span className="meText"><b>{props.me.name}</b><small>{props.me.sub}</small></span>
          </MeMenu>
        </div>
      </aside>
      <div className="main">
        {props.banner}
        {!props.bare && <header className={props.app === "crm" ? "top topDark" : "top"}>
          <div>
            <h1>{props.title}</h1>
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          {props.search}
          {props.actions && <div className="actions">{props.actions}</div>}
        </header>}
        <main className="content">{props.children}</main>
      </div>
      <nav className="bottomNav" aria-label="Meniu">
        {flat.filter((i) => i.href && !i.soon).slice(0, 3).map((i) => (
          <a key={i.key} href={i.href} aria-current={props.active === i.key ? "page" : undefined}>{i.label}</a>
        ))}
        <MobileMenu />
      </nav>
    </div>
  );
}
