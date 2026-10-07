"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

type Facet = [string, string, number?][];
export type ContractQuery = { q?: string; tip?: string; an?: string; stare?: string };

/** Search and filters of the contracts list (they live in the URL). */
export function ContractFilters(p: { base: string; current: ContractQuery; total: number; kinds: Facet; years: Facet; states: Facet }) {
  const router = useRouter();
  const [q, setQ] = useState(p.current.q ?? "");
  const go = (change: Partial<ContractQuery>) => {
    const next = { ...p.current, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    router.push(`${p.base}/contracte${qs ? `?${qs}` : ""}`);
  };
  const c = p.current;
  const active = [c.q, c.tip, c.an, c.stare].filter(Boolean).length;
  return (
    <>
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută nr. contract, client, CUI, nr. raport… ↵" aria-label="Caută" />
        <FilterSelect label="Tip" value={c.tip ?? ""} options={p.kinds} onChange={(v) => go({ tip: v || undefined })} all="Toate" />
        <FilterSelect label="An" value={c.an ?? ""} options={p.years} onChange={(v) => go({ an: v || undefined })} all="Toți" />
        <FilterSelect label="Stare" value={c.stare ?? ""} options={p.states} onChange={(v) => go({ stare: v || undefined })} all="Oricare" />
      </form>
      <div className="resultLine">
        <span>
          <b style={{ color: "var(--ink)" }}>{p.total.toLocaleString("ro-RO")}</b> contracte
          {active > 0 && <> · <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); router.push(`${p.base}/contracte`); }}>✕ Resetează filtrele ({active})</button></>}
        </span>
      </div>
    </>
  );
}
