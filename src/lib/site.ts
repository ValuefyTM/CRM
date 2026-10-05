import { headers } from "next/headers";

/** The two applications served by this worker. */
export type App = "crm" | "portal";
/** Account kinds (see migrations/1001_users.sql). The team uses the CRM; partners and clients the portal. */
export type Kind = "internal" | "partner" | "client";

export const APP = {
  crm: { prefix: "/crm", host: "crm.", cookie: "vf_crm", sessionDays: 7, kinds: ["internal"] as Kind[] },
  portal: { prefix: "/portal", host: "portal.", cookie: "vf_portal", sessionDays: 30, kinds: ["partner", "client"] as Kind[] },
} as const;

export const appOf = (kind: Kind): App => (kind === "internal" ? "crm" : "portal");

/** Name of the application a kind of user signs in to (emails, page titles). */
export const APP_NAME: Record<Kind, string> = {
  internal: "VALUEFY CRM",
  partner: "Portal colaboratori VALUEFY",
  client: "Portal client VALUEFY",
};

async function host() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3200";
}

/** Public origin of the request (https://crm.valuefy.ro, https://crm.<account>.workers.dev, http://localhost:3200…). */
export async function origin() {
  const h = await headers();
  const hst = await host();
  const proto = h.get("x-forwarded-proto") ?? (hst.startsWith("localhost") ? "http" : "https");
  return `${proto}://${hst}`;
}

/** Path prefix for links: "" on crm./portal. subdomains (the host already says which app), else /crm or /portal. */
export async function basePath(app: App) {
  return (await host()).startsWith(APP[app].host) ? "" : APP[app].prefix;
}

/** Absolute URL to a page of an app, for emails. Switches subdomain on valuefy.ro; elsewhere uses the path prefix. */
export async function appUrl(app: App, path: string) {
  const o = await origin();
  const u = new URL(o);
  if (u.hostname.startsWith(APP[app].host)) return `${o}${path}`;
  const other = Object.values(APP).find((a) => u.hostname.startsWith(a.host));
  // crm.<account>.workers.dev has no portal.<account>.workers.dev twin, so only swap on our own domain.
  if (other && !u.hostname.endsWith(".workers.dev")) return `${u.protocol}//${APP[app].host}${u.host.slice(other.host.length)}${path}`;
  return `${o}${APP[app].prefix}${path}`;
}
