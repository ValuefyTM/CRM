// Server-only: the Oblio API (www.oblio.eu/api), as used by Oblio's own SDK. Credentials come from the Cloudflare
// secrets (account email + API secret, from Oblio → Setări → Date cont); the access token is kept in the settings
// table until it expires.
import { now } from "./db";

const BASE = "https://www.oblio.eu";

/** The credentials found in the environment (several names accepted), and which variables they came from. */
export function oblioCredentials() {
  const pick = (...names: string[]) => {
    for (const n of names) { const v = process.env[n]?.trim(); if (v) return { value: v, name: n }; }
    return null;
  };
  const email = pick("OBLIO_EMAIL", "OBLIO_API_EMAIL", "OBLIO_USER", "OBLIO_CLIENT_ID");
  const secret = pick("OBLIO_API_SECRET", "OBLIO_SECRET", "OBLIO_API_KEY", "OBLIO_TOKEN", "OBLIO_API_TOKEN", "OBLIO_CLIENT_SECRET");
  return { email, secret, ok: !!email && !!secret };
}

export class OblioError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

type Token = { access_token: string; token_type: string; expires_at: number };

async function token(db: D1Database, fresh = false): Promise<Token> {
  if (!fresh) {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'oblio_token'").first<{ value: string }>().catch(() => null);
    if (row) {
      try { const t = JSON.parse(row.value) as Token; if (t.expires_at > Date.now() / 1000 + 60) return t; } catch { /* expired or broken: ask again */ }
    }
  }
  const c = oblioCredentials();
  if (!c.ok) throw new OblioError("Lipsesc datele de acces Oblio (emailul contului și secretul API) din setările Cloudflare.");
  const res = await fetch(`${BASE}/api/authorize/token`, {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: c.email!.value, client_secret: c.secret!.value, grant_type: "client_credentials" }),
  }).catch(() => null);
  if (!res) throw new OblioError("Oblio nu răspunde. Încearcă din nou peste câteva minute.");
  if (!res.ok) throw new OblioError(res.status === 401 || res.status === 400 ? "Oblio a refuzat datele de acces: verifică emailul contului și secretul API." : `Autentificare Oblio eșuată (HTTP ${res.status}).`, res.status);
  const d = (await res.json()) as { access_token: string; token_type: string; expires_in: number | string; request_time?: number | string };
  const t: Token = { access_token: d.access_token, token_type: d.token_type || "Bearer", expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600) };
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('oblio_token', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(t), now()).run().catch(() => null);
  return t;
}

/** One API call; an expired token is renewed once. Oblio's `statusMessage` becomes the error shown. */
export async function oblio<T = unknown>(db: D1Database, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: Record<string, unknown>, query?: Record<string, string | number>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await token(db, attempt > 0);
    const qs = query ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}` : "";
    const res = await fetch(`${BASE}${path}${qs}`, {
      method, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `${t.token_type} ${t.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    if (!res) throw new OblioError("Oblio nu răspunde. Încearcă din nou peste câteva minute.");
    if (res.status === 401 && attempt === 0) continue;
    const d = (await res.json().catch(() => ({}))) as { status?: number; statusMessage?: string; data?: unknown };
    if (!res.ok) throw new OblioError(d.statusMessage || `Eroare Oblio (HTTP ${res.status}).`, res.status);
    return d.data as T;
  }
  throw new OblioError("Autentificarea la Oblio a expirat. Încearcă din nou.");
}

export type OblioCompany = { cif: string; company: string; userTypeAccess?: string; useStock?: boolean };
export type OblioSeries = { type: string; name: string; start: string; next: string; default: number | boolean };
export type OblioVat = { name: string; percent: number; default: boolean };

export const oblioCompanies = (db: D1Database) => oblio<OblioCompany[]>(db, "GET", "/api/nomenclature/companies");
export const oblioSeries = (db: D1Database, cif: string) => oblio<OblioSeries[]>(db, "GET", "/api/nomenclature/series", undefined, { cif });
export const oblioVatRates = (db: D1Database, cif: string) => oblio<OblioVat[]>(db, "GET", "/api/nomenclature/vat_rates", undefined, { cif });

export type OblioDoc = { seriesName: string; number: string | number; link: string };
export const oblioCreate = (db: D1Database, type: "invoice" | "proforma", data: Record<string, unknown>) => oblio<OblioDoc>(db, "POST", `/api/docs/${type}`, data);
export const oblioCancel = (db: D1Database, type: "invoice" | "proforma", cif: string, seriesName: string, number: string) =>
  oblio(db, "PUT", `/api/docs/${type}/cancel`, { cif, seriesName, number });
export const oblioCollect = (db: D1Database, cif: string, seriesName: string, number: string, collect: Record<string, unknown>) =>
  oblio(db, "PUT", "/api/docs/invoice/collect", { cif, seriesName, number, collect });
