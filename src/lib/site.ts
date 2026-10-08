import { headers } from "next/headers";

/** The applications served by this worker. */
export type App = "crm" | "portal" | "insp";
/** Account kinds (see migrations/1001_users.sql). The team uses the CRM; partners and clients the portal. */
export type Kind = "internal" | "partner" | "client";

export const APP = {
  crm: { prefix: "/crm", host: "crm.", cookie: "vf_crm", sessionDays: 7, kinds: ["internal"] as Kind[] },
  portal: { prefix: "/portal", host: "portal.", cookie: "vf_portal", sessionDays: 30, kinds: ["partner", "client"] as Kind[] },
  // Inspections app for inspectors and evaluators (inspectii.valuefy.ro). Long sessions: it is used on site, often offline.
  insp: { prefix: "/inspectii", host: "inspectii.", cookie: "vf_insp", sessionDays: 60, kinds: ["internal"] as Kind[] },
} as const;

/** The app a kind of account signs in to by default (team members can also use the inspections app). */
export const appOf = (kind: Kind): App => (kind === "internal" ? "crm" : "portal");

/** Team roles allowed in the inspections app. */
export const INSP_ROLES = ["inspector", "evaluator"];

/** Name of the application a kind of user signs in to (emails, page titles). */
export const APP_NAME: Record<Kind, string> = {
  internal: "VALUEFY CRM",
  partner: "Portal colaboratori VALUEFY",
  client: "Portal client VALUEFY",
};

/** Hosts the app answers on; anything else (a forged header) falls back to the production CRM host. */
const OK_HOST = /^(?:[a-z0-9-]+\.)*(?:valuefy\.ro|workers\.dev|localhost)(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/i;

async function host() {
  const h = await headers();
  const v = h.get("host") ?? "localhost:3200";
  return OK_HOST.test(v) ? v : "crm.valuefy.ro";
}

/** Public origin of the request (https://crm.valuefy.ro, https://crm.<account>.workers.dev, http://crm.localhost:8796…). */
export async function origin() {
  const hst = await host();
  const local = /^(?:[a-z0-9-]+\.)*localhost(?::\d+)?$|^127\.0\.0\.1/.test(hst);
  return `${local ? "http" : "https"}://${hst}`;
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
