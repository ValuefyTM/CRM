const enc = new TextEncoder();

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL-safe random token (256 bits). */
export function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 6-digit numeric code, uniformly distributed. */
export function randomCode() {
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max;
  let n: number;
  do n = crypto.getRandomValues(new Uint32Array(1))[0];
  while (n >= limit);
  return String(n % max).padStart(6, "0");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
