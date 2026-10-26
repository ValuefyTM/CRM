import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { reportAccess } from "@/lib/perms-db";
import { can } from "@/lib/perms";
import { cap } from "@/lib/reports";
import { draftContext, draftingEnabled, factValues, fieldDone, legalValue } from "@/lib/drafting";
import { allFields, SOURCES } from "@/lib/report-templates";
import { DraftField, FactsField, LegalField, MarketParams, TemplatePick, WriteAll } from "./Draft";

export const metadata: Metadata = { title: "Redactare raport | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const ro = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "");
const srcText = (list: string[]) => list.map((s) => SOURCES.find(([k]) => k === s)?.[1] ?? s).join(", ");

/**
 * Report drafting mode: the CRM menu gives way to the report's table of contents (its chapters and fields, as in the
 * bank's application); each chapter shows its fields, written with AI or taken from the CRM, ready to copy one by one,
 * and on the right what they are written from (the inspection sheet, the documents, the market, similar reports).
 */
export default async function DraftingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cap?: string; bun?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const { cap: askedCap, bun } = await searchParams;
  const head = await db.prepare("SELECT id, status, delivered_at FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string; delivered_at: string | null }>();
  if (!head) notFound();
  const acc = await reportAccess(db, user, head);
  if (!acc.view) redirect(`${base}/rapoarte?fara-acces=1`);
  const back = `${base}/rapoarte/${id}`;
  const c = await draftContext(db, user, id, bun);
  if (!c) redirect(back);
  const canEdit = acc.can.edit && !acc.locked;
  const enabled = draftingEnabled();
  const t = c.template, r = c.report, a = c.asset;

  const fields = allFields(t).filter((f) => f.required || c.drafts[f.key]);
  const doneN = fields.filter((f) => fieldDone(f, c)).length;
  const chapters = t.chapters.map((ch) => ({ ...ch, done: ch.fields.filter((f) => fieldDone(f, c)).length }));
  const ch = chapters.find((x) => x.key === askedCap) ?? chapters.find((x) => x.done < x.fields.length) ?? chapters[0];
  const at = chapters.indexOf(ch);
  const [prev, next] = [chapters[at - 1], chapters[at + 1]];
  const q = (k: string) => `${base}/rapoarte/${id}/redactare?cap=${k}${bun ? `&bun=${bun}` : ""}`;
  const mark = (f: (typeof ch.fields)[number]) => {
    if (fieldDone(f, c)) return ["✓", "ok"];
    const d = c.drafts[f.key];
    if (d?.state === "stale") return ["↻", "warn"];
    if (f.kind === "facts") { const v = factValues(f, c).filter((x) => x.value); const k = d ? (JSON.parse(d.text || "[]") as string[]).length : 0; return [`${k}/${v.length}`, ""]; }
    if (d?.missing?.length) return ["!", "err"];
    return d?.text ? ["AI", "warn"] : ["○", ""];
  };
  const todo = enabled && canEdit ? ch.fields.filter((f) => f.kind === "ai" && (!c.drafts[f.key]?.text || c.drafts[f.key]?.state === "stale")).map((f) => ({ key: f.key, label: f.label })) : [];

  // what the right column shows: the sources of this chapter's fields
  const uses = new Set(ch.fields.flatMap((f) => f.sources));
  const sheetRows = c.sheet?.sections.flatMap((s) => s.rows) ?? [];
  const missing = [...new Set(ch.fields.flatMap((f) => (f.kind === "facts" ? factValues(f, c).filter((x) => !x.value).map((x) => x.label) : c.drafts[f.key]?.missing ?? [])))];
  const legal = c.legal?.result;
  const openIssues = legal ? legal.issues.filter((i) => i.level !== "info" && !c.legal!.resolved[i.key]) : [];
  const comps = c.similar.filter((x) => x.value && x.sqm);
  const sqm = comps.map((x) => x.sqm!).sort((x, y) => x - y);
  const lei = (n: number) => n.toLocaleString("ro-RO", { maximumFractionDigits: 0 });

  return (
    <div className="shell drShell">
      <aside className="side drSide">
        <div className="brandRow">
          <a className="brand" href={base || "/"} aria-label="VALUEFY · acasă">
            <img className="brandFull" src="/valuefy-logo-white.png" alt="VALUEFY" width={600} height={123} />
            <span className="brandLabel">Redactare raport</span>
          </a>
        </div>
        <a className="drBack" href={back}>← Înapoi la raport</a>
        <div className="drRep">
          <span className="drRepTop"><b>{r.number ? `Nr. ${r.number}` : "Fără număr"}</b><TemplatePick report={id} asset={a.id} value={t.key} options={c.templates.map((x) => [x.key, x.name])} canEdit={canEdit} /></span>
          <small>{[cap(a.type), a.full_address ?? a.city].filter(Boolean).join(" · ") || "—"}</small>
          {c.assets.length > 1 && (
            <span className="drAssets">{c.assets.map((x, i) => <a key={x.id} href={`${base}/rapoarte/${id}/redactare?cap=${ch.key}&bun=${x.id}`} aria-current={x.id === a.id ? "page" : undefined}>{i + 1}. {cap(x.type) || "Bun"}</a>)}</span>
          )}
          <span className="drBar"><i style={{ width: `${fields.length ? Math.round((doneN / fields.length) * 100) : 0}%` }} /></span>
          <small className="mono">{doneN} din {fields.length} câmpuri copiate</small>
        </div>
        <nav className="sideNav drToc" aria-label="Cuprinsul raportului">
          {chapters.map((x) => (
            <div key={x.key} className={`navGroup${x.key === ch.key ? " open" : ""}`}>
              <a className="navGroupHead" href={q(x.key)} aria-current={x.key === ch.key ? "true" : undefined}><span>{x.title}</span><span className={`navBadge${x.done === x.fields.length ? " drOk" : ""}`}>{x.done === x.fields.length ? "✓" : `${x.done}/${x.fields.length}`}</span></a>
              {x.key === ch.key && (
                <div className="navGroupItems">
                  {x.fields.map((f) => { const [m, k] = mark(f); return <a key={f.key} className="navItem" href={`#${f.key}`}><span className="navLabel">{f.label}</span><span className={`drMark ${k}`}>{m}</span></a>; })}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="me"><div className="meCard"><span className="meText"><b>{user.name || user.email}</b><small>{c.legal ? `analiza juridică din ${ro(c.legal.created_at)}` : "fără analiză juridică"}</small></span></div></div>
      </aside>

      <div className="main">
        <header className="top drTop">
          <div>
            <h1>{ch.title}</h1>
            <p>{t.name} · {ch.fields.length} {ch.fields.length === 1 ? "câmp" : "câmpuri"} · textele se copiază în aplicația băncii, câmp cu câmp</p>
          </div>
          <div className="actions">
            {prev && <a className="btn btnGhost btnSm" href={q(prev.key)}>← {prev.title.split(" · ")[0]}</a>}
            {next && <a className="btn btnGhost btnSm" href={q(next.key)}>{next.title.split(" · ")[0]} →</a>}
            <WriteAll report={id} asset={a.id} fields={todo} />
          </div>
        </header>
        {!enabled && <div className="note" style={{ margin: "16px clamp(16px, 3vw, 32px) 0" }}>Scrierea cu AI nu este configurată (ANTHROPIC_API_KEY). Câmpurile din CRM și din actele citite se pot copia; textele se scriu manual.</div>}
        {acc.locked && <div className="note" style={{ margin: "16px clamp(16px, 3vw, 32px) 0" }}>Raportul este finalizat: textele se pot doar citi și copia.</div>}
        <main className="content drContent">
          <div className="drCol">
            {ch.fields.map((f) => {
              const d = c.drafts[f.key] ?? null;
              if (f.kind === "facts") return <FactsField key={f.key} report={id} asset={a.id} field={f.key} label={f.label} brd={f.brd} values={factValues(f, c)} copied={d && d.text.startsWith("[") ? JSON.parse(d.text) as string[] : []} canEdit={canEdit} />;
              if (f.kind === "legal") return <LegalField key={f.key} report={id} asset={a.id} field={f.key} label={f.label} brd={f.brd} text={legalValue(f, c)} copied={d?.state === "copied"} docsHref={`${back}?tab=documente`} canEdit={canEdit} />;
              if (f.kind === "market") return <MarketParams key={f.key} report={id} asset={a.id} field={f.key} initial={c.market} confirmed={d?.state === "copied"} enabled={enabled} canEdit={canEdit} />;
              return <DraftField key={`${f.key}:${d?.updated_at ?? ""}`} report={id} asset={a.id} field={f.key} label={f.label} brd={f.brd} limit={f.limit} sources={srcText(f.sources)} draft={d} enabled={enabled} canEdit={canEdit} />;
            })}
          </div>

          <div className="drSideCol">
            {uses.has("inspectie") && (
              <section className="card drSrc">
                <h2>Din fișa de inspecție</h2>
                {!c.sheet ? <p className="hint">Inspecția bunului nu e finalizată: textele vor avea goluri „[de completat]”.</p> : (
                  <>
                    <p className="hint">{[c.sheet.inspection.inspector, ro(c.sheet.inspection.done_at), `${sheetRows.length} răspunsuri`, c.sheet.rooms.length ? `${c.sheet.rooms.length} încăperi` : ""].filter(Boolean).join(" · ")}</p>
                    <dl className="kv">{sheetRows.slice(0, 8).map((x) => <div key={x.label}><dt>{x.label}</dt><dd>{x.value.length > 40 ? `${x.value.slice(0, 40)}…` : x.value}</dd></div>)}</dl>
                    <a className="link" href={`${back}/fisa/${a.id}`}>Deschide fișa →</a>
                  </>
                )}
              </section>
            )}
            {missing.length > 0 && (
              <section className="card drSrc drWarnCard err">
                <h2>Lipsă</h2>
                <p>{missing.join(", ")}.</p>
                <p className="hint">Completează în fișă sau direct în text, unde AI-ul a lăsat „[de completat]”.</p>
              </section>
            )}
            {uses.has("acte") && (
              <section className="card drSrc drWarnCard">
                <h2>Din analiza juridică</h2>
                {!legal ? <p>Nerulată pentru acest bun. <a className="link" href={`${back}?tab=documente`}>Acte & livrare →</a></p> : (
                  <>
                    <p>{legal.owners.length ? `Proprietari: ${legal.owners.map((o) => `${o.name}${o.share ? ` (${o.share})` : ""}`).join(", ")}. ` : ""}{legal.encumbrances.length ? `${legal.encumbrances.length} sarcini active.` : "Fără sarcini în acte."}</p>
                    {openIssues.length > 0 && <p><b>{openIssues.length} {openIssues.length === 1 ? "problemă deschisă" : "probleme deschise"}:</b> {openIssues.slice(0, 3).map((i) => i.title).join("; ")}{openIssues.length > 3 ? "…" : ""}</p>}
                  </>
                )}
              </section>
            )}
            {(uses.has("comparabile") || uses.has("piata")) && (
              <section className="card drSrc">
                <h2>Evaluări din zonă <span className="muted">{comps.length} în 2 km</span></h2>
                {!comps.length ? <p className="hint">Firma nu are evaluări similare în zonă (sau bunul nu are coordonate).</p> : (
                  <>
                    <span className="drRange"><span><small>Minim</small><b className="mono">{lei(sqm[0])} lei/mp</b></span><span><small>Median</small><b className="mono">{lei(sqm[Math.floor(sqm.length / 2)])}</b></span><span><small>Maxim</small><b className="mono">{lei(sqm[sqm.length - 1])}</b></span></span>
                    <ul className="drSim">{comps.slice(0, 4).map((x) => <li key={x.report_id}><a className="link" href={`${base}/rapoarte/${x.report_id}`}>{x.number ? `Nr. ${x.number}` : "Raport"}</a><span className="muted">{x.km.toLocaleString("ro-RO")} km · {ro(x.date)}</span><b className="mono">{x.score}%</b></li>)}</ul>
                    <p className="hint">Valori din rapoartele firmei, nu oferte de piață. AI-ul preia din rapoartele similare doar stilul textelor copiate.</p>
                  </>
                )}
              </section>
            )}
            <section className="card drSrc">
              <h2>Instrucțiunile machetei</h2>
              <ul className="drRules">{ch.fields.filter((f) => f.prompt).map((f) => <li key={f.key}><b>{f.label}.</b> {f.prompt}</li>)}</ul>
              {can(user, "templates.E") && <a className="link" href={`${base}/setari/machete?m=${t.key}`}>Modifică macheta →</a>}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
