import { basePath } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Service worker of the inspections app: keeps the app shell and its scripts on the phone, so the app opens without
 * signal. Data (inspections, sheets, photos) is kept by the app itself in IndexedDB and sent when the signal is back.
 */
export async function GET() {
  const base = await basePath("insp");
  const js = `
const BASE = ${JSON.stringify(base)};
const SHELL = BASE || "/"; // the app page (Next serves /inspectii without the trailing slash)
const CACHE = "vf-insp-v1";
const STATIC = ["/icon-insp-192.png", "/icon-insp-512.png", "/valuefy-logo.png", BASE + "/manifest.webmanifest"];

async function cacheShell() {
  const c = await caches.open(CACHE);
  const res = await fetch(SHELL, { credentials: "include", cache: "no-store" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  await c.put(SHELL, res);
  const assets = [...new Set(html.match(/\\/_next\\/static\\/[^"'\\\\\\s)]+/g) || [])];
  await Promise.all([...STATIC, ...assets].map((u) => c.add(u).catch(() => {})));
}

self.addEventListener("install", (e) => { e.waitUntil(cacheShell().catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "refresh-shell") cacheShell().catch(() => {}); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;

  // The app page: network first (fresh data and sign-in check), the saved shell without signal.
  if (req.mode === "navigate" && (p === SHELL || p === BASE + "/")) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) (await caches.open(CACHE)).put(SHELL, res.clone());
        return res;
      } catch {
        return (await caches.match(SHELL)) || new Response("Fără semnal. Deschide aplicația din nou când ai internet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }
  // Scripts and styles have a hash in their name: once saved, always valid.
  if (p.startsWith("/_next/static/") || p.startsWith("/api/insp/files/")) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }
  if (STATIC.includes(p)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
`;
  return new Response(js, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": base || "/" },
  });
}
