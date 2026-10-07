"use client";

import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { STATUS_LABEL } from "@/lib/labels";
import { PartnersTable, type FirmRow } from "./firme/PartnersTable";

export type Tab = "interni" | "colaboratori" | "clienti";
type Row = {
  id: string; kind: string; name: string; email: string; phone: string | null; role: string; roleLabel: string; duties: string[]; status: string;
  partnerId: string | null; partnerName: string | null; engagement: string | null; anevar: string | null; specs: string | null;
  company: string | null; clientType: string; city: string | null; lastLogin: string; isMe: boolean;
};

const TABS: [Tab, string, string][] = [
  ["interni", "Interni", "internal"],
  ["colaboratori", "Colaboratori", "partner"],
  ["clienti", "Clienți", "client"],
];

const FILTERS: Record<Tab, [string, string, (r: Row) => boolean][]> = {
  interni: [
    ["all", "Toți", () => true],
    ["evaluator", "Evaluatori", (r) => r.duties.includes("evaluator") && r.status !== "disabled"],
    ["inspector", "Inspectori", (r) => r.duties.includes("inspector") && r.status !== "disabled"],
    ["admin", "Administrare", (r) => (r.role === "owner" || r.role === "admin") && r.status !== "disabled"],
    ["operator", "Operatori", (r) => r.role === "operator" && r.status !== "disabled"],
    ["contractor", "Colaboratori externi", (r) => r.engagement === "contractor" && r.status !== "disabled"],
    ["disabled", "Dezactivați", (r) => r.status === "disabled"],
  ],
  colaboratori: [
    ["all", "Toți", () => true],
    ["active", "Activi", (r) => r.status === "active"],
    ["invited", "Invitați", (r) => r.status === "invited"],
    ["disabled", "Dezactivați", (r) => r.status === "disabled"],
  ],
  clienti: [
    ["all", "Toți", () => true],
    ["active", "Activi", (r) => r.status === "active"],
    ["invited", "Invitați", (r) => r.status === "invited"],
    ["disabled", "Dezactivați", (r) => r.status === "disabled"],
  ],
};

const ADD: Record<Tab, [string, string]> = {
  interni: ["intern", "+ Utilizator intern"],
  colaboratori: ["colaborator", "+ Persoană colaborator"],
  clienti: ["client", "+ Client"],
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Status({ s }: { s: string }) {
  const [label, cls] = STATUS_LABEL[s] ?? [s, ""];
  return <span className={`pill ${cls}`}><i />{label}</span>;
}

/** The three account tabs; the "Colaboratori" tab switches between people and partner firms. */
export function UsersBrowser(props: { rows: Row[]; firms: FirmRow[]; base: string; initialTab: Tab; initialView: "people" | "firms"; canAddInternal: boolean }) {
  const { rows, firms, base } = props;
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [view, setView] = useState(props.initialView);
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");

  const kindOf = (t: Tab) => TABS.find(([k]) => k === t)![2];
  const inTab = useMemo(() => rows.filter((r) => r.kind === kindOf(tab)), [rows, tab]);
  const filters = FILTERS[tab];
  const shown = useMemo(() => {
    const test = filters.find(([k]) => k === f)?.[2] ?? (() => true);
    const t = fold(q.trim());
    return inTab.filter((r) => test(r) && (!t || fold([r.name, r.email, r.phone, r.partnerName, r.company, r.city, r.anevar, r.roleLabel].filter(Boolean).join(" ")).includes(t)));
  }, [inTab, filters, f, q]);

  const go = (t: Tab, v: "people" | "firms" = "people") => {
    setTab(t); setView(v); setF("all");
    history.replaceState(null, "", `?tab=${t}${v === "firms" ? "&vezi=firme" : ""}`);
  };

  const canAdd = tab !== "interni" || props.canAddInternal;
  const addBtn = canAdd && (
    <a href={`${base}/utilizatori/nou?tip=${ADD[tab][0]}`} className="btn btnGold">{ADD[tab][1]}</a>
  );
  const peopleOrFirms = tab === "colaboratori" && (
    <div className="segment" role="group" aria-label="Afișează" style={{ minWidth: 220 }}>
      <button type="button" aria-pressed={view === "people"} onClick={() => go("colaboratori", "people")}>Persoane <small>{inTab.length}</small></button>
      <button type="button" aria-pressed={view === "firms"} onClick={() => go("colaboratori", "firms")}>Firme <small>{firms.length}</small></button>
    </div>
  );

  return (
    <>
      <nav className="tabs" aria-label="Tip utilizatori">
        {TABS.map(([t, label, kind]) => (
          <a key={t} href={`?tab=${t}`} aria-current={tab === t ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(t); }}>
            {label} <small>{rows.filter((r) => r.kind === kind).length}</small>
          </a>
        ))}
      </nav>

      {tab === "colaboratori" && view === "firms" ? (
        <PartnersTable
          rows={firms}
          base={base}
          head={<>{peopleOrFirms}<a href={`${base}/utilizatori/firme/nou`} className="btn btnGold">+ Firmă parteneră</a></>}
        />
      ) : (
        <section className="card">
          <div className="filterBar">
            <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nume, email, telefon, firmă…" aria-label="Caută" />
            <FilterSelect label="Arată" value={f === "all" ? "" : f} onChange={(v) => setF(v || "all")} options={filters.filter(([k]) => k !== "all").map(([k, l, t]) => [k, l, inTab.filter(t).length])} all="Toți" />
            {peopleOrFirms}
            {addBtn}
          </div>
          <div className="resultLine"><span><b style={{ color: "var(--ink)" }}>{shown.length}</b> din {inTab.length}</span></div>
          {shown.length === 0 ? (
            <div className="empty">{inTab.length ? "Niciun utilizator pentru filtrele alese." : EMPTY[tab]}</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nume</th>
                    {tab === "interni" && <><th>Rol</th><th>Relație</th><th>ANEVAR</th></>}
                    {tab === "colaboratori" && <><th>Firmă</th><th>Rol în cont</th><th>Telefon</th></>}
                    {tab === "clienti" && <><th>Tip</th><th>Telefon</th><th>Localitate</th></>}
                    <th>Ultima autentificare</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <a className="rowLink" href={`${base}/utilizatori/${r.id}`}>{r.name}</a>
                        {r.isMe && <span className="muted"> (tu)</span>}
                        <div className="muted">{r.email}</div>
                      </td>
                      {tab === "interni" && (
                        <>
                          <td><span className={`pill ${r.duties.includes("evaluator") ? "pillInfo" : ""}`}>{r.roleLabel}</span></td>
                          <td>{r.engagement === "contractor" ? "Extern" : "Intern"}</td>
                          <td>{r.duties.includes("evaluator") ? <>{r.anevar ? <span className="mono">{r.anevar}</span> : <span className="muted">—</span>}{r.specs && <div className="muted">{r.specs.replace(/,/g, " · ")}</div>}</> : <span className="muted">—</span>}</td>
                        </>
                      )}
                      {tab === "colaboratori" && (
                        <>
                          <td>{r.partnerId ? <a className="rowLink" href={`${base}/utilizatori/firme/${r.partnerId}`}>{r.partnerName}</a> : "—"}</td>
                          <td>{r.roleLabel}</td>
                          <td>{r.phone || <span className="muted">—</span>}</td>
                        </>
                      )}
                      {tab === "clienti" && (
                        <>
                          <td>{r.clientType}{r.company && <div className="muted">{r.company}</div>}</td>
                          <td>{r.phone || <span className="muted">—</span>}</td>
                          <td>{r.city || <span className="muted">—</span>}</td>
                        </>
                      )}
                      <td className="muted">{r.lastLogin}</td>
                      <td><Status s={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

const EMPTY: Record<Tab, string> = {
  interni: "Nu există încă utilizatori interni.",
  colaboratori: "Nicio persoană de la colaboratori încă. Adaugă întâi firma parteneră, apoi persoanele ei.",
  clienti: "Niciun client cu cont încă. Adaugă un client ca să primească acces în Portalul client.",
};
