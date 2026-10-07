"use client";

import type { Ctx } from "./InspApp";
import { deleteOp, fmtWhen, putDraft, putPhoto } from "./store";
import { Icon, TopBar } from "./ui";

/** What is still on the phone only: schedulings, photos and sheets waiting for signal (or refused by the server). */
export function OutboxView({ ctx }: { ctx: Ctx }) {
  const { ops, photos, drafts } = ctx.pending;
  const name = (id: string) => { const i = ctx.list.find((x) => x.id === id); return i ? `${i.property_label} · ${i.address}` : "Inspecție"; };
  const byInsp = new Map<string, number>();
  for (const p of photos) if (!p.deleted) byInsp.set(p.inspection_id, (byInsp.get(p.inspection_id) ?? 0) + 1);
  const photoErr = photos.filter((p) => p.error);
  const empty = !ops.length && !photos.length && !drafts.length;

  const retryPhotos = async () => { for (const p of photoErr) await putPhoto({ ...p, error: null }); await ctx.reload(); ctx.sync(); };

  return (
    <>
      <TopBar title="De trimis" sub={ctx.lastSync ? `Ultima sincronizare: ${new Date(ctx.lastSync).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}` : undefined}
        right={<button type="button" className="iIconBtn" onClick={() => ctx.sync()} aria-label="Sincronizează" disabled={ctx.syncing}><Icon.refresh /></button>} />
      <div className="iPad">
        <p className={`iNote ${ctx.online ? "ok" : "warn"}`}>
          {ctx.syncing ? "Se sincronizează…" : ctx.online ? "Ai semnal. Datele se trimit automat." : "Fără semnal. Datele rămân pe telefon și se trimit automat când revine semnalul. Nu ieși din cont."}
        </p>
        {empty && <p className="iEmpty">Totul a fost trimis. Nimic nu așteaptă pe telefon.</p>}

        {drafts.filter((d) => d.submit || d.error).map((d) => (
          <section key={d.id} className="iBox">
            <div className="iCardHead"><h3>Fișă de inspecție</h3><span className={`iPill ${d.error ? "err" : "warn"}`}>{d.error ? "Refuzată" : "Așteaptă"}</span></div>
            <span>{name(d.id)}</span>
            {byInsp.get(d.id) ? <span className="muted">+ {byInsp.get(d.id)} fotografii netrimise</span> : null}
            {d.error && <p className="iNote err">{d.error}</p>}
            <div className="iRow2">
              <a className="iBtn ghost" href={`#/i/${encodeURIComponent(d.id)}/semnatura`}>Deschide</a>
              {d.error && <button type="button" className="iBtn" onClick={async () => { await putDraft({ ...d, error: null }); await ctx.reload(); ctx.sync(); }}>Reîncearcă</button>}
            </div>
          </section>
        ))}

        {ops.map((o) => (
          <section key={o.id} className="iBox">
            <div className="iCardHead"><h3>Programare</h3><span className={`iPill ${o.error ? "err" : "warn"}`}>{o.error ? "Refuzată" : "Așteaptă"}</span></div>
            <span>{name(o.inspection_id)}</span>
            <span className="muted">{fmtWhen(o.body.scheduled_at)}</span>
            {o.error && (
              <>
                <p className="iNote err">{o.error}</p>
                <button type="button" className="iBtn ghost" onClick={async () => { await deleteOp(o.id); await ctx.reload(); }}>Renunță la programare</button>
              </>
            )}
          </section>
        ))}

        {[...byInsp.entries()].filter(([id]) => !drafts.some((d) => d.id === id && (d.submit || d.error))).map(([id, n]) => (
          <section key={id} className="iBox">
            <div className="iCardHead"><h3>Fotografii</h3><span className="iPill warn">{n} netrimise</span></div>
            <span>{name(id)}</span>
          </section>
        ))}
        {photoErr.length > 0 && (
          <section className="iBox">
            <p className="iNote err">{photoErr.length} fotografii au fost refuzate: {photoErr[0].error}</p>
            <button type="button" className="iBtn ghost" onClick={retryPhotos}>Reîncearcă</button>
          </section>
        )}

        {drafts.filter((d) => !d.submit && !d.error && d.dirty).length > 0 && (
          <p className="hint">{drafts.filter((d) => !d.submit && !d.error && d.dirty).length} fișe în lucru au modificări salvate doar pe telefon (se trimit automat ca ciornă).</p>
        )}
      </div>
    </>
  );
}
