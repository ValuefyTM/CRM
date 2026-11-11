import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { mdEnabled, readings } from "@/lib/report-md";
import { MdControls } from "./MdControls";

export const metadata: Metadata = { title: "Rapoarte ca Markdown | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const n0 = (v: number | null) => (v == null ? "—" : v.toLocaleString("ro-RO"));
const STATUS: Record<string, [string, string]> = { queued: ["În lucru", "pillInfo"], done: ["Gata", "pillOk"], error: ["Eroare", "pillErr"] };

/** The pilot of reading the final reports into Markdown with a cheap model: send, bring in, see the cost and the result. */
export default async function MarkdownPage() {
  const { db, user, base } = await staffPage("settings");
  if (user.role !== "owner") notFound();
  const rows = await readings(db);
  const done = rows.filter((r) => r.status === "done");
  const cost = done.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const avg = done.length ? cost / done.length : null;
  const left = (await db.prepare(`SELECT COUNT(*) AS n FROM reports r WHERE r.status = 'done' AND EXISTS (SELECT 1 FROM report_documents d WHERE d.report_id = r.id AND d.kind = 'final' AND d.status = 'uploaded')
      AND NOT EXISTS (SELECT 1 FROM report_markdown m WHERE m.report_id = r.id AND m.status = 'done')`).first<{ n: number }>())?.n ?? 0;
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări" subtitle="Rapoartele finale citite ca Markdown, pentru căutare și pentru un agent">
      <SettingsTabs base={base} active="markdown" user={user} />
      <section className="card">
        <h2>Pilot: rapoartele finale ca Markdown</h2>
        <p className="hint">Se citesc PDF-urile semnate ale rapoartelor finalizate cu <b>Claude Haiku 5.5</b>, prin lot (preț la jumătate; rezultatul vine în câteva minute până la o oră).
          Din fiecare raport rezultă textul ca Markdown (capitole, tabele, fără antete repetate și fără poze) și datele cheie (valori, abordare, bunuri, comparabile, ipoteze).
          Datele personale sunt scoase: CNP, act de identitate, telefon, e-mail; persoanele fizice apar cu inițiale.</p>
        {!mdEnabled() && <div className="note">Cheia Claude (ANTHROPIC_API_KEY) nu este configurată pe server.</div>}
        <MdControls enabled={mdEnabled()} waiting={rows.filter((r) => r.status === "queued").length} />
      </section>
      <div className="mdKpis">
        <div className="pxTile"><small>Citite</small><b>{done.length}</b><span>din {rows.length} trimise{rows.some((r) => r.status === "error") ? ` · ${rows.filter((r) => r.status === "error").length} cu eroare` : ""}</span></div>
        <div className="pxTile"><small>Cost total</small><b>{usd(cost)}</b><span>prețul lotului, din tokenii raportați</span></div>
        <div className="pxTile"><small>Cost mediu / raport</small><b>{avg != null ? usd(avg) : "—"}</b><span>{avg != null ? `toate cele ${n0(left)} rămase: ~${usd(avg * left)}` : `${n0(left)} rapoarte finalizate rămase`}</span></div>
      </div>
      <section className="card">
        <h2>Rapoarte citite <span className="muted">{rows.length}</span></h2>
        {rows.length === 0 ? <div className="empty">Niciun raport trimis încă.</div> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Raport</th><th>Stare</th><th className="num">Pagini</th><th className="num">Tokeni intrare</th><th className="num">Tokeni ieșire</th><th className="num">Markdown</th><th className="num">Cost</th><th>Trimis</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [l, c] = STATUS[r.status] ?? [r.status, ""];
                  return (
                    <tr key={r.report_id}>
                      <td><b>{r.number ? `nr. ${r.number}` : "—"}</b><div className="muted" style={{ fontSize: 12 }}>{r.label}</div></td>
                      <td><span className={`pill ${c}`}><i />{l}</span>{r.error && <div className="errTxt" style={{ fontSize: 12 }}>{r.error}</div>}</td>
                      <td className="num">{n0(r.pages)}</td><td className="num mono">{n0(r.input_tokens)}</td><td className="num mono">{n0(r.output_tokens)}</td>
                      <td className="num mono">{r.chars ? `${n0(Math.round(r.chars / 1000))}k car.` : "—"}</td>
                      <td className="num mono">{r.cost_usd != null ? usd(r.cost_usd) : "—"}</td>
                      <td className="nowrap">{fmtDate(r.created_at, true)}</td>
                      <td>{r.status === "done" && <a className="link" href={`${base}/setari/markdown/${r.report_id}`}>Vezi →</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
