import { Avatar } from "./Avatar";
import { MeMenu, SideNav, type NavEntry, type NavGroup, type NavItem } from "./SideNav";

export type { NavItem, NavGroup, NavEntry } from "./SideNav";

/** Sidebar layout used by the CRM and the portal: white logo, grouped menu, the signed-in user at the bottom. */
export function Shell(props: {
  app: "crm" | "portal";
  label: string;
  nav: NavEntry[];
  active: string;
  cta?: { label: string; href?: string };
  me: { id?: string; initials: string; name: string; sub: string; photo?: string | null };
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const flat: NavItem[] = props.nav.flatMap((e) => ("group" in e ? (e as NavGroup).items : [e as NavItem]));
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href={flat[0]?.href ?? "/"} aria-label="VALUEFY · acasă">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo-white.png" alt="VALUEFY" />
          <span className="brandLabel">{props.label}</span>
        </a>
        {props.cta &&
          (props.cta.href ? (
            <a href={props.cta.href} className="sideCta">{props.cta.label}</a>
          ) : (
            <span className="sideCta" aria-disabled="true" title="Disponibil în curând">{props.cta.label}</span>
          ))}
        <SideNav nav={props.nav} active={props.active} />
        <div className="me">
          <MeMenu app={props.app}>
            {props.me.photo
              ? <Avatar id={props.me.id ?? props.me.name} name={props.me.name} size={32} photo={props.me.photo} />
              : <span className="meAv" aria-hidden="true">{props.me.initials}</span>}
            <span className="meText"><b>{props.me.name}</b><small>{props.me.sub}</small></span>
          </MeMenu>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <div>
            <h1>{props.title}</h1>
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          {props.actions && <div className="actions">{props.actions}</div>}
        </header>
        <main className="content">{props.children}</main>
      </div>
      <nav className="bottomNav" aria-label="Meniu">
        {flat.filter((i) => i.href && !i.soon).slice(0, 4).map((i) => (
          <a key={i.key} href={i.href} aria-current={props.active === i.key ? "page" : undefined}>{i.label}</a>
        ))}
      </nav>
    </div>
  );
}
