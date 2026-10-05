// Files moved from Glide into R2. A column then holds "r2:<key>" instead of the Glide URL;
// one that could not be downloaded holds "lost:<url>" so it is not retried forever.

/** Columns that can hold a Glide file URL. */
export const FILE_COLUMNS: [table: string, column: string][] = [
  ["crm_properties", "image_url"],
  ["inspection_sheets", "photo_url"],
  ["inspection_sheets", "signature_url"],
  ["entities", "logo_url"],
];

export const GLIDE_URL = "https://storage.googleapis.com/glide-prod%";

/** <img src> for a stored value: R2 files go through the CRM (team only), other URLs are used as they are. */
export const fileSrc = (v: string | null | undefined) =>
  !v || v.startsWith("lost:") ? null : v.startsWith("r2:") ? `/api/crm/files/${v.slice(3).split("/").map(encodeURIComponent).join("/")}` : v;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf" };

/** Downloads one Glide file into R2. Returns the new column value. */
export async function moveToR2(r2: R2Bucket, url: string, keyBase: string) {
  try {
    const res = await fetch(url);
    if ([400, 403, 404, 410].includes(res.status)) return `lost:${url}`; // gone from Glide
    if (!res.ok || !res.body) return null; // temporary error: retry on the next run
    const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    const ext = EXT[type] ?? (url.match(/\.(jpe?g|png|webp|gif|heic|pdf)(?:\?|$)/i)?.[1]?.toLowerCase() ?? "bin");
    const key = `${keyBase}.${ext}`;
    await r2.put(key, res.body, { httpMetadata: { contentType: type, cacheControl: "private, max-age=86400" }, customMetadata: { source: url } });
    return `r2:${key}`;
  } catch {
    return null; // network hiccup: leave it for the next run
  }
}
