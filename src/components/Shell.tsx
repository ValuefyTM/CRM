import { LogoutButton } from "./LogoutButton";

export type NavItem = { label: string; href?: string; soon?: boolean; badge?: number; key: string };

/** Sidebar layout from the "Portal colaboratori" design, used by both the CRM and the portal. */
export function Shell(props: {
  app: "crm" | "portal";
  label: string;
  nav: NavItem[];
  active: string;
  cta?: { label: string; href?: string };
  me: { initials: string; name: string; sub: string };
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = props.nav;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brandPill">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/valuefy-logo.png" alt="VALUEFY" />
          </span>
          <span className="brandLabel">{props.label}</span>
        </div>
        {props.cta &&
          (props.cta.href ? (
            <a href={props.cta.href} className="sideCta">{props.cta.label}</a>
          ) : (
            <span className="sideCta" aria-disabled="true" title="Disponibil în curând">{props.cta.label}</span>
          ))}
        <nav className="nav" aria-label="Meniu">
          {items.map((i) =>
            i.href ? (
              <a key={i.key} href={i.href} aria-current={props.active === i.key ? "page" : undefined}>
                {i.label}
                {i.soon && <span className="soon">în curând</span>}
                {!!i.badge && <span className="soon" title="Comenzi noi">{i.badge}</span>}
              </a>
            ) : null,
          )}
        </nav>
        <div className="me">
          <div className="meCard">
            <span className="avatar">{props.me.initials}</span>
            <span className="meText"><b>{props.me.name}</b><small>{props.me.sub}</small></span>
          </div>
          <LogoutButton app={props.app} />
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
        {items.filter((i) => i.href).slice(0, 4).map((i) => (
          <a key={i.key} href={i.href} aria-current={props.active === i.key ? "page" : undefined}>{i.label}</a>
        ))}
      </nav>
    </div>
  );
}
