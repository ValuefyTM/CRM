"use client";
// Tab „Amplasament” of an asset: the site analysis. First the source of the parcel contour (the cadastral plans,
// a document with coordinates, or only the zone), then the steps (contour → zone → maps → text), then the result:
// the two figures, the parcel, the zone, the "Descrierea amplasamentului" text in three variants, and what the
// valuer completes. Everything is saved on the asset; the text goes to the report's drafting, the maps to the photo annex.
import { useMemo, useState } from "react";
import { dist, fmt, inCity, STYLES, surfaceRo, type LL, type Site, type Style } from "@/lib/site-shared";
import { catCounts, CORS, figurePngs, fmtD, siteDocx, sitePdf } from "@/lib/site-export";

/** "**Localizare.** Proprietatea…" → runs. */
const runsOf = (text: string) => text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) => (t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));
import { SitePlan, ZoneMap } from "./SiteFigures";

type Doc = { ref: string; name: string; kind: string };
type Src = "ancpi" | "doc" | "zone";
type Step = { key: string; label: string; detail: string; state: "wait" | "run" | "ok" | "skip" | "err" };

const KIND: Record<string, string> = { cf: "Extras CF", amplasament: "Plan de amplasament", rlv: "Releveu" };
const fmtAt = (s: string | null) => (s ? new Date(s).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as { site?: Site; error?: string; numbers?: number };
  if (!r.ok) throw new Error(d.error ?? `Eroare ${r.status}`);
  return d;
}
const save = (blob: Blob, name: string) => {
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
};

/** The text: paragraphs, **bold**, [brackets] to complete, numbers not found in the data marked. */
function Prose({ text, bad }: { text: string; bad: string[] }) {
  const re = bad.length ? new RegExp(`(\\[[^\\]]+\\]|(?<![\\d.,])(?:${bad.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\d]))`) : /(\[[^\]]+\])/;
  const part = (t: string, k: string) => t.split(re).filter(Boolean).map((x, i) =>
    x.startsWith("[") ? <mark key={k + i} className="amFill">{x}</mark> : bad.includes(x) ? <mark key={k + i} className="amBad" title="Cifra nu apare în datele analizei">{x}</mark> : x);
  return (
    <div className="amProse">
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>{runsOf(para.trim()).map((r, j) => (r.bold ? <b key={j}>{part(r.text, `${i}.${j}.`)}</b> : <span key={j}>{part(r.text, `${i}.${j}.`)}</span>))}</p>
      ))}
    </div>
  );
}

export function SiteAnalysis(props: {
  report: string; asset: string; initial: Site | null; docs: Doc[]; nr: string | null; ll: LL | null; city: string | null; address: string | null;
  title: string; brand: { company: string; subtitle: string; evaluator: string }; edit: boolean; ai: boolean; locator: boolean; draftHref: string | null; annexHref: string;
}) {
  const { report, asset, docs, nr, ll, edit, ai } = props;
  const url = `/api/crm/reports/${report}/site`;
  const [site, setSite] = useState<Site | null>(props.initial);
  const [choosing, setChoosing] = useState(!props.initial);
  const canAncpi = props.locator && (!!nr || !!ll);
  const [src, setSrc] = useState<Src>(props.initial?.source === "doc" ? "doc" : props.initial?.source === "zone" ? "zone" : canAncpi ? "ancpi" : docs.length ? "doc" : "zone");
  const [doc, setDoc] = useState(props.initial?.doc_ref ?? docs[0]?.ref ?? "");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [base, setBase] = useState<"harta" | "satelit">("harta");
  const [editing, setEditing] = useState<string | null>(null);

  const setStep = (key: string, state: Step["state"], detail?: string) => setSteps((s) => s && s.map((x) => (x.key === key ? { ...x, state, detail: detail ?? x.detail } : x)));

  async function run() {
    setError(null); setNote(null);
    const docName = docs.find((d) => d.ref === doc)?.name ?? "actul ales";
    setSteps([
      { key: "parcel", label: "Conturul parcelei", detail: src === "ancpi" ? `planurile cadastrale${nr ? `, nr. ${nr}` : ""}` : src === "doc" ? `AI citește coordonatele din ${docName}` : "fără contur: doar zona", state: src === "zone" ? "skip" : "wait" },
      { key: "zone", label: "Zona și geometria", detail: "dotări, drumuri și factori negativi din OpenStreetMap; forma, deschiderea, adâncimea", state: "wait" },
      { key: "maps", label: "Hărțile", detail: "harta zonei și planul de situație", state: "wait" },
      { key: "text", label: "Textul", detail: ai ? "descrierea amplasamentului, cu cifrele verificate" : "generarea cu AI nu este configurată", state: ai ? "wait" : "skip" },
    ]);
    setChoosing(false);
    let cur: Site | null = null;
    try {
      setStep("parcel", src === "zone" ? "skip" : "run");
      cur = (await call(url, "POST", { asset, step: "parcel", source: src, doc })).site ?? null;
      if (src !== "zone") setStep("parcel", "ok", cur?.parcel ? `${cur.parcel.source === "ancpi" ? `planul ANCPI ${cur.parcel.uat ?? ""}` : cur.parcel.doc_name}${cur.parcel.nr ? `, nr. ${cur.parcel.nr}` : ""}, ${cur.parcel.pts.length} puncte` : "");
      setStep("zone", "run");
      cur = (await call(url, "POST", { asset, step: "zone" })).site ?? cur;
      const z = cur?.zone;
      setStep("zone", "ok", z ? `${catCounts(z).length} dotări, ${z.roads.length} străzi aproape${z.neg.length ? `, ${z.neg.length} factori negativi` : ""}${cur?.parcel?.geo?.frontage ? `; front ${fmt(cur.parcel.geo.frontage.length, 1)} m` : ""}` : "");
      setStep("maps", "ok");
      setSite(cur);
      if (ai) {
        setStep("text", "run");
        cur = (await call(url, "POST", { asset, step: "text", style: "detaliat" })).site ?? cur;
        setStep("text", "ok");
      }
      setSite(cur);
      setSteps(null);
    } catch (e) {
      setError((e as Error).message);
      setSteps((s) => s && s.map((x) => (x.state === "run" ? { ...x, state: "err" } : x)));
      if (cur) setSite(cur);
    }
  }

  async function text(style: Style, withPrompt = false) {
    setBusy(`text:${style}`); setError(null);
    try { setSite((await call(url, "POST", { asset, step: "text", style, prompt: withPrompt ? prompt : null })).site ?? site); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  async function patch(body: Record<string, unknown>, what: string, done?: string) {
    setBusy(what); setError(null);
    try { const d = await call(url, "PATCH", { asset, ...body }); setSite(d.site ?? site); if (done) setNote(done); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(null); }
  }
  async function toAnnex() {
    setBusy("annex"); setError(null);
    try {
      const f = site ? await figurePngs(site, base) : [];
      if (!f.length) throw new Error(CORS);
      const fd = new FormData();
      fd.set("asset", asset);
      for (const x of f) fd.set(x.name, new File([x.blob], `${x.name}.png`, { type: "image/png" }));
      setSite((await call(url, "POST", fd)).site ?? site);
      setNote("Hărțile sunt în Anexa foto, în grupul „Amplasament”.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const s = site, p = s?.parcel ?? null, g = p?.geo ?? null, z = s?.zone ?? null;
  const pois = useMemo(() => (z ? catCounts(z).map((c) => ({ cat: c.key, label: c.label, name: c.near.name, d: c.near.d, count: c.count })) : []), [z]);
  const street = z?.roads.find((r) => r.name && r.d <= 40);
  const area = p ? p.area_plan ?? p.area_calc : null;
  const diff = p && p.area_plan && p.area_calc ? (Math.abs(p.area_plan - p.area_calc) / p.area_plan) * 100 : null;

  async function download(kind: "pdf" | "docx") {
    if (!s) return;
    setBusy(kind); setError(null);
    try {
      const meta = { ...props.brand, title: props.title };
      const blob = kind === "pdf" ? await sitePdf(s, meta, base) : await siteDocx(s, meta, base);
      const id = s.parcel?.nr ? `${s.parcel.nr}_${(s.parcel.uat ?? "plan").toLowerCase().replace(/\s+/g, "-")}` : "adresa";
      save(blob, `analiza_amplasament_${id}_${new Date().toISOString().slice(0, 10)}.${kind}`.replace(/[\\/:*?"<>|]+/g, "_"));
    } catch (e) { setError((e as Error).message || "Exportul nu a reușit."); }
    finally { setBusy(null); }
  }

  // ---------- choosing the source ----------
  if (choosing || !s) {
    if (steps) return <Running steps={steps} title={props.title} error={error} onBack={() => { setSteps(null); setChoosing(true); }} />;
    return (
      <section className="card amChoose">
        <div>
          <span className="amEyebrow">ANALIZA AMPLASAMENTULUI</span>
          <h2>De unde iau conturul parcelei?</h2>
          <p className="hint">Analiza zonei (dotări, drumuri, factori negativi) se face oricum, după locul bunului pe hartă; pentru datele parcelei (formă, deschidere, vecini, POT) e nevoie de contur.</p>
        </div>
        {error && <p className="amErr" role="alert">{error}</p>}
        <div className="amSrc" role="radiogroup" aria-label="Sursa conturului">
          <label className={src === "ancpi" ? "on" : ""} aria-disabled={!canAncpi}>
            <span><input type="radio" name="amsrc" checked={src === "ancpi"} disabled={!canAncpi} onChange={() => setSrc("ancpi")} /><b>Planul cadastral ANCPI</b></span>
            <small>{!props.locator ? "Legătura cu planurile nu este configurată." : nr ? `Caut nr. ${nr}${props.city ? ` în ${props.city}` : ""} în planurile din UVALO.` : ll ? "Caut parcela de sub punctul bunului." : "Bunul nu are număr cadastral sau coordonate."}</small>
            {canAncpi && <em>Recomandat</em>}
          </label>
          <label className={src === "doc" ? "on" : ""} aria-disabled={!docs.length || !ai}>
            <span><input type="radio" name="amsrc" checked={src === "doc"} disabled={!docs.length || !ai} onChange={() => setSrc("doc")} /><b>Un act cu coordonate</b></span>
            {docs.length ? (
              <select className="select" value={doc} onChange={(e) => { setDoc(e.target.value); setSrc("doc"); }} disabled={!ai}>
                {docs.map((d) => <option key={d.ref} value={d.ref}>{KIND[d.kind] ?? "Act"} · {d.name}</option>)}
              </select>
            ) : <small>Niciun extras CF sau plan de amplasament la acte. Încarcă-l în tabul Acte.</small>}
            <small>AI citește inventarul de coordonate (Stereo 70; în CF, tabelul „Lungime segmente”) și reface conturul.</small>
          </label>
          <label className={src === "zone" ? "on" : ""} aria-disabled={!ll}>
            <span><input type="radio" name="amsrc" checked={src === "zone"} disabled={!ll} onChange={() => setSrc("zone")} /><b>Doar analiza zonei</b></span>
            <small>{ll ? `Dotări, drumuri, factori negativi și textul, după locul bunului${props.address ? ` (${props.address})` : ""}. Datele parcelei le completezi tu.` : "Bunul nu are coordonate."}</small>
          </label>
        </div>
        <div className="amFoot">
          <span className="hint">{ll ? <>Locul pe hartă: <b>coordonatele bunului</b> ({ll[0].toFixed(4)} N · {ll[1].toFixed(4)} E){src !== "zone" ? "; cu contur, zona se măsoară de la centrul parcelei" : ""}.</> : "Bunul nu are coordonate: zona se măsoară de la centrul parcelei."}</span>
          <span className="amBtns">
            {s && <button type="button" className="btn btnGhost" onClick={() => setChoosing(false)}>Renunță</button>}
            <button type="button" className="btn btnGold" disabled={!edit || (src === "ancpi" && !canAncpi) || (src === "doc" && (!docs.length || !ai)) || (src === "zone" && !ll)} onClick={run}>Fă analiza →</button>
          </span>
        </div>
        {!edit && <p className="hint">Doar echipa raportului cu drept de editare poate face analiza.</p>}
      </section>
    );
  }

  // ---------- the result ----------
  const madeFrom = p ? (p.source === "ancpi" ? `planul ANCPI ${p.uat ?? ""}${p.plan_date ? ` (${p.plan_date})` : ""}` : p.doc_name ?? "act") : "fără contur";
  return (
    <>
      {steps && <Running steps={steps} title={props.title} error={error} onBack={() => setSteps(null)} />}
      <section className="card amBar">
        <div>
          <span className="amSaved">✓ Analiză salvată</span>
          <span className="hint">{fmtAt(s.made_at)}{s.made_by ? ` · ${s.made_by}` : ""} · Contur: {madeFrom}</span>
        </div>
        <div className="amBtns">
          {edit && <button type="button" className="btn btnGhost btnSm" onClick={() => { setError(null); setChoosing(true); }}>↻ Refă analiza</button>}
          {edit && z && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={toAnnex}>{busy === "annex" ? "Salvez hărțile…" : s.in_annex ? "Actualizează hărțile din Anexa foto" : "Adaugă hărțile în Anexa foto"}</button>}
          <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => download("docx")}>{busy === "docx" ? "Pregătesc…" : "Descarcă Word"}</button>
          <button type="button" className="btn btnNavy btnSm" disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" ? "Pregătesc…" : "Descarcă PDF"}</button>
        </div>
      </section>
      {error && <p className="amErr" role="alert">{error}</p>}
      {note && <p className="note" role="status">{note}{note.includes("Anexa") && <> <a className="link" href={props.annexHref}>Deschide anexa →</a></>}{note.includes("redactare") && props.draftHref && <> <a className="link" href={props.draftHref ?? undefined}>Deschide redactarea →</a></>}</p>}

      <div className="amGrid">
        <div className="amCol">
          {z && (
            <section className="card">
              <div className="cardHead"><h2>Hărți</h2>
                <div className="segment amSeg" role="group" aria-label="Fundalul hărții">
                  <button type="button" aria-pressed={base === "harta"} onClick={() => setBase("harta")}>Hartă</button>
                  <button type="button" aria-pressed={base === "satelit"} onClick={() => setBase("satelit")}>Satelit</button>
                </div>
              </div>
              <div className={`amFigs${p ? "" : " one"}`}>
                <figure><div className="amFig"><ZoneMap zone={z} parcel={p} base={base} /></div><figcaption><b>Fig. 1</b> — Încadrarea în zonă (rază 1 km; numerele = dotările din listă)</figcaption></figure>
                {p && <figure><div className="amFig"><SitePlan parcel={p} zone={z} /></div><figcaption><b>Fig. 2</b> — Plan de situație</figcaption></figure>}
              </div>
            </section>
          )}

          {p && (
            <section className="card">
              <h2>Parcela</h2>
              <div className="amFacts">
                <div><small>Suprafață din plan</small><b>{fmt(area)} mp</b><em className={diff != null && diff > 2 ? "warn" : ""}>{p.area_acte ? `în acte ${fmt(p.area_acte)} mp` : diff != null ? `${diff > 2 ? "!" : "✓"} din coordonate ${fmt(p.area_calc)} mp (${fmt(diff, 1)}%)` : "calculată din coordonate"}</em></div>
                <div><small>Deschidere la stradă</small><b>{g?.frontage ? `${fmt(g.frontage.length, 1)} m` : "—"}</b><em>{g?.frontage ? `${g.frontage.street ? `la ${g.frontage.street}, ` : ""}${g.frontage.sides.length === 1 ? "latura" : "laturile"} ${g.frontage.sides.map((i) => `${p.pts[i]?.pct}–${p.pts[(i + 1) % p.pts.length]?.pct}`).join(", ")}` : z ? "nicio latură liberă lângă o stradă din OSM" : "fără analiza zonei"}</em></div>
                <div><small>Adâncime</small><b>{g?.depth ? `${fmt(g.depth, 1)} m` : "—"}</b><em>{g?.depth && g.frontage ? `raport front / adâncime 1 : ${fmt(g.depth / g.frontage.length, 1)}` : ""}</em></div>
                <div><small>Formă</small><b>{g?.shape ?? "—"}</b><em>{g ? `regularitate ${Math.round(g.regularity * 100)}% · ${g.vertices} colțuri` : ""}</em></div>
                <div><small>Construcții · POT</small><b>{p.buildings.length ? `${p.buildings.map((b) => `${b.name} ${fmt(b.area)} mp`).join(", ")}` : "fără construcții"}{g?.pot ? ` · POT ${fmt(g.pot, 1)}%` : ""}</b><em>din {p.source === "ancpi" ? "planul ANCPI" : "act"}</em></div>
                <div><small>Vecini înscriși</small><b>{p.neighbours.length ? `${p.neighbours.length} · ${p.neighbours.slice(0, 4).map((n) => n.nr).join(", ")}${p.neighbours.length > 4 ? "…" : ""}` : "—"}</b><em>{g?.orientation ? `front spre ${g.orientation}` : ""}</em></div>
              </div>
              {p.notes.length > 0 && <p className="hint">{p.notes.join(" ")}</p>}
            </section>
          )}

          {z && (
            <section className="card">
              <h2>Zona</h2>
              <div className="amZone">
                <div>
                  <span className="amEyebrow">DOTĂRI ÎN 1,5 KM</span>
                  {pois.length ? pois.map((x, i) => <div key={x.cat} className="amRow"><span><b className="amNum">{i + 1}</b>{x.name ? <>{x.name} <small>· {x.label.toLowerCase()}</small></> : x.label}</span><span className="mono">{fmtD(x.d)} · {x.count} în 1 km</span></div>)
                    : <p className="hint">Nicio dotare găsită în OpenStreetMap în 1,5 km.</p>}
                </div>
                <div>
                  <span className="amEyebrow">ACCES</span>
                  {street ? <div className="amRow"><span>{street.name} · {street.kind}{street.surface ? `, ${surfaceRo(street.surface)}` : ""}</span><span className="mono">{street.d < 15 ? "la front" : dist(street.d)}</span></div> : <p className="hint">Nicio stradă cu nume în OSM la parcelă.</p>}
                  {z.main.map((m) => <div key={m.label} className="amRow"><span>{m.label}</span><span className="mono">{dist(m.d)}</span></div>)}
                  {z.city && (inCity(z) ? <div className="amRow"><span>În {z.city.name}, centrul la</span><span className="mono">{dist(z.city.d)}</span></div>
                    : <div className="amRow"><span>{z.city.name}{z.locality && z.locality.name !== z.city.name ? ` (localitatea: ${z.locality.name})` : ""}</span><span className="mono">{dist(z.city.d)}</span></div>)}
                  <span className="amEyebrow">FACTORI NEGATIVI</span>
                  {z.neg.length ? z.neg.map((n) => <div key={n.key} className="amRow neg"><span>{n.label}</span><span className="mono">{dist(n.d)}</span></div>)
                    : <p className="hint">Fără linie electrică, cale ferată, zonă industrială, cimitir, stație de epurare sau depozit de deșeuri în raza analizată.</p>}
                </div>
              </div>
              <small className="hint">Din OpenStreetMap ({z.date}), în linie dreaptă de la {p ? "centrul parcelei" : "punctul bunului"}.</small>
            </section>
          )}

          <section className="card">
            <div className="cardHead"><h2>Descrierea amplasamentului</h2>
              {ai && <div className="segment amSeg" role="group" aria-label="Varianta textului">
                {STYLES.map(([k, l]) => <button key={k} type="button" aria-pressed={s.style === k} disabled={!edit || !!busy} onClick={() => text(k)}>{busy === `text:${k}` ? "…" : l}</button>)}
              </div>}
            </div>
            {editing != null ? (
              <>
                <textarea className="textarea amEdit" value={editing} onChange={(e) => setEditing(e.target.value)} rows={14} aria-label="Textul descrierii" />
                <div className="amBtns"><button type="button" className="btn btnGhost btnSm" onClick={() => setEditing(null)}>Renunță</button>
                  <button type="button" className="btn btnNavy btnSm" disabled={!!busy} onClick={async () => { if (await patch({ text: editing }, "edit")) setEditing(null); }}>Salvează textul</button></div>
              </>
            ) : s.text ? <Prose text={s.text} bad={s.unverified} /> : <p className="hint">{ai ? (busy ? "Scriu textul…" : "Textul nu a fost scris încă. Alege o variantă.") : "Generarea textului cu AI nu este configurată."}</p>}
            {s.text && editing == null && (
              <div className="amTextFoot">
                <span className={s.unverified.length ? "amCheck bad" : "amCheck"}>{s.unverified.length ? `! ${s.unverified.length === 1 ? "O cifră nu apare" : `${s.unverified.length} cifre nu apar`} în datele analizei: ${s.unverified.join(", ")}` : "✓ Toate cifrele din text se potrivesc cu datele"}</span>
                <div className="amBtns">
                  {edit && <button type="button" className="btn btnGhost btnSm" onClick={() => setEditing(s.text ?? "")}>Editează</button>}
                  <button type="button" className="btn btnGhost btnSm" onClick={async () => { await navigator.clipboard.writeText((s.text ?? "").replace(/\*\*/g, "")).catch(() => {}); setNote("Textul e copiat."); }}>Copiază</button>
                  {edit && <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={() => patch({ send: true }, "send", "Textul e în redactarea raportului, la „Amplasament · zona”.")}>{s.sent_at ? "Trimis ✓ · retrimite" : "Trimite în redactare →"}</button>}
                </div>
              </div>
            )}
            {ai && edit && (
              <form className="amPrompt" onSubmit={(e) => { e.preventDefault(); text(s.style ?? "detaliat", true); }}>
                <label className="field">Ce să mai scrie sau să schimbe (opțional)
                  <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1500} placeholder="ex. menționează că zona e în dezvoltare și că strada e asfaltată" />
                </label>
                <button type="submit" className="btn btnGhost btnSm" disabled={!!busy}>{busy?.startsWith("text") ? "Scriu…" : "Refă textul"}</button>
              </form>
            )}
          </section>
        </div>

        <aside className="amCol">
          <section className="card">
            <h2>De unde vine conturul</h2>
            <p className="amSrcNow"><b>{p ? (p.source === "ancpi" ? "Planul cadastral ANCPI · UVALO" : p.doc_name) : "Doar analiza zonei"}</b><br />
              <span className="hint">{p ? (p.source === "ancpi" ? `${p.uat ?? ""}${p.plan_date ? `, plan din ${p.plan_date}` : ""}${p.nr ? ` · nr. ${p.nr}` : ""}` : `coordonate citite cu AI${p.nr ? ` · nr. ${p.nr}` : ""}`) : "fără datele parcelei"}</span></p>
            {p?.source === "doc" && <p className="hint">Verifică punctele din tabel cu actul: AI poate greși o cifră. Suprafața din coordonate {diff != null && diff <= 2 ? "se potrivește" : "trebuie comparată"} cu cea din act.</p>}
            {edit && <button type="button" className="btn btnGhost btnSm" onClick={() => setChoosing(true)}>Schimbă sursa</button>}
          </section>
          {p && (
            <section className="card">
              <h2>Inventar de coordonate</h2>
              <span className="hint">Stereo 70 · {p.source === "ancpi" ? "din planul ANCPI" : `din ${p.doc_name}`}</span>
              <div className="tableWrap amInv">
                <table className="table">
                  <thead><tr><th>Pct.</th><th className="num">X (N)</th><th className="num">Y (E)</th><th className="num">Latura</th></tr></thead>
                  <tbody>{p.pts.map((q, i) => <tr key={i}><td>{q.pct}</td><td className="num mono">{fmt(q.x, 2)}</td><td className="num mono">{fmt(q.y, 2)}</td><td className="num mono">{q.side != null ? fmt(q.side, 2) : ""}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          <section className="card">
            <h2>Completat de evaluator</h2>
            <label className="field">Situarea
              <select className="select" value={s.situated ?? ""} disabled={!edit || !!busy} onChange={(e) => patch({ situated: e.target.value || null }, "situated")}>
                <option value="">— nestabilită —</option><option value="intravilan">Intravilan</option><option value="extravilan">Extravilan</option>
              </select>
            </label>
            <p className="hint">Intră în datele textului: refă textul după ce o schimbi.</p>
          </section>
          <section className="card">
            <h2>Folosit în</h2>
            <ul className="amUsed">
              <li className={s.sent_at ? "on" : ""}><b>Redactare raport</b><span>{s.sent_at ? `trimis ${fmtAt(s.sent_at)}` : "netrimis"}</span></li>
              <li className={s.in_annex ? "on" : ""}><b>Anexa foto</b><span>{s.in_annex ? `${s.figures.length} ${s.figures.length === 1 ? "hartă" : "hărți"}` : "neadăugate"}</span>{s.in_annex && <a className="link" href={props.annexHref}>deschide →</a>}</li>
            </ul>
            {s.in_annex && edit && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => patch({ in_annex: false }, "annex-off", "Hărțile nu mai apar în Anexa foto.")}>Scoate hărțile din anexă</button>}
          </section>
        </aside>
      </div>
    </>
  );
}

function Running({ steps, title, error, onBack }: { steps: Step[]; title: string; error: string | null; onBack: () => void }) {
  const done = steps.filter((x) => x.state === "ok" || x.state === "skip").length;
  return (
    <section className="card amRun" aria-live="polite">
      <div>
        <span className="amEyebrow">{error ? "ANALIZA S-A OPRIT" : "SE FACE ANALIZA"}</span>
        <h2>{title}</h2>
        <span className="hint">{error ? "Ce s-a făcut până aici e salvat." : "Durează de obicei 20–40 de secunde (citirea unui act cu AI, până la un minut). Rămâi pe pagină până se termină."}</span>
      </div>
      <ol className="amSteps">
        {steps.map((x) => (
          <li key={x.key} className={x.state}>
            <i aria-hidden="true">{x.state === "ok" ? "✓" : x.state === "err" ? "!" : x.state === "skip" ? "–" : ""}</i>
            <span><b>{x.label}</b> · {x.detail}</span>
            <small>{x.state === "ok" ? "gata" : x.state === "run" ? "în lucru" : x.state === "err" ? "eroare" : x.state === "skip" ? "sărit" : ""}</small>
          </li>
        ))}
      </ol>
      <div className="amBar2" aria-hidden="true"><div style={{ width: `${Math.round((100 * done) / steps.length)}%` }} /></div>
      {error && <><p className="amErr" role="alert">{error}</p><button type="button" className="btn btnGhost btnSm" onClick={onBack}>← Alege altă sursă</button></>}
    </section>
  );
}
