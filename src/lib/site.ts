import { headers } from "next/headers";

export type Audience = "staff" | "partner";

export const APP = {
  staff: { prefix: "/crm", host: "crm.", cookie: "vf_crm", sessionDays: 7, name: "VALUEFY CRM" },
  partner: { prefix: "/portal", host: "portal.", cookie: "vf_portal", sessionDays: 30, name: "Portal colaboratori VALUEFY" },
} as const;

/** Public origin of the request (https://crm.valuefy.ro, https://crm.<account>.workers.dev, http://localhost:3200…). */
export async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3200";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Path prefix for links: "" on crm./portal. subdomains (the host already says which app), else /crm or /portal. */
export async function basePath(aud: Audience) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host.startsWith(APP[aud].host) ? "" : APP[aud].prefix;
}

/** Absolute URL to a page of an app, for emails. Uses the matching subdomain when we are on valuefy.ro. */
export async function appUrl(aud: Audience, path: string) {
  const o = await origin();
  const u = new URL(o);
  const other = aud === "staff" ? APP.partner.host : APP.staff.host;
  if (u.hostname.startsWith(APP[aud].host)) return `${o}${path}`;
  if (u.hostname.startsWith(other)) return `${u.protocol}//${APP[aud].host}${u.hostname.slice(other.length)}${path}`;
  return `${o}${APP[aud].prefix}${path}`;
}
