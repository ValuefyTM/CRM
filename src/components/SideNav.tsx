"use client";
// Sidebar menu: a top link (Dashboard) and groups (CRM, Operațional, Financiar…) that fold; what is folded is
// remembered on this computer. Pages not built yet are listed and marked "în curând".
import { useEffect, useState } from "react";

export type NavItem = { label: string; href?: string; soon?: boolean; badge?: number; hot?: boolean; key: string };
export type NavGroup = { group: string; key: string; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "group" in e;
const STORE = "vf-nav-folded";

function Item({ i, active }: { i: NavItem; active: string }) {
  const badge = !!i.badge && <span className={`navBadge${i.hot ? " hot" : ""}`}>{i.badge}</span>;
  if (!i.href || i.soon) {
    return <span className="navItem soon" aria-disabled="true" title="Pagina vine în curând">{i.label}<span className="navSoon">în curând</span></span>;
  }
  return <a className="navItem" href={i.href} aria-current={active === i.key ? "page" : undefined}>{i.label}{badge}</a>;
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
            {open && <div className="navGroupItems">{e.items.map((i) => <Item key={i.key} i={i} active={active} />)}</div>}
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
export function MeMenu({ children, app }: { children: React.ReactNode; app: "crm" | "portal" }) {
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
          <button type="button" role="menuitem" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            Ieși din cont
          </button>
        </div>
      )}
    </div>
  );
}
