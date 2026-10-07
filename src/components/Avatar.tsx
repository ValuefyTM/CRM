// A person's avatar: initials on a colour of their own, with an online / away / offline marker.
import type { Presence } from "@/lib/presence";

const COLORS = ["#F2A93B", "#7C9CF5", "#5BC0A6", "#E58B9A", "#B39DDB", "#F28C5B", "#6CB4E0", "#C9B458", "#8FC97A", "#E0A3D6"];

export const initialsOf = (name: string) => {
  const n = name.trim().replace(/@.*/, "");
  const w = n.split(/[\s._-]+/).filter(Boolean);
  return ((w.length > 1 ? w[0][0] + w[w.length - 1][0] : n.slice(0, 2)) || "?").toUpperCase();
};

function colorOf(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const LABEL: Record<Presence, string> = { online: "online", away: "activ recent", offline: "offline" };

export function Avatar({ id, name, size = 36, presence, title, photo }: { id: string; name: string; size?: number; presence?: Presence | null; title?: string; photo?: string | null }) {
  return (
    <span className="pAvatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: colorOf(id || name) }} title={title ?? name} aria-hidden={!presence}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" loading="lazy" /> : initialsOf(name)}
      {presence && <i className={`pDot ${presence}`} role="img" aria-label={LABEL[presence]} />}
    </span>
  );
}

/** Avatar, name and a second line (role, last activity). */
export function PersonLine({ id, name, sub, presence, size = 32, me, photo }: { id: string; name: string; sub?: string | null; presence?: Presence | null; size?: number; me?: boolean; photo?: string | null }) {
  return (
    <span className="pLine">
      <Avatar id={id} name={name} size={size} presence={presence} photo={photo} />
      <span className="pText"><b>{name}{me && <em> (eu)</em>}</b>{sub && <small>{sub}</small>}</span>
    </span>
  );
}
