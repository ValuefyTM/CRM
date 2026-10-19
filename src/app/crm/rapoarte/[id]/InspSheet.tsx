"use client";
// The inspection sheet of an asset, opened over the report as in UVALO (its sheet page): the firm on top, the profile photo with
// the address, the section chips, the key figures, the property, the answers by group, the rooms with their finishes, the
// findings, every photo by category (full screen with arrows, keys, swipe), and — inside the CRM — who was present and signed.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SheetDoc } from "@/lib/insp-sheet-doc";

const nf = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("ro-RO", { maximumFractionDigits: d }));
const num = (s: string | null | undefined) => { const x = parseFloat(String(s ?? "").replace(",", ".")); return Number.isFinite(x) ? x : null; };
const day = (iso: string | null | undefined, time = false) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleString("ro-RO", {
  timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "");

type Ph = SheetDoc["photos"][number];

function Gallery({ photos }: { photos: Ph[] }) {
  const groups = [...new Set(photos.map((p) => p.group))].map((g) => ({ g, ph: photos.filter((p) => p.group === g) }));
  const all = groups.flatMap((g) => g.ph);
  const [at, setAt] = useState<number | null>(null);
  const x0 = useRef<number | null>(null);
  const go = useCallback((d: number) => setAt((i) => (i == null ? i : (i + d + all.length) % all.length)), [all.length]);
  useEffect(() => {
    if (at == null) return;
    const k = (e: KeyboardEvent) => { e.stopPropagation(); if (e.key === "Escape") setAt(null); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [at, go]);
  const cur = at == null ? null : all[at];
  return (
    <>
      {groups.map(({ g, ph }) => (
        <div key={g} className="ufsPhGroup">
          <h3>{g} <small>{ph.length}</small></h3>
          <div className="ufsPhotos">
            {ph.map((p) => (
              <button key={p.src} type="button" onClick={() => setAt(all.indexOf(p))} aria-label={`Deschide fotografia: ${p.label}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.label} loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>
      ))}
      {cur && (
        <div className="ufsLb" role="dialog" aria-label="Fotografie" onClick={() => setAt(null)}
          onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (x0.current == null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 50) go(d < 0 ? 1 : -1); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.src} alt={cur.label} onClick={(e) => e.stopPropagation()} />
          <span className="ufsLbCap"><b>{cur.label}</b>{cur.taken_at && ` · ${day(cur.taken_at, true)}`} · {at! + 1} / {all.length}</span>
          <button type="button" className="ufsLbX" aria-label="Închide fotografia" onClick={() => setAt(null)}>×</button>
          {all.length > 1 && <>
            <button type="button" className="ufsLbNav prev" aria-label="Anterioara" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
            <button type="button" className="ufsLbNav next" aria-label="Următoarea" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
          </>}
        </div>
      )}
    </>
  );
}

type Firm = { name: string | null; logo: string | null; corp: string | null };

/**
 * The button and the modal of the sheet: with `doc` given by the page it opens at once; without it (or when the page could
 * not build it) the sheet is read from `src` when opened. The sheet always opens over the page, never on its own.
 */
export function InspSheet({ doc: given, src, firm, pdf, label = "Deschide fișa" }: { doc: SheetDoc | null; src?: string; firm: Firm; pdf: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<SheetDoc | null>(given);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    if (!open || doc || !src) return;
    let off = false;
    setErr(null);
    fetch(src, { credentials: "include" }).then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as { doc?: SheetDoc; error?: string };
      if (off) return;
      if (r.ok && j.doc) setDoc(j.doc); else setErr(j.error ?? "Fișa nu a putut fi încărcată.");
    }).catch(() => { if (!off) setErr("Fișa nu a putut fi încărcată. Verifică legătura la internet."); });
    return () => { off = true; };
  }, [open, doc, src]);
  const close = () => setOpen(false);
  const btn = <button type="button" className="btn btnNavy btnSm" onClick={() => setOpen(true)}>{label}</button>;
  if (!doc) return (
    <>
      {btn}
      {open && createPortal(
        <div className="ufsModal" role="dialog" aria-modal="true" aria-label="Fișa de inspecție" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="ufs ufsWait">
            <header className="ufsTop"><span className="ufsCode">Fișă de inspecție</span><button type="button" className="ufsClose" aria-label="Închide fișa" onClick={close}>×</button></header>
            <p className="ufsText">{err ?? (src ? "Se încarcă fișa…" : "Fișa nu este disponibilă.")}</p>
            {err && <p className="ufsText"><a href={pdf} target="_blank" rel="noopener">Încearcă varianta pentru tipărire ↗</a></p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
  return <SheetModal doc={doc} firm={firm} pdf={pdf} open={open} setOpen={setOpen} btn={btn} />;
}

function SheetModal({ doc, firm, pdf, open, setOpen, btn }: { doc: SheetDoc; firm: Firm; pdf: string; open: boolean; setOpen: (v: boolean) => void; btn: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  const p = doc.property, s = doc.sheet;
  // the notes: in the sheet's own "Constatări" group when it has one, else their own card
  const findIdx = doc.sections.findIndex((x) => /constat/i.test(x.title));
  const sections = findIdx >= 0 && doc.notes ? doc.sections.map((x, i) => (i === findIdx ? { ...x, rows: [...x.rows, { label: "Observații", value: doc.notes! }] } : x)) : doc.sections;
  const notes = findIdx >= 0 ? null : doc.notes;
  const cover = doc.photos[0] ?? null;
  const rooms = doc.rooms;
  const util = rooms.reduce((t, r) => t + (num(r.area) ?? 0), 0);
  const fin = rooms.some((r) => r.floor?.length || r.walls?.length || r.ceiling || r.condition);
  const kpis: [string, string][] = [
    ["Suprafață utilă", util ? `${nf(util)} mp` : p.usable_area ? `${nf(p.usable_area)} mp` : ""],
    ["Teren", p.land_area ? `${nf(p.land_area, 0)} mp` : ""],
    ["Încăperi", rooms.length ? String(rooms.length) : ""],
    ["Inspecția", day(doc.inspection.done_at ?? s.submitted_at)],
  ];
  const meta: [string, string][] = [
    ["Nr. cadastral", p.cad ?? ""], ["Carte funciară", p.cf ?? ""], ["Localitate", p.city ?? ""], ["Județ", p.county ?? ""],
    ["Suprafață din acte", p.usable_area ? `${nf(p.usable_area)} mp` : ""],
    ["Inspector", [doc.inspection.inspector, doc.inspection.inspector_anevar && `leg. ${doc.inspection.inspector_anevar}`].filter(Boolean).join(" · ")],
  ];
  const hasMeta = meta.some(([, v]) => v);
  const nav: [string, string][] = [
    ...(hasMeta ? [["imobil", "Imobilul"] as [string, string]] : []),
    ...sections.map((x, i) => [`g${i}`, x.title] as [string, string]),
    ...(rooms.length ? [["incaperi", "Încăperi"] as [string, string]] : []),
    ...(notes ? [["constatari", "Constatări"] as [string, string]] : []),
    ...(doc.photos.length ? [["foto", `Foto ${doc.photos.length}`] as [string, string]] : []),
    ...(s.present || s.signature ? [["semnatura", "Semnătură"] as [string, string]] : []),
  ];
  const map = p.lat != null && p.lng != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
    : p.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}` : null;
  const jump = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); box.current?.querySelector(`#ufs-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const code = s.no ?? `FI-${doc.inspection.id.slice(0, 8).toUpperCase()}`;

  return (
    <>
      {btn}
      {open && createPortal(
        <div className="ufsModal" role="dialog" aria-modal="true" aria-label={`Fișa de inspecție · ${p.address ?? ""}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="ufs" ref={box}>
            <header className="ufsTop">
              <span className="ufsFirm">
                {firm.logo ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={firm.logo} alt={firm.name ?? ""} /></> : null}
                <span>{!firm.logo && <b>{firm.name ?? "VALUEFY"}</b>}{firm.corp && <small>Autorizație ANEVAR nr. {firm.corp}</small>}</span>
              </span>
              <span className="ufsCode">Fișă de inspecție<br />nr. {code}{s.submitted_at ? ` · ${day(s.submitted_at)}` : ""}</span>
              <button type="button" className="ufsClose" aria-label="Închide fișa" onClick={() => setOpen(false)}>×</button>
            </header>

            <section className={`ufsHero${cover ? "" : " noImg"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cover && <img src={cover.src} alt={cover.label} />}
              <div className="ufsHeroText">
                <span className="ufsEyebrow">{p.type ?? "Imobil"}</span>
                <h1>{p.address ?? "—"}</h1>
                <span className="ufsHeroBtns">
                  {map && <a className="ufsBtn" href={map} target="_blank" rel="noopener">Vezi pe hartă ↗</a>}
                  <a className="ufsBtn" href={pdf} target="_blank" rel="noopener">Descarcă PDF</a>
                  {s.source === "uvalo" && <span className="ufsBtn ufsTag">din UVALO</span>}
                </span>
              </div>
            </section>

            {nav.length > 1 && (
              <nav className="ufsNav" aria-label="Secțiuni">
                {nav.map(([id, t]) => <a key={id} href={`#ufs-${id}`} onClick={jump(id)}>{t}</a>)}
              </nav>
            )}

            <main className="ufsMain">
              <div className="ufsKpis">{kpis.filter(([, v]) => v).map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}</div>

              {hasMeta && (
                <section id="ufs-imobil" className="ufsCard">
                  <h2>Imobilul</h2>
                  <dl className="ufsRows">{meta.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                </section>
              )}

              {sections.map((x, i) => (
                <section key={i} id={`ufs-g${i}`} className="ufsCard">
                  <h2>{x.title}</h2>
                  <dl className="ufsRows">{x.rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
                </section>
              ))}

              {rooms.length > 0 && (
                <section id="ufs-incaperi" className="ufsCard">
                  <h2>{fin ? "Încăperi și finisaje" : "Încăperi"}{util > 0 ? <small> · {nf(util)} mp utili</small> : null}</h2>
                  <div className="ufsTblWrap">
                    <table className="ufsTbl">
                      <thead><tr><th>Încăpere</th><th className="r">mp</th>{fin && <><th>Pardoseală</th><th>Pereți</th><th>Plafon</th><th>Stare</th></>}</tr></thead>
                      <tbody>
                        {rooms.map((r, i) => (
                          <tr key={r.id ?? i}>
                            <td><b>{r.name}</b>{r.level ? <small> · {r.level}</small> : null}</td><td className="r">{num(r.area) ? nf(num(r.area)) : "—"}</td>
                            {fin && <><td>{(Array.isArray(r.floor) ? r.floor.join(", ") : r.floor) || "—"}</td><td>{(Array.isArray(r.walls) ? r.walls.join(", ") : r.walls) || "—"}</td><td>{r.ceiling || "—"}</td><td>{r.condition || "—"}</td></>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {notes && (
                <section id="ufs-constatari" className="ufsCard">
                  <h2>Constatări</h2>
                  <p className="ufsText">{notes}</p>
                </section>
              )}

              {doc.photos.length > 0 && (
                <section id="ufs-foto" className="ufsCard">
                  <h2>Fotografii <small>· {doc.photos.length}</small></h2>
                  <Gallery photos={doc.photos} />
                </section>
              )}

              {(s.present || s.signature) && (
                <section id="ufs-semnatura" className="ufsCard">
                  <h2>Prezență și semnătură</h2>
                  <dl className="ufsRows">
                    {s.present && <div><dt>Persoana prezentă</dt><dd>{s.present}{s.role ? ` · ${s.role}` : ""}</dd></div>}
                    {s.location && <div><dt>Localizare GPS</dt><dd><a href={`https://www.google.com/maps?q=${encodeURIComponent(s.location)}`} target="_blank" rel="noopener">{s.location}</a></dd></div>}
                    {s.submitted_at && <div><dt>Semnată</dt><dd>{day(s.submitted_at, true)}</dd></div>}
                  </dl>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.signature && <img className="ufsSig" src={s.signature} alt="Semnătura persoanei prezente" />}
                </section>
              )}
            </main>

            <footer className="ufsFoot">
              Fișă de inspecție {code}{firm.name ? ` · ${firm.name}` : ""}{firm.corp ? ` · Autorizație ANEVAR nr. ${firm.corp}` : ""}
              {doc.inspection.done_at ? ` · ${day(doc.inspection.done_at)}` : ""}
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
