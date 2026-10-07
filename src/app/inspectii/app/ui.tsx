"use client";
// Small building blocks of the inspections app.
import type { Insp } from "./store";

const P = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const Icon = {
  list: () => <svg {...P}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>,
  calendar: () => <svg {...P}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 17h6" /></svg>,
  pin: () => <svg {...P}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  upload: () => <svg {...P}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>,
  back: () => <svg {...P}><path d="M15 18l-6-6 6-6" /></svg>,
  phone: () => <svg {...P}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>,
  nav: () => <svg {...P}><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>,
  camera: () => <svg {...P}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  check: () => <svg {...P}><path d="M20 6L9 17l-5-5" /></svg>,
  clock: () => <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  trash: () => <svg {...P}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
  locate: () => <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></svg>,
  refresh: () => <svg {...P}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  chevron: () => <svg {...P}><path d="M9 18l6-6-6-6" /></svg>,
  search: () => <svg {...P}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
};

/** Local state of an inspection on top of the server status: a sheet waiting for signal counts as "to send". */
export type Local = Insp & { local?: "sending" | "sent" | "scheduled_offline"; draft?: boolean };

export function statusOf(i: Local): [string, string] {
  if (i.local === "sending") return ["De trimis", "warn"];
  if (i.status === "done" || i.local === "sent") return ["Finalizată", "ok"];
  if (i.status === "cancelled") return ["Anulată", "err"];
  if (i.status === "scheduled") return [i.draft ? "În lucru" : "Programată", i.draft ? "acc" : "nav"];
  return ["De programat", "warn"];
}

export function Pill({ i }: { i: Local }) {
  const [t, c] = statusOf(i);
  return <span className={`iPill ${c}`}>{t}</span>;
}

export function TopBar({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <header className="iTop">
      {onBack && (
        <button type="button" className="iIconBtn" onClick={onBack} aria-label="Înapoi"><Icon.back /></button>
      )}
      <div className="iTopText">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {right}
    </header>
  );
}

export function Chips({ opts, value, multi, onChange, label }: { opts: string[]; value: string[]; multi?: boolean; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="iChips" role="group" aria-label={label}>
      {opts.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className={`iChip${on ? " on" : ""}`} aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : on ? [] : [o])}>
            {multi && on && <Icon.check />}{o}
          </button>
        );
      })}
    </div>
  );
}

export const mapsUrl = (i: Pick<Insp, "lat" | "lng" | "address">) =>
  i.lat != null && i.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(i.address)}`;
export const wazeUrl = (i: Pick<Insp, "lat" | "lng" | "address">) =>
  i.lat != null && i.lng != null ? `https://waze.com/ul?ll=${i.lat},${i.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(i.address)}&navigate=yes`;
export const telUrl = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
