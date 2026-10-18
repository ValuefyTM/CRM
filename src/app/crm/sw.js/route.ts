import { basePath } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Service worker of the CRM. The pages are live data, so they always come from the network; what the worker keeps is
 * the app's scripts, styles, fonts and icons (fast opening, less traffic) and a page for when there is no signal.
 * Nothing of the data (reports, clients) is stored on the device.
 */
export async function GET() {
  const base = await basePath("crm");
  const js = `
const BASE = ${JSON.stringify(base)};
const OFFLINE = BASE + "/offline";
const CACHE = "vf-crm-v1";
const STATIC = ["/icon-crm-192.png", "/icon-crm-512.png", "/icon-crm-maskable.png", "/icon-crm-apple.png", "/valuefy-logo.png", "/valuefy-logo-white.png", "/valuefy-mark.png"];

async function prime() {
  const c = await caches.open(CACHE);
  await Promise.all([OFFLINE, ...STATIC].map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
}

self.addEventListener("install", (e) => { e.waitUntil(prime().catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isAsset = (url) => url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname);
const isFont = (url) => url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: always from the network (live data, sign-in); the offline page without signal.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || new Response("Fără conexiune.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  // Scripts and styles have a hash in their name, icons and fonts hardly change: once saved, served from the device.
  if ((url.origin === location.origin && isAsset(url)) || isFont(url)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && (res.type === "basic" || res.type === "cors")) (await caches.open(CACHE)).put(req, res.clone()).catch(() => {});
      return res;
    })());
  }
  // Everything else (API, files, photos): the network, untouched.
});

// Push notifications: the message is a bell item (title, text, page). The same id replaces an earlier notification.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "CRM VALUEFY", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "CRM VALUEFY", {
    body: d.body || "", icon: "/icon-crm-192.png", badge: "/icon-crm-192.png", tag: d.id || undefined, data: { href: d.href || SHELL_HOME }, timestamp: d.at ? Date.parse(d.at) : Date.now(),
  }));
});
const SHELL_HOME = BASE || "/";
// A click opens the page in the CRM window already open, else in a new one.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || SHELL_HOME;
  const url = new URL(href, self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = all.find((c) => "focus" in c);
    if (win) { await win.focus(); if ("navigate" in win) await win.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
`;
  return new Response(js, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": base || "/" },
  });
}
