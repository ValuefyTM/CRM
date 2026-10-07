"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "./InspApp";
import { allOps, dayKey, deleteOp, fmtDay, fmtTime, newId, parseLocal, putOp } from "./store";
import { useDetail } from "./hooks";
import { TopBar, type Local } from "./ui";

const TIMES = Array.from({ length: (20 - 7) * 4 + 1 }, (_, n) => { const m = 7 * 60 + n * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const DURATIONS = [30, 45, 60, 90, 120, 180];

/** Schedule / reschedule a visit. Saved on the phone first, so it also works without signal. */
export function ScheduleView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const i = item ?? detail?.inspection;
  const re = i?.status === "scheduled" && !!i.scheduled_at;
  const start = i?.scheduled_at ? parseLocal(i.scheduled_at) : null;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const [day, setDay] = useState(dayKey(start ?? tomorrow));
  const [time, setTime] = useState(start ? fmtTime(i!.scheduled_at) : "10:00");
  const [duration, setDuration] = useState(i?.duration_min ?? 60);
  const [name, setName] = useState(i?.contact_name ?? "");
  const [phone, setPhone] = useState(i?.contact_phone ?? "");
  const [notified, setNotified] = useState(!!i?.contact_notified_at);
  const [notes, setNotes] = useState(i?.notes ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const sameDay = useMemo(() => ctx.list.filter((x) => x.id !== id && x.status !== "cancelled" && x.scheduled_at?.slice(0, 10) === day)
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")), [ctx.list, id, day]);
  const at = `${day}T${time}`;
  const clash = sameDay.find((x) => {
    const a = parseLocal(x.scheduled_at!)!.getTime(), b = a + (x.duration_min ?? 60) * 60000;
    const s = parseLocal(at)!.getTime(), e = s + duration * 60000;
    return s < b && a < e;
  });
  const changed = !re || at !== i?.scheduled_at?.slice(0, 16);

  if (!i) return (<><TopBar title="Programează" onBack={ctx.back} /><div className="iPad"><p className="iEmpty">Se încarcă…</p></div></>);

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setMsg("Alege data.");
    if (re && changed && !reason.trim()) return setMsg("Spune pe scurt de ce se reprogramează.");
    if (parseLocal(at)!.getTime() < Date.now() - 3600_000 && !confirm("Data aleasă este în trecut. Salvezi totuși?")) return;
    setBusy(true); setMsg("");
    const op = { id: newId(), inspection_id: id, created_at: new Date().toISOString(), error: null,
      body: { scheduled_at: at, duration_min: duration, contact_name: name.trim(), contact_phone: phone.trim(), notes: notes.trim(), reason: changed ? reason.trim() : "", contact_notified: notified } };
    await putOp(op);
    await ctx.reload();
    if (navigator.onLine) {
      await ctx.sync();
      const left = (await allOps()).find((o) => o.id === op.id);
      if (left?.error) { await deleteOp(op.id); await ctx.reload(); setBusy(false); return setMsg(left.error); }
    }
    setBusy(false);
    ctx.go(`#/i/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <TopBar title={re ? "Reprogramează" : "Programează"} sub={i.address} onBack={ctx.back} />
      <div className="iPad withCta">
        {re && <p className="iNote">Programată acum: <b>{fmtDay(start!)}, {fmtTime(i.scheduled_at)}</b>{i.reschedule_count ? ` · reprogramată de ${i.reschedule_count} ori` : ""}</p>}
        <section className="iBox">
          <label className="iField">Data
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="iField">Ora
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              {(TIMES.includes(time) ? TIMES : [time, ...TIMES]).map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <div className="iField">Durată estimată
            <div className="iChips">
              {DURATIONS.map((d) => <button key={d} type="button" className={`iChip${duration === d ? " on" : ""}`} aria-pressed={duration === d} onClick={() => setDuration(d)}>{d < 60 ? `${d} min` : `${d / 60} h`.replace(".5", ",5")}</button>)}
            </div>
          </div>
          {clash && <p className="iNote warn">Se suprapune cu inspecția de la {fmtTime(clash.scheduled_at)} ({clash.property_label}, {clash.address}).</p>}
          <div className="iDayList">
            <span className="muted">{fmtDay(parseLocal(day) ?? new Date()).replace(/^./, (c) => c.toUpperCase())}: {sameDay.length ? "" : "nicio altă inspecție"}</span>
            {sameDay.map((x) => <span key={x.id} className="iDayItem"><b className="mono">{fmtTime(x.scheduled_at)}</b> {x.property_label} · {x.city ?? x.address}</span>)}
          </div>
        </section>
        <section className="iBox">
          <h3>Persoana de contact</h3>
          <label className="iField">Nume<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
          <label className="iField">Telefon<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
          <label className="iCheck"><input type="checkbox" checked={notified} onChange={(e) => setNotified(e.target.checked)} />Am anunțat contactul (telefon / SMS)</label>
        </section>
        <section className="iBox">
          {re && changed && (
            <label className="iField">Motivul reprogramării
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. proprietarul nu este disponibil" />
            </label>
          )}
          <label className="iField">Observații pentru inspecție
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex. cheia la administrator, interfon 12" />
          </label>
        </section>
        {msg && <p role="alert" className="iNote err">{msg}</p>}
      </div>
      <div className="iCta">
        <button type="button" className="iBtn big acc" disabled={busy} onClick={save}>{busy ? "Se salvează…" : re ? "Salvează reprogramarea" : "Salvează programarea"}</button>
      </div>
    </>
  );
}
