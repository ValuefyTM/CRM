"use client";

import { useMemo } from "react";
import type { Ctx } from "./InspApp";
import { fmtWhen, parseLocal } from "./store";
import { Icon, mapsUrl, Pill, telUrl, TopBar, wazeUrl, type Local } from "./ui";
import { LeafletMap } from "./LeafletMap";
import { useDetail, useDraft, usePhotos } from "./hooks";
import { progress, sheetTypeLabel } from "@/lib/insp-forms";

const CONTACT: Record<string, string> = { client: "Client", owner: "Proprietar", agent: "Agent", other: "Contact" };

/** Calendar file for the phone's own calendar. */
function ics(i: Local) {
  const d = i.scheduled_at ? parseLocal(i.scheduled_at) : null;
  if (!d) return null;
  const end = new Date(d.getTime() + (i.duration_min ?? 60) * 60000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VALUEFY//Inspectii//RO", "BEGIN:VEVENT", `UID:${i.id}@inspectii.valuefy.ro`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(d)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(`Inspecție: ${i.property_label}`)}`, `LOCATION:${esc(i.address)}`,
    `DESCRIPTION:${esc([i.report_number && `Raport ${i.report_number}`, i.contact_name && `Contact: ${i.contact_name} ${i.contact_phone ?? ""}`].filter(Boolean).join("\n"))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

export function DetailView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail, missing } = useDetail(ctx, id);
  const i: Local | undefined = item ?? detail?.inspection;
  const { draft } = useDraft(ctx, id, item, detail);
  const { photos } = usePhotos(ctx, id, detail);
  const prog = useMemo(() => (draft ? progress(draft.sheet_type, draft.answers) : null), [draft]);

  if (!i) {
    return (
      <>
        <TopBar title="Inspecție" onBack={ctx.back} />
        <div className="iPad"><p className="iEmpty">{missing ? "Inspecția nu mai este alocată ție." : "Se încarcă…"}</p></div>
      </>
    );
  }

  const sent = i.status === "done" || i.local === "sent" || draft?.submitted;
  const sending = i.local === "sending" && !sent;
  const started = !!draft && (draft.dirty || Object.keys(draft.answers).length > 0 || photos.length > 0);
  const smsText = i.scheduled_at
    ? `Bună ziua! Sunt ${ctx.me.name}, de la VALUEFY. Vă confirm inspecția pentru evaluarea proprietății din ${i.address}, ${fmtWhen(i.scheduled_at).toLowerCase()}. Vă mulțumesc!`
    : `Bună ziua! Sunt ${ctx.me.name}, de la VALUEFY. Vă contactez pentru programarea inspecției proprietății din ${i.address}. Când vă este convenabil?`;
  const cal = ics(i);
  const sheetHref = `#/i/${encodeURIComponent(id)}/fisa`;

  return (
    <>
      <TopBar title={i.property_label} sub={i.report_number ? `Raport ${i.report_number}${i.bank ? ` · ${i.bank}` : ""}` : sheetTypeLabel(i.sheet_type)} onBack={ctx.back} />
      <div className="iPad withCta">
        <section className="iBox">
          <div className="iCardHead">
            <span className="iTime">{i.status === "to_schedule" && !i.local ? "Neprogramată" : fmtWhen(i.scheduled_at)}</span>
            <Pill i={i} />
          </div>
          {i.duration_min && i.status === "scheduled" && <span className="muted">Durată estimată {i.duration_min} min{i.contact_notified_at ? " · contactul a fost anunțat" : ""}</span>}
          {i.local === "scheduled_offline" && <span className="iNote warn">Programarea e salvată pe telefon și se trimite când ai semnal.</span>}
          {!sent && (
            <div className="iRow2">
              <button type="button" className="iBtn ghost" onClick={() => ctx.go(`#/i/${encodeURIComponent(id)}/programeaza`)}>
                <Icon.calendar />{i.status === "scheduled" ? "Reprogramează" : "Programează"}
              </button>
              {cal ? <a className="iBtn ghost" href={cal} download={`inspectie-${i.report_number ?? id}.ics`}><Icon.clock />În calendar</a> : <span />}
            </div>
          )}
        </section>

        {i.host_id && (
          <section className="iBox accent">
            <h3>Se inspectează pe fișa bunului principal</h3>
            <p className="iText">Accesoriul are câmpurile lui pe fișa proprietății de la aceeași adresă: o singură vizită, o singură semnătură.</p>
            <a className="iBtn" href={`#/i/${encodeURIComponent(i.host_id)}`}>Deschide inspecția principală →</a>
          </section>
        )}
        {((i.hosted ?? []).length > 0 || (i.together ?? []).length > 0) && (
          <section className="iBox">
            <h3>La aceeași adresă</h3>
            {(i.hosted ?? []).map((h) => (
              <div key={h.id} className="iKv"><span>Pe această fișă</span><b>{h.label}{h.usable_area != null ? ` · ${h.usable_area} m²` : ""}</b></div>
            ))}
            {(i.together ?? []).map((t) => (
              <a key={t.id} className="iKv link" href={`#/i/${encodeURIComponent(t.id)}`}><span>Fișă separată</span><b>{t.label} →</b></a>
            ))}
            <span className="muted">Programarea acestei inspecții se aplică tuturor bunurilor de la adresă.</span>
          </section>
        )}

        <section className="iBox flush">
          {i.lat != null && i.lng != null ? (
            <LeafletMap points={[{ id: i.id, lat: i.lat, lng: i.lng, tone: "acc", label: i.property_label }]} selected={i.id} height={200} zoom={16} />
          ) : (
            <div className="iNoMap"><Icon.pin />Proprietatea nu are coordonate. Navigarea folosește adresa.</div>
          )}
          <div className="iBoxIn">
            <b>{i.address}</b>
            {(i.city || i.county) && <span className="muted">{[i.city, i.county].filter(Boolean).join(", ")}</span>}
            <div className="iRow2">
              <a className="iBtn ghost" href={mapsUrl(i)} target="_blank" rel="noreferrer"><Icon.nav />Google Maps</a>
              <a className="iBtn ghost" href={wazeUrl(i)} target="_blank" rel="noreferrer"><Icon.nav />Waze</a>
            </div>
          </div>
        </section>

        <section className="iBox">
          <h3>Persoană de contact</h3>
          {i.contact_name || i.contact_phone ? (
            <>
              <div className="iKv"><span>{CONTACT[i.contact_kind ?? ""] ?? "Contact"}</span><b>{i.contact_name || "—"}</b></div>
              {i.contact_phone && (
                <div className="iRow2">
                  <a className="iBtn" href={telUrl(i.contact_phone)}><Icon.phone />Sună</a>
                  <a className="iBtn ghost" href={`sms:${i.contact_phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(smsText)}`}>SMS</a>
                </div>
              )}
            </>
          ) : <p className="muted">Nu există persoană de contact. O poți adăuga la programare.</p>}
        </section>

        <section className="iBox">
          <h3>Proprietatea</h3>
          <div className="iKv"><span>Tip</span><b>{i.property_label}</b></div>
          <div className="iKv"><span>Fișă</span><b>{sheetTypeLabel(draft?.sheet_type ?? i.sheet_type)}</b></div>
          {i.cf_number && <div className="iKv"><span>Carte funciară</span><b className="mono">{i.cf_number}</b></div>}
          {i.cad && <div className="iKv"><span>Nr. cadastral</span><b className="mono">{i.cad}</b></div>}
          {i.usable_area != null && <div className="iKv"><span>Suprafață utilă (acte)</span><b>{i.usable_area.toLocaleString("ro-RO")} m²</b></div>}
          {i.year_built != null && <div className="iKv"><span>An construcție</span><b>{i.year_built}</b></div>}
        </section>

        {(i.report_number || i.client || i.purpose) && (
          <section className="iBox">
            <h3>Lucrarea</h3>
            {i.report_number && <div className="iKv"><span>Raport</span><b>{i.report_number}{i.report_label ? ` · ${i.report_label}` : ""}</b></div>}
            {i.client && <div className="iKv"><span>Client</span><b>{i.client}</b></div>}
            {i.bank && <div className="iKv"><span>Bancă</span><b>{i.bank}</b></div>}
            {i.purpose && <div className="iKv"><span>Scop</span><b>{i.purpose}</b></div>}
          </section>
        )}

        {(i.instructions || i.due_on || i.assigned_by_name) && (
          <section className="iBox">
            <h3>De la evaluator</h3>
            {i.assigned_by_name && <div className="iKv"><span>Alocată de</span><b>{i.assigned_by_name}</b></div>}
            {i.due_on && <div className="iKv"><span>Termen inspecție</span><b>{i.due_on.split("-").reverse().join(".")}</b></div>}
            {i.instructions && <p className="iText">{i.instructions}</p>}
          </section>
        )}

        {i.notes && (
          <section className="iBox">
            <h3>Observații la programare</h3>
            <p className="iText">{i.notes}</p>
          </section>
        )}

        {(started || sent) && prog && (
          <section className="iBox">
            <h3>Fișa de inspecție</h3>
            <div className="iKv"><span>Câmpuri completate</span><b>{prog.done} din {prog.total}</b></div>
            <div className="iKv"><span>Fotografii</span><b>{photos.length}</b></div>
            {draft?.error && <span className="iNote err">{draft.error}</span>}
            {sending && <span className="iNote warn">Fișa este semnată și așteaptă semnal ca să se trimită.</span>}
            {sent && <span className="iNote ok">Fișa a fost trimisă.</span>}
          </section>
        )}
      </div>

      <div className="iCta">
        {i.host_id && !sent ? (
          <a className="iBtn big acc" href={`#/i/${encodeURIComponent(i.host_id)}/fisa`}>Completează pe fișa principală →</a>
        ) : sent ? (
          <a className="iBtn big ghost" href={sheetHref}>Vezi fișa trimisă</a>
        ) : sending ? (
          <a className="iBtn big ghost" href="#/detrimis">Vezi ce e de trimis</a>
        ) : (
          <a className="iBtn big acc" href={sheetHref}>{started ? "Continuă fișa →" : "Începe inspecția →"}</a>
        )}
      </div>
    </>
  );
}
