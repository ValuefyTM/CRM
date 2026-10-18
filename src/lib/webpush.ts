// Server-only: Web Push from a Cloudflare Worker, with Web Crypto only (no Node library): the message encryption of
// RFC 8291 (aes128gcm) and the VAPID signature of RFC 8292. The push service (Google, Mozilla, Apple) only ever sees
// the encrypted message; the browser decrypts it with the keys of its subscription.

export type PushKeys = { publicKey: string; privateJwk: JsonWebKey };
export type Subscription = { endpoint: string; p256dh: string; auth: string };

const te = new TextEncoder();
export const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
type Bytes = Uint8Array<ArrayBuffer>;
const cat = (...parts: Uint8Array[]): Bytes => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

/** A new VAPID key pair (P-256): the public key as the browser wants it (raw, base64url), the private one as JWK. */
export async function generateVapidKeys(): Promise<PushKeys> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64url(pub), privateJwk };
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** The message, encrypted for one subscription (aes128gcm body: salt, record size, our public key, ciphertext). */
async function encrypt(sub: Subscription, plaintext: string) {
  const uaPublic = unb64url(sub.p256dh), authSecret = unb64url(sub.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // one record: the text, then the delimiter of the last record (0x02)
  const record = cat(te.encode(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, record));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** The VAPID token for a push service (its origin), signed with our private key; valid 12 hours. */
async function vapidAuth(keys: PushKeys, audience: string, subject: string) {
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(te.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

export type PushResult = { ok: true } | { ok: false; status: number; gone: boolean };

/** Sends one message to one subscription. `gone`: the subscription no longer exists (to be deleted). */
export async function sendWebPush(keys: PushKeys, subject: string, sub: Subscription, payload: object, ttl = 86400): Promise<PushResult> {
  const body = await encrypt(sub, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal", Authorization: await vapidAuth(keys, new URL(sub.endpoint).origin, subject) },
    body,
  });
  if (r.ok) return { ok: true };
  return { ok: false, status: r.status, gone: r.status === 404 || r.status === 410 };
}
