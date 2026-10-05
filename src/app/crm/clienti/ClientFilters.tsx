"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

export type ClientQuery = { q?: string; kind?: string; portal?: string };

export function ClientFilters({ base, current, total, kinds }: { base: string; current: ClientQuery; total: number; kinds: [string, string, number][] }) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const go = (change: Partial<ClientQuery>) => {
    const next = { ...current, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    router.push(`${base}/clienti${qs ? `?${qs}` : ""}`);
  };
  const active = [current.q, current.kind, current.portal].filter(Boolean).length;
  return (
    <>
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nume, CUI, email, telefon, localitate, persoană de contact… ↵" aria-label="Caută" />
        <FilterSelect label="Tip" value={current.kind ?? ""} options={kinds} onChange={(v) => go({ kind: v || undefined })} all="Toți" />
        <FilterSelect label="Portal" value={current.portal ?? ""} options={[["yes", "Cu cont în portal"], ["no", "Fără cont"]]} onChange={(v) => go({ portal: v || undefined })} all="Oricare" />
      </form>
      <div className="resultLine">
        <span><b style={{ color: "var(--ink)" }}>{total.toLocaleString("ro-RO")}</b> clienți
          {active > 0 && <> · <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); router.push(`${base}/clienti`); }}>✕ Resetează filtrele</button></>}
        </span>
      </div>
    </>
  );
}
