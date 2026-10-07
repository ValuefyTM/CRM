// Online / offline from the last activity of a user (any app). The CRM pings every minute while a tab is open, the
// inspections app with each call, so "online" means active in the last 3 minutes.
export type Presence = "online" | "away" | "offline";

const MIN = 60_000;

export function presenceOf(lastSeen: string | null | undefined, at = Date.now()): { presence: Presence; seen: string } {
  if (!lastSeen) return { presence: "offline", seen: "Nu a intrat încă" };
  const t = new Date(lastSeen).getTime();
  const ago = Math.max(0, at - t);
  if (ago < 3 * MIN) return { presence: "online", seen: "Online acum" };
  if (ago < 30 * MIN) return { presence: "away", seen: `Activ acum ${Math.round(ago / MIN)} min` };
  if (ago < 60 * MIN) return { presence: "offline", seen: "Văzut acum o oră" };
  if (ago < 24 * 60 * MIN) {
    const h = Math.round(ago / (60 * MIN));
    return { presence: "offline", seen: `Văzut acum ${h} ${h === 1 ? "oră" : "ore"}` };
  }
  const d = new Date(t);
  const days = Math.floor(ago / (24 * 60 * MIN));
  const when = days < 7
    ? d.toLocaleString("ro-RO", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" })
    : d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined, timeZone: "Europe/Bucharest" });
  return { presence: "offline", seen: `Văzut ${when}` };
}

/** URL of a user's profile photo (null without one); the upload time keeps browsers from showing an old one. */
export const photoUrl = (id: string, avatarAt: string | null | undefined) => (avatarAt ? `/api/crm/users/${encodeURIComponent(id)}/avatar?v=${Date.parse(avatarAt) || 0}` : null);

/** Adds `presence`, `seen` and `photo` to people read with their `last_seen_at` (and `avatar_at`). */
export const withPresence = <T extends { id?: string; last_seen_at?: string | null; avatar_at?: string | null }>(list: T[]) =>
  list.map((p) => ({ ...p, ...presenceOf(p.last_seen_at), photo: p.id ? photoUrl(p.id, p.avatar_at) : null }));
