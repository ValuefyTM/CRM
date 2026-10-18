"use client";

import { useEffect, useState } from "react";
import type { Ctx } from "./InspApp";
import { Icon, TopBar } from "./ui";

const ROLE: Record<string, string> = { inspector: "Inspector", evaluator: "Evaluator", admin: "Administrator", owner: "Proprietar" };

type Row = { id: string; done_at: string | null; report_number: string | null; bank: string | null; client: string | null; type: string | null; address: string };
type Range = "luna" | "trecuta" | "toate";

/** Borderou: the inspections done by the inspector, by month (needs signal; the last one seen is kept). */
function Statement() {
  const [range, setRange] = useState<Range>("luna");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    setRows(null); setErr("");
    fetch(`/api/insp/done?luna=${range}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: Row[] }>) : Promise.reject()))
      .then((d: { rows: Row[] }) => { if (!off) setRows(d.rows); })
      .catch(() => { if (!off) setErr("Lista se încarcă doar cu semnal."); });
    return () => { off = true; };
  }, [range]);
  const now = new Date();
  const month = (k: number) => new Date(now.getFullYear(), now.getMonth() - k, 1).toLocaleDateString("ro-RO", { month: "long" });
  const tabs: [Range, string][] = [["luna", `Luna curentă (${month(0)})`], ["trecuta", `Luna trecută (${month(1)})`], ["toate", "Toate"]];
  return (
    <section className="iBox">
      <div className="iCardHead"><h3>Inspecții efectuate</h3>{rows && <b className="bTotal">{rows.length}</b>}</div>
      <div className="hFilters bTabs" role="group" aria-label="Perioada">
        {tabs.map(([k, l]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
      </div>
      {err && <p className="hint">{err}</p>}
      {!rows && !err && <p className="hint">Se încarcă…</p>}
      {rows && !rows.length && <p className="hint">Nicio inspecție efectuată în perioada aleasă.</p>}
      {rows && rows.length > 0 && (
        <ol className="bList">
          {rows.map((r, n) => (
            <li key={r.id}>
              <span className="bN">{rows.length - n}</span>
              <span className="bMain">
                <b>{r.type ?? "Proprietate"}{r.report_number ? ` · raport ${r.report_number}` : ""}</b>
                <small>{r.address}</small>
                <small>{[r.bank, r.client].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="bDate">{r.done_at ? r.done_at.slice(0, 10).split("-").reverse().join(".") : "—"}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The signed-in inspector: sync, the statement of inspections done, sign out. */
export function AccountView({ ctx }: { ctx: Ctx }) {
  const last = ctx.lastSync ? new Date(ctx.lastSync) : null;
  return (
    <>
      <TopBar title="Contul meu" sub={`${ctx.me.name} · ${ROLE[ctx.me.role] ?? ctx.me.role}`} />
      <div className="iPad">
        <section className="iBox">
          <div className="iKv"><span>Nume</span><b>{ctx.me.name}</b></div>
          <div className="iKv"><span>Email</span><b>{ctx.me.email}</b></div>
          <div className="iKv"><span>Rol</span><b>{ROLE[ctx.me.role] ?? ctx.me.role}</b></div>
        </section>
        <section className="iBox">
          <h3>Sincronizare</h3>
          <div className="iKv"><span>Stare</span><b>{ctx.syncing ? "Se sincronizează…" : ctx.online ? "Online" : "Fără semnal"}</b></div>
          <div className="iKv"><span>Ultima actualizare</span><b>{last ? last.toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</b></div>
          <div className="iKv"><span>De trimis</span><b>{ctx.pending.count}</b></div>
          <button type="button" className="iBtn ghost" onClick={() => ctx.sync()} disabled={ctx.syncing}><Icon.refresh />Sincronizează acum</button>
        </section>
        <Statement />
        {ctx.me.role !== "inspector" && <a className="iBtn ghost" href={ctx.base ? ctx.base.replace(/\/inspectii$/, "") || "/" : "/"} style={{ textDecoration: "none" }}>Deschide CRM-ul</a>}
        <button type="button" className="iBtn ghost danger-text" onClick={() => ctx.logout()}>Ieși din cont</button>
        <p className="hint center">VALUEFY Inspecții</p>
      </div>
    </>
  );
}
