"use client";

import { Icon, type Local } from "./ui";

/** The evaluator's message when a sent sheet comes back for completions, with the way into the sheet. */
export function RevisionNote({ i, href }: { i: Local; href?: string }) {
  if (!i.revision) return null;
  const at = i.revision.at ? new Date(i.revision.at) : null;
  return (
    <section className="iBox iRevision" role="status">
      <h3>Inspecția a revenit în lucru pentru completări</h3>
      <span className="muted">{[i.revision.by && `de la ${i.revision.by}`, at && at.toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ")}</span>
      <p className="iText">{i.revision.note}</p>
      <span className="muted">Poți modifica răspunsurile, adăuga fotografii, apoi trimiți fișa din nou. Data și locația vizitei rămân cele inițiale.</span>
      {href && <a className="iBtn" href={href}><Icon.sheet />Completează fișa</a>}
    </section>
  );
}
