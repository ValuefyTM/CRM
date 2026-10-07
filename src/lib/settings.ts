// Server-only: VALUEFY's own details as they appear on contracts (Setări → Date firmă), editable by the owner and
// administrators. The stamp and the administrator's signature are images in R2; until uploaded, the ones from the
// signed contract model are used.
import { now } from "./db";
import { audit } from "./auth";
import { bucket } from "./orders";
import { FIRM } from "./contract-terms";
import { SIGNATURE, STAMP } from "./firm-assets";

export type Firm = typeof FIRM;
export type FirmWithImages = Firm & { stamp: string; signature: string; stampCustom: boolean; signatureCustom: boolean };

export const FIRM_FIELDS: [key: keyof Firm, label: string, hint?: string][] = [
  ["name", "Denumire", "ex. VALUEFY SRL"],
  ["cui", "CUI"],
  ["reg", "Nr. înmatriculare (ONRC)"],
  ["address", "Sediul social"],
  ["mail", "Adresa de corespondență"],
  ["iban", "IBAN / bancă", "ex. RO11INGB… / ING BANK"],
  ["rep", "Reprezentant legal"],
  ["repRole", "Calitatea reprezentantului", "ex. Administrator"],
  ["phone", "Telefon"],
  ["email", "Email"],
  ["anevar", "Nr. autorizație membru corporativ ANEVAR"],
  ["court", "Instanța competentă (localitate)", "litigiile din contract"],
];

const IMG = { stamp: "settings/stamp.png", signature: "settings/signature.png" } as const;

export async function getFirm(db: D1Database): Promise<Firm> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'firm'").first<{ value: string }>().catch(() => null);
  let saved: Partial<Firm> = {};
  try { saved = row ? (JSON.parse(row.value) as Partial<Firm>) : {}; } catch { saved = {}; }
  return { ...FIRM, ...Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in FIRM && typeof v === "string" && v.trim())) } as Firm;
}

const toDataUrl = async (obj: R2ObjectBody) => {
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${obj.httpMetadata?.contentType ?? "image/png"};base64,${btoa(bin)}`;
};

/** The firm's details plus its stamp and signature as data URLs (rendered into the contract, never as public files). */
export async function getFirmWithImages(db: D1Database): Promise<FirmWithImages> {
  const [firm, r2] = await Promise.all([getFirm(db), bucket()]);
  const [stamp, signature] = r2 ? await Promise.all([r2.get(IMG.stamp).catch(() => null), r2.get(IMG.signature).catch(() => null)]) : [null, null];
  return {
    ...firm,
    stamp: stamp ? await toDataUrl(stamp) : STAMP, signature: signature ? await toDataUrl(signature) : SIGNATURE,
    stampCustom: !!stamp, signatureCustom: !!signature,
  };
}

export async function saveFirm(db: D1Database, actor: string, body: Record<string, unknown>) {
  const before = await getFirm(db);
  const next = { ...before };
  for (const [k] of FIRM_FIELDS) {
    const v = body[k];
    if (typeof v === "string") next[k] = v.trim().replace(/\s+/g, " ").slice(0, 200);
  }
  if (!next.name || !next.cui) return { ok: false as const, error: "Denumirea și CUI-ul sunt obligatorii." };
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return { ok: false as const, error: "Emailul nu pare corect." };
  const changed = FIRM_FIELDS.filter(([k]) => before[k] !== next[k]).map(([k, l]) => `${l}: ${before[k] || "—"} → ${next[k] || "—"}`);
  if (!changed.length) return { ok: true as const };
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('firm', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(next), now(), actor).run();
  await audit(db, `user:${actor}`, "settings.firm", "settings", "firm", changed.join(" · ").slice(0, 1000));
  return { ok: true as const };
}

/** Uploads (or removes, with no file) the stamp or the signature: PNG, at most 1 MB. */
export async function saveFirmImage(db: D1Database, actor: string, which: "stamp" | "signature", file: File | null) {
  const r2 = await bucket();
  if (!r2) return { ok: false as const, error: "Stocarea fișierelor nu este disponibilă." };
  const label = which === "stamp" ? "ștampila" : "semnătura";
  if (!file) {
    await r2.delete(IMG[which]);
    await audit(db, `user:${actor}`, "settings.image", "settings", "firm", `${label}: revenire la imaginea din modelul de contract`);
    return { ok: true as const };
  }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false as const, error: "Încarcă o imagine PNG (de preferat cu fundal transparent), JPG sau WEBP." };
  if (file.size > 1024 * 1024) return { ok: false as const, error: "Imaginea depășește 1 MB." };
  await r2.put(IMG[which], file.stream(), { httpMetadata: { contentType: file.type } });
  await audit(db, `user:${actor}`, "settings.image", "settings", "firm", `${label} înlocuită`);
  return { ok: true as const };
}
