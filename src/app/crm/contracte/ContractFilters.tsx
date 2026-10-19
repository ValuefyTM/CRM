"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

type Facet = [string, string, number?][];
export type ContractQuery = { q?: string; tip?: string; an?: string; stare?: string };

/** Search and filters of one tab of the contracts page (they live in the URL; `tip` is the tab and stays). */
export function ContractFilters(p: { base: string; current: ContractQuery; total: number; years?: Facet; states?: Facet; placeholder?: string; noun?: [string, string] }) {
  const router = useRouter();
  const [q, setQ] = useState(p.current.q ?? "");
  const go = (change: Partial<ContractQuery>) => {
    const next = { ...p.current, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    router.push(`${p.base}/contracte${qs ? `?${qs}` : ""}`);
  };
  const c = p.current;
  const active = [c.q, c.an, c.stare].filter(Boolean).length;
  const [one, many] = p.noun ?? ["contract", "contracte"];
  return (
    <>
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={p.placeholder ?? "Caută nr. contract, client, CUI, nr. raport… ↵"} aria-label="Caută" />
        {p.years && <FilterSelect label="An" value={c.an ?? ""} options={p.years} onChange={(v) => go({ an: v || undefined })} all="Toți" />}
        {p.states && <FilterSelect label="Stare" value={c.stare ?? ""} options={p.states} onChange={(v) => go({ stare: v || undefined })} all="Oricare" />}
      </form>
      <div className="resultLine">
        <span>
          <b style={{ color: "var(--ink)" }}>{p.total.toLocaleString("ro-RO")}</b> {p.total === 1 ? one : many}
          {active > 0 && <> · <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); router.push(`${p.base}/contracte${c.tip ? `?tip=${c.tip}` : ""}`); }}>✕ Resetează filtrele ({active})</button></>}
        </span>
      </div>
    </>
  );
}
