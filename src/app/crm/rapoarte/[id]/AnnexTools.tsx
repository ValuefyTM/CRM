"use client";
// „Anexa foto” and „Anexa acte” of the report, made from „Acte & livrare”: a button each (green once generated), a window
// where the assets are chosen (when there are several), then the annex editor (which photos or pages, order, layout);
// „Generează anexa” saves its PDF and its Word in the report's folder, where it opens as a preview.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnexaBuilder, type SrcDoc, type SrcPhoto } from "@/components/AnexaBuilder";

type Mode = "foto" | "acte";
type Done = { id: string; at: string | null; href: string } | null;
type Sources = { photos: SrcPhoto[]; inspections: { id: string; label: string }[]; docs: SrcDoc[]; fileBase: string };
const LABEL: Record<Mode, string> = { foto: "Anexa foto", acte: "Anexa acte" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }).replace(".", "") : "");

export function AnnexTools({ report, assets, done, names, edit, autoOpen = null }: {
  report: string; assets: { id: string; label: string; sub?: string | null }[];
  done: Record<Mode, Done>; names: Record<Mode, string>; edit: boolean; autoOpen?: Mode | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState<"assets" | "build">("assets");
  const [picked, setPicked] = useState<string[]>(assets.map((a) => a.id));
  const [src, setSrc] = useState<Sources | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const start = (m: Mode) => {
    setMode(m); setErr(""); setOk(""); setSrc(null);
    if (assets.length > 1) setStep("assets"); else { setStep("build"); load(m, assets.map((a) => a.id)); }
  };
  useEffect(() => { if (autoOpen && edit && assets.length) start(autoOpen); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mode) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && step === "assets") setMode(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [mode, step]);

  const load = async (m: Mode, ids: string[]) => {
    setStep("build"); setSrc(null); setErr("");
    const r = await fetch(`/api/crm/reports/${report}/annex?mod=${m}&assets=${ids.map(encodeURIComponent).join(",")}`).catch(() => null);
    const d = (await r?.json().catch(() => null)) as (Sources & { error?: string }) | null;
    if (!r?.ok || !d) return setErr(d?.error ?? "Nu am putut încărca pozele / actele.");
    setSrc(d);
  };

  const save = async (m: Mode, file: Blob, ext: "pdf" | "docx", role: string) => {
    const fd = new FormData();
    fd.set("file", new File([file], `${names[m]}.${ext}`, { type: ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    fd.set("kind", "source"); fd.set("folder", "root"); fd.set("role", role); fd.set("doc_type", "other");
    const r = await fetch(`/api/crm/reports/${report}/documents`, { method: "POST", body: fd }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    if (!r?.ok) throw new Error(d?.error ?? `${LABEL[m]} nu s-a putut salva.`);
  };
  const generate = async (pdf: Blob, docx: Blob, pages: number) => {
    if (!mode) return;
    await save(mode, docx, "docx", `annex_${mode}_word`);
    await save(mode, pdf, "pdf", `annex_${mode}`);
    setOk(`${LABEL[mode]} a fost generată (${pages} ${pages === 1 ? "pagină" : "pagini"}) și e în folderul raportului.`);
    setMode(null);
    router.refresh();
  };

  return (
    <section className="card anxCard" aria-label="Anexele raportului">
      <div className="anxHead"><b>Anexele raportului</b><small>se generează în folderul raportului, ca PDF și Word</small></div>
      {(["foto", "acte"] as Mode[]).map((m) => {
        const d = done[m];
        return (
          <div key={m} className={`anxRow${d ? " ok" : ""}`}>
            <button type="button" className={`anxBtn${d ? " ok" : ""}`} disabled={!edit || !assets.length} onClick={() => start(m)}
              title={!assets.length ? "Raportul nu are bunuri" : d ? "Refă anexa (cea veche rămâne ca versiune)" : undefined}>
              <span aria-hidden="true">{d ? "✓" : m === "foto" ? "▣" : "▤"}</span>
              <span>{d ? `${LABEL[m]} generată` : `Creează ${LABEL[m].toLowerCase()}`}</span>
            </button>
            {d && <small className="anxMeta">{day(d.at)} · <a className="link" href={d.href} target="_blank" rel="noopener">deschide PDF</a>{edit && <> · <button type="button" className="linkBtn" onClick={() => start(m)}>refă</button></>}</small>}
          </div>
        );
      })}
      {ok && <p className="okMsg" role="status">{ok}</p>}

      {mode && (
        <div className="vfModal anxModal" role="dialog" aria-modal="true" aria-label={LABEL[mode]} onClick={(e) => { if (e.target === e.currentTarget && step === "assets") setMode(null); }}>
          <div className={`vfModalBox ${step === "build" ? "anxBig" : "anxSmall"}`}>
            <div className="cardHead">
              <h2>{done[mode] ? `Refă ${LABEL[mode].toLowerCase()}` : `Creează ${LABEL[mode].toLowerCase()}`}{step === "build" && assets.length > 1 && <small className="muted"> · {picked.length} {picked.length === 1 ? "bun" : "bunuri"}</small>}</h2>
              <span className="actions">
                {step === "build" && assets.length > 1 && <button type="button" className="btn btnGhost btnSm" onClick={() => setStep("assets")}>‹ Bunurile</button>}
                <button type="button" className="btn btnGhost btnSm" aria-label="Închide" onClick={() => { if (step === "assets" || confirm("Închizi fără să generezi anexa? Alegerile tale rămân salvate în acest browser.")) setMode(null); }}>×</button>
              </span>
            </div>
            {step === "assets" ? (
              <>
                <p className="hint">Pentru ce bunuri faci {LABEL[mode].toLowerCase()}?</p>
                <ul className="anxAssets">
                  {assets.map((a, i) => (
                    <li key={a.id}><label className="check">
                      <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                      <span><b>Bun {i + 1} · {a.label}</b>{a.sub && <small>{a.sub}</small>}</span>
                    </label></li>
                  ))}
                </ul>
                <div className="actions">
                  <button type="button" className="linkBtn" onClick={() => setPicked(picked.length === assets.length ? [] : assets.map((a) => a.id))}>{picked.length === assets.length ? "Niciunul" : "Toate"}</button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn btnGold" disabled={!picked.length} onClick={() => load(mode, picked)}>Continuă →</button>
                </div>
              </>
            ) : err ? <div className="error" role="alert">{err}</div>
              : !src ? <p className="hint">Se încarcă {mode === "foto" ? "pozele" : "actele"}…</p>
              : (mode === "foto" ? !src.photos.length : !src.docs.length) ? <p className="hint">{mode === "foto" ? "Bunurile alese nu au poze de la inspecție." : "Bunurile alese nu au acte (PDF sau imagini)."} Le poți adăuga din calculator în editor.</p>
              : null}
            {step === "build" && src && (
              <AnexaBuilder key={`${mode}:${picked.join(",")}`} mode={mode} scope={`${report}:${[...picked].sort().join(",")}:${mode}`} photos={src.photos} inspections={src.inspections}
                docs={src.docs} fileBase={names[mode]} onGenerate={generate} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
