import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { bucket } from "@/lib/orders";
import { canManageUser, getUser } from "@/lib/users";
import { err, staffApi } from "@/lib/api";
import { avatarColor, initialsOf } from "@/components/Avatar";

const key = (id: string) => `avatars/${id}.jpg`;

/**
 * Profile photo of a user (team only). `?fb=1`: without a photo, the initials on the person's colour (an SVG), so a
 * list can show anyone's face from the id alone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const id = (await params).id;
  const obj = await (await bucket())?.get(key(id));
  if (!obj && new URL(req.url).searchParams.has("fb")) {
    const u = await a.db.prepare("SELECT COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE id = ?").bind(id).first<{ name: string }>();
    const name = u?.name ?? "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${avatarColor(id || name)}"/><text x="32" y="33" dominant-baseline="middle" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="24" font-weight="700" fill="#141414">${initialsOf(name).replace(/[<&>"]/g, "")}</text></svg>`;
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
  }
  if (!obj) return new Response("Nu există.", { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
}

/** New photo: multipart `file` (an image, already cropped to a square by the page). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const u = await getUser(a.db, (await params).id);
  if (!u || u.status === "deleted") return err("Utilizatorul nu există.", 404);
  if (!canManageUser(a.user, u)) return err("Nu ai drepturi pentru acest cont.", 403);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !file.size) return err("Alege o fotografie.");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return err("Fotografia trebuie să fie JPG, PNG sau WebP.");
  if (file.size > 3 * 1024 * 1024) return err("Fotografia depășește 3 MB.");
  const r2 = await bucket();
  if (!r2) return err("Stocarea fișierelor nu este disponibilă momentan.", 503);
  await r2.put(key(u.id), file.stream(), { httpMetadata: { contentType: file.type } });
  const t = now();
  await a.db.prepare("UPDATE users SET avatar_at = ? WHERE id = ?").bind(t, u.id).run();
  await audit(a.db, `user:${a.user.id}`, "user.avatar", "user", u.id);
  return NextResponse.json({ ok: true, url: `/api/crm/users/${encodeURIComponent(u.id)}/avatar?v=${Date.parse(t)}` });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const u = await getUser(a.db, (await params).id);
  if (!u) return err("Utilizatorul nu există.", 404);
  if (!canManageUser(a.user, u)) return err("Nu ai drepturi pentru acest cont.", 403);
  await (await bucket())?.delete(key(u.id));
  await a.db.prepare("UPDATE users SET avatar_at = NULL WHERE id = ?").bind(u.id).run();
  return NextResponse.json({ ok: true });
}
