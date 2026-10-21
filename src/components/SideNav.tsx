"use client";
// Sidebar menu: a top link (Dashboard) and groups (CRM, Operațional, Financiar…) that fold; what is folded is
// remembered on this computer. Pages not built yet are listed and marked "în curând".
import { useEffect, useState } from "react";

export type NavItem = { label: string; href?: string; soon?: boolean; badge?: number; hot?: boolean; key: string;
  /** shown only on phones (the menu drawer), not in the desktop sidebar */
  mobile?: boolean };
export type NavGroup = { group: string; key: string; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "group" in e;

// One line icon per page (24×24, stroke), by menu key.
const ICONS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  clients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  contracts: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  orders: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  tenders: "m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8",
  listings: "M3 11l18-8-8 18-2-8z",
  reports: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4",
  inspections: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14v4M10 16h4",
  properties: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01",
  inspapp: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM10 18h4M9 6h6",
  analytics: "M3 3v18h18M7 15l4-4 3 3 6-7",
  invoicing: "M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .67V2l-1 .67L17 2l-3 2-3-2-3 2-3-2zM8 8h8M8 12h8M8 16h5",
  users: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM20 21a8 8 0 0 0-16 0",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  account: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM20 21a8 8 0 0 0-16 0",
};
const DOT = "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0";
const Icon = ({ k }: { k: string }) => (
  <svg className="navIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[k] ?? DOT} /></svg>
);
const MINI = "vf_side";

/** Logo and the button that folds the sidebar to its icons; folded, the V mark opens it again. Kept in a cookie. */
export function SideBrand({ href, label, mini: start }: { href: string; label: string; mini: boolean }) {
  const [mini, setMini] = useState(start);
  const set = (m: boolean) => {
    setMini(m);
    document.querySelector(".shell")?.toggleAttribute("data-mini", m);
    document.cookie = `${MINI}=${m ? "mini" : ""}; path=/; max-age=${m ? 31536000 : 0}; samesite=lax`;
  };
  return (
    <div className="brandRow">
      <a className="brand" href={href} aria-label={mini ? "Deschide meniul" : "VALUEFY · acasă"} title={mini ? "Deschide meniul" : undefined}
        onClick={(e) => { if (mini && window.matchMedia("(min-width: 980px)").matches) { e.preventDefault(); set(false); } }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brandFull" src="/valuefy-logo-white.png" alt="VALUEFY" width={600} height={123} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brandMark" src="/valuefy-mark.png" alt="" width={152} height={121} />
        {label && <span className="brandLabel">{label}</span>}
      </a>
      <button type="button" className="sideFold" aria-label={mini ? "Deschide meniul" : "Închide meniul"} title={mini ? "Deschide meniul" : "Închide meniul"} aria-expanded={!mini} onClick={() => set(!mini)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" /><path d={mini ? "m14 9 3 3-3 3" : "m16 15-3-3 3-3"} /></svg>
      </button>
    </div>
  );
}
const STORE = "vf-nav-folded";

function Item({ i, active }: { i: NavItem; active: string }) {
  const badge = !!i.badge && <span className={`navBadge${i.hot ? " hot" : ""}`}>{i.badge}</span>;
  if (!i.href || i.soon) {
    return <span className="navItem soon" aria-disabled="true" title="Pagina vine în curând"><Icon k={i.key} /><span className="navLabel">{i.label}</span><span className="navSoon">în curând</span></span>;
  }
  return <a className={`navItem${i.mobile ? " navMobileOnly" : ""}`} href={i.href} title={i.label} aria-current={active === i.key ? "page" : undefined}><Icon k={i.key} /><span className="navLabel">{i.label}</span>{badge}</a>;
}

export function SideNav({ nav, active }: { nav: NavEntry[]; active: string }) {
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => {
    try { setFolded(JSON.parse(localStorage.getItem(STORE) ?? "[]")); } catch { /* private window */ }
  }, []);
  const toggle = (k: string) => {
    const next = folded.includes(k) ? folded.filter((x) => x !== k) : [...folded, k];
    setFolded(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* not kept */ }
  };
  return (
    <nav className="sideNav" aria-label="Meniu">
      {nav.map((e) => {
        if (!isGroup(e)) return <Item key={e.key} i={e} active={active} />;
        const open = !folded.includes(e.key) || e.items.some((i) => i.key === active);
        const sum = e.items.reduce((s, i) => s + (i.hot ? i.badge ?? 0 : 0), 0);
        return (
          <div key={e.key} className={`navGroup${open ? " open" : ""}`}>
            <button type="button" className="navGroupHead" aria-expanded={open} onClick={() => toggle(e.key)}>
              <span>{e.group}</span>
              {!open && sum > 0 && <span className="navBadge hot">{sum}</span>}
              <span className="navChev" aria-hidden="true">›</span>
            </button>
            {/* Folded groups stay in the page: with the sidebar folded to icons every page shows. */}
            <div className="navGroupItems" hidden={!open}>{e.items.map((i) => <Item key={i.key} i={i} active={active} />)}</div>
          </div>
        );
      })}
    </nav>
  );
}

export type Density = "compact" | "normal" | "comfortable";
const DENSITY_KEY = "vf-nav-density";
const applyDensity = (d: Density) => { document.documentElement.dataset.navDensity = d; };

/** The signed-in user at the bottom of the sidebar, with a menu (menu density, sign out). */
export function MeMenu({ children, app, profile }: { children: React.ReactNode; app: "crm" | "portal"; profile?: string }) {
  const [open, setOpen] = useState(false);
  const [density, setDensity] = useState<Density>("normal");
  useEffect(() => {
    try {
      const d = localStorage.getItem(DENSITY_KEY) as Density | null;
      if (d === "compact" || d === "comfortable" || d === "normal") { setDensity(d); applyDensity(d); }
    } catch { /* private window */ }
  }, []);
  const pick = (d: Density) => {
    setDensity(d); applyDensity(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* not kept */ }
  };
  useEffect(() => {
    if (!open) return;
    const off = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest(".meCard")) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app }) });
    location.href = location.pathname.startsWith(`/${app}`) ? `/${app}/login` : "/login";
  };
  return (
    <div className="meCard">
      {children}
      <button type="button" className="meMore" aria-label="Meniu cont" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div className="meMenu" role="menu">
          <div className="meDensity" role="group" aria-label="Densitate meniu">
            <span>Densitate meniu</span>
            <div>
              {([["compact", "Compact"], ["normal", "Normal"], ["comfortable", "Confortabil"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={density === k} onClick={() => pick(k)}>{l}</button>
              ))}
            </div>
          </div>
          {profile && <a role="menuitem" href={profile}>Profilul meu</a>}
          <button type="button" role="menuitem" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            Ieși din cont
          </button>
        </div>
      )}
    </div>
  );
}

/** Phone: the last button of the bottom bar opens the whole sidebar (all pages, account, sign out) as a drawer. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const shell = document.querySelector(".shell");
    if (!shell) return;
    if (open) shell.setAttribute("data-menu", "");
    else shell.removeAttribute("data-menu");
    if (!open) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    // A page link in the drawer closes it (the new page loads under it otherwise).
    const nav = (ev: MouseEvent) => { if ((ev.target as HTMLElement).closest(".side a[href]")) setOpen(false); };
    document.addEventListener("keydown", esc);
    document.addEventListener("click", nav);
    return () => { document.removeEventListener("keydown", esc); document.removeEventListener("click", nav); };
  }, [open]);
  return (
    <>
      <button type="button" className="bottomMenuBtn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        {open ? "Închide" : "Meniu"}
      </button>
      {open && <div className="menuBackdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
    </>
  );
}
