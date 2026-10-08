// Server-only: how stored files are sent back. The type comes from the file extension (never from what the uploader's
// browser claimed), only PDFs and plain raster images open in the page, and everything else is a download — so an
// uploaded file can never run script on a VALUEFY host.
const TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip",
};
const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

/** The safe content type of a file name (or key): known extensions only, else a plain download. */
export function fileType(name: string) {
  return TYPES[(name.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";
}

/** Response headers for a stored file. `name` is the shown file name (or the R2 key). */
export function fileHeaders(name: string, cache = "private, no-store", download?: string) {
  const type = fileType(name);
  const inline = INLINE.has(type);
  const h: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
    // Even if a browser ever rendered the bytes as a page, it could not run script or reach the session.
    "Content-Security-Policy": type === "application/pdf" ? "default-src 'none'; img-src data:; style-src 'unsafe-inline'; object-src 'self'" : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  };
  if (download !== undefined || !inline) h["Content-Disposition"] = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(download ?? name.split("/").pop() ?? "fisier")}`;
  else h["Content-Disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(name.split("/").pop() ?? "fisier")}`;
  return h;
}
