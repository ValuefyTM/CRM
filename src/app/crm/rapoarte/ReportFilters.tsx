"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

type Facet = [string, string, number?][];
export type ReportQuery = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; bunuri?: string };

/** Search + dropdown filters for the reports list; every change reloads the list (filters live in the URL). */
export function ReportFilters(props: {
  base: string; current: ReportQuery; total: number;
  years: Facet; banks: Facet; issuers: Facet; evaluators: Facet; sorts: Facet;
  /** Status tabs: key, label, count, link. */
  tab: string; tabs: [string, string, number, string][];
}) {
  const router = useRouter();
  const [q, setQ] = useState(props.current.q ?? "");
  const go = (change: Partial<ReportQuery>) => {
    const next = { ...props.current, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    router.push(`${props.base}/rapoarte${qs ? `?${qs}` : ""}`);
  };
  const c = props.current;
  // Status is chosen with the tabs: not counted (nor cleared) here.
  const active = [c.q, c.year, c.bank, c.issuer, c.evaluator, c.bunuri].filter(Boolean).length;

  return (
    <>
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <span className="segment ibStates ordStates" role="group" aria-label="Status raport">
          {props.tabs.map(([k, label, n, href]) => (
            <a key={k || "all"} href={href} aria-current={props.tab === k ? "page" : undefined}>{label} <small>{n.toLocaleString("ro-RO")}</small></a>
          ))}
        </span>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută client, nr. raport, adresă, CF, telefon… ↵" aria-label="Caută" />
      </form>
      <div className="filterBar repTools">
        <FilterSelect label="An" value={c.year ?? ""} options={props.years} onChange={(v) => go({ year: v || undefined })} all="Toți" />
        <FilterSelect label="Bancă" value={c.bank ?? ""} options={props.banks} onChange={(v) => go({ bank: v || undefined })} />
        <FilterSelect label="Evaluator" value={c.evaluator ?? ""} options={props.evaluators} onChange={(v) => go({ evaluator: v || undefined })} all="Toți" />
        {props.issuers.length > 1 && <FilterSelect label="Emis de" value={c.issuer ?? ""} options={props.issuers} onChange={(v) => go({ issuer: v || undefined })} all="Toți" />}
        <label className={`fsel toggle${c.bunuri === "fara" ? " on" : ""}`} data-on={c.bunuri === "fara" ? "" : undefined} title="Rapoartele care nu au niciun bun înregistrat">
          <input type="checkbox" checked={c.bunuri === "fara"} onChange={(e) => go({ bunuri: e.target.checked ? "fara" : undefined })} />
          <span>Fără bun</span>
        </label>
        <span className="resultLine repCount">
          <span>
            <b style={{ color: "var(--ink)" }}>{props.total.toLocaleString("ro-RO")}</b> rapoarte
            {active > 0 && <> · <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); router.push(`${props.base}/rapoarte${c.status ? `?status=${c.status}` : ""}`); }}>✕ Resetează ({active})</button></>}
          </span>
          <FilterSelect label="Ordine" value={c.sort ?? ""} options={props.sorts.filter(([v]) => v)} onChange={(v) => go({ sort: v || undefined })} all="Cele mai noi" />
        </span>
      </div>
    </>
  );
}
