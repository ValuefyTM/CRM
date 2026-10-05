"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

type Facet = [string, string, number?][];
export type ReportQuery = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string };

/** Search + dropdown filters for the reports list; every change reloads the list (filters live in the URL). */
export function ReportFilters(props: {
  base: string; current: ReportQuery; total: number;
  years: Facet; statuses: Facet; banks: Facet; issuers: Facet; evaluators: Facet; sorts: Facet;
}) {
  const router = useRouter();
  const [q, setQ] = useState(props.current.q ?? "");
  const go = (change: Partial<ReportQuery>) => {
    const next = { ...props.current, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    router.push(`${props.base}/rapoarte${qs ? `?${qs}` : ""}`);
  };
  const c = props.current;
  const active = [c.q, c.status, c.year, c.bank, c.issuer, c.evaluator].filter(Boolean).length;

  return (
    <>
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută client, nr. raport, adresă, CF, telefon… ↵" aria-label="Caută" />
        <FilterSelect label="An" value={c.year ?? ""} options={props.years} onChange={(v) => go({ year: v || undefined })} all="Toți" />
        <FilterSelect label="Status" value={c.status ?? ""} options={props.statuses} onChange={(v) => go({ status: v || undefined })} />
        <FilterSelect label="Bancă" value={c.bank ?? ""} options={props.banks} onChange={(v) => go({ bank: v || undefined })} />
        <FilterSelect label="Evaluator" value={c.evaluator ?? ""} options={props.evaluators} onChange={(v) => go({ evaluator: v || undefined })} all="Toți" />
        {props.issuers.length > 1 && <FilterSelect label="Emitent" value={c.issuer ?? ""} options={props.issuers} onChange={(v) => go({ issuer: v || undefined })} all="Toți" />}
      </form>
      <div className="resultLine">
        <span>
          <b style={{ color: "var(--ink)" }}>{props.total.toLocaleString("ro-RO")}</b> rapoarte
          {active > 0 && <> · <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); router.push(`${props.base}/rapoarte`); }}>✕ Resetează filtrele ({active})</button></>}
        </span>
        <FilterSelect label="Ordine" value={c.sort ?? ""} options={props.sorts.filter(([v]) => v)} onChange={(v) => go({ sort: v || undefined })} all="Cele mai noi" />
      </div>
    </>
  );
}
