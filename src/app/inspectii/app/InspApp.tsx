"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { allDrafts, allOps, allPhotos, wipe, type Draft, type LocalPhoto, type ScheduleOp } from "./store";
import { AuthExpired, cachedList, fetchList, syncAll } from "./sync";
import { Icon, type Local } from "./ui";
import { ListView } from "./ListView";
import { CalendarView } from "./CalendarView";
import { MapView } from "./MapView";
import { OutboxView } from "./OutboxView";
import { DetailView } from "./DetailView";
import { ScheduleView } from "./ScheduleView";
import { SheetView } from "./SheetView";
import { PhotosView } from "./PhotosView";
import { SignView } from "./SignView";

export type Me = { id: string; name: string; email: string; role: string };

/** Everything the views need. */
export type Ctx = {
  me: Me;
  base: string;
  list: Local[];
  loaded: boolean;
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  pending: { ops: ScheduleOp[]; photos: LocalPhoto[]; drafts: Draft[]; count: number };
  go: (hash: string) => void;
  back: () => void;
  reload: () => Promise<void>; // re-reads what the phone keeps
  sync: () => Promise<void>; // sends and refreshes
  logout: () => Promise<void>;
};

type Route = { view: string; id?: string };
const parse = (h: string): Route => {
  const p = h.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (p[0] === "i" && p[1]) return { view: p[2] || "detail", id: decodeURIComponent(p[1]) };
  return { view: p[0] || "list" };
};

export function InspApp({ base, me }: { base: string; me: Me }) {
  const [route, setRoute] = useState<Route>({ view: "list" });
  const [server, setServer] = useState<Local[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [ops, setOps] = useState<ScheduleOp[]>([]);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const toLogin = useCallback(() => { location.href = `${base}/login`; }, [base]);

  const reload = useCallback(async () => {
    const [l, o, p, d] = await Promise.all([cachedList(), allOps(), allPhotos(), allDrafts()]);
    if (l) { setServer(l.inspections); setLastSync(l.at); setLoaded(true); }
    setOps(o); setPhotos(p); setDrafts(d);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await syncAll();
      setOnline(!r.offline && navigator.onLine);
      if (r.offline) { const l = await cachedList(); if (!l) setLoaded(true); }
    } catch (e) {
      if (e instanceof AuthExpired) return toLogin();
    } finally {
      await reload();
      setSyncing(false);
    }
  }, [reload, toLogin]);

  // Start: what the phone has, then the server.
  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    onHash();
    window.addEventListener("hashchange", onHash);
    reload().then(() => sync());
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    const vis = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(() => { if (navigator.onLine) sync(); }, 5 * 60_000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${base}/sw.js`, { scope: base || "/" }).catch(() => {});
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(t);
    };
  }, [base, reload, sync]);

  // Local work shown on top of the server list.
  const list = useMemo<Local[]>(() => server.map((i) => {
    const op = [...ops].reverse().find((o) => o.inspection_id === i.id && !o.error);
    const d = drafts.find((x) => x.id === i.id);
    let x: Local = { ...i };
    if (op) x = { ...x, status: "scheduled", scheduled_at: op.body.scheduled_at, duration_min: op.body.duration_min, local: "scheduled_offline" };
    if (d?.submitted) x = { ...x, local: "sent" };
    else if (d?.submit) x = { ...x, local: "sending" };
    else if (d) x = { ...x, draft: true };
    return x;
  }), [server, ops, drafts]);

  const pending = useMemo(() => {
    const p = photos.filter((x) => !x.uploaded || x.deleted);
    const d = drafts.filter((x) => !x.submitted && (x.submit || x.dirty));
    return { ops, photos: p, drafts: d, count: ops.length + p.length + d.filter((x) => x.submit || x.error).length };
  }, [ops, photos, drafts]);

  const go = useCallback((h: string) => { location.hash = h; window.scrollTo(0, 0); }, []);
  const back = useCallback(() => {
    if (route.id && route.view !== "detail") go(`#/i/${encodeURIComponent(route.id)}`);
    else if (history.length > 1 && route.view === "detail") history.back();
    else go("#/");
  }, [route, go]);

  const logout = useCallback(async () => {
    if (pending.count && !confirm("Ai date netrimise pe telefon. Dacă ieși din cont, se pierd. Ieși totuși?")) return;
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app: "insp" }) }).catch(() => {});
    await wipe().catch(() => {});
    toLogin();
  }, [pending.count, toLogin]);

  const ctx: Ctx = { me, base, list, loaded, online, syncing, lastSync, pending, go, back, reload, sync, logout };
  const item = route.id ? list.find((i) => i.id === route.id) : undefined;

  let body: React.ReactNode;
  if (route.id) {
    if (route.view === "programeaza") body = <ScheduleView ctx={ctx} id={route.id} item={item} />;
    else if (route.view === "fisa") body = <SheetView ctx={ctx} id={route.id} item={item} />;
    else if (route.view === "foto") body = <PhotosView ctx={ctx} id={route.id} item={item} />;
    else if (route.view === "semnatura") body = <SignView ctx={ctx} id={route.id} item={item} />;
    else body = <DetailView ctx={ctx} id={route.id} item={item} />;
  } else if (route.view === "calendar") body = <CalendarView ctx={ctx} />;
  else if (route.view === "harta") body = <MapView ctx={ctx} />;
  else if (route.view === "detrimis") body = <OutboxView ctx={ctx} />;
  else body = <ListView ctx={ctx} />;

  const tab = route.id ? "" : route.view;
  const tabs: [string, string, () => React.ReactNode][] = [["list", "Inspecții", Icon.list], ["calendar", "Calendar", Icon.calendar], ["harta", "Hartă", Icon.pin], ["detrimis", "De trimis", Icon.upload]];
  return (
    <div className="iApp">
      {!online && <div className="iOffline" role="status">Fără semnal · lucrezi pe telefon, se trimite automat</div>}
      <div className="iBody">{body}</div>
      {!route.id && (
        <nav className="iNav" aria-label="Navigare">
          {tabs.map(([k, label, I]) => (
            <a key={k} href={k === "list" ? "#/" : `#/${k}`} aria-current={tab === k || (k === "list" && tab === "list") ? "page" : undefined}>
              <I />{label}
              {k === "detrimis" && pending.count > 0 && <span className="iBadge">{pending.count}</span>}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
