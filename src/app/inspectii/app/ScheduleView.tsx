"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "./InspApp";
import { allOps, dayKey, deleteOp, fmtDay, fmtTime, MONTHS, newId, parseLocal, putOp } from "./store";
import { useDetail } from "./hooks";
import { TopBar, type Local } from "./ui";

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const QUARTERS = Array.from({ length: (20 - 7) * 4 + 1 }, (_, n) => { const m = 7 * 60 + n * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const DURATIONS = [30, 60, 90, 120];
const WD = ["L", "M", "M", "J", "V", "S", "D"];
const durLabel = (d: number) => (d < 60 ? `${d} min` : d === 60 ? "1 oră" : `${String(d / 60).replace(".", ",")} ore`);

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

  const [month, setMonth] = useState(() => { const d = parseLocal(day)!; return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sms, setSms] = useState(!i?.contact_notified_at);
  const others = useMemo(() => ctx.list.filter((x) => x.id !== id && x.status !== "cancelled" && x.scheduled_at), [ctx.list, id]);
  const busyDays = useMemo(() => new Set(others.map((x) => x.scheduled_at!.slice(0, 10))), [others]);
  const sameDay = useMemo(() => others.filter((x) => x.scheduled_at!.slice(0, 10) === day).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!)), [others, day]);
  const overlaps = (t: string, dur: number) => sameDay.find((x) => {
    const a = parseLocal(x.scheduled_at!)!.getTime(), b = a + (x.duration_min ?? 60) * 60000;
    const st = parseLocal(`${day}T${t}`)!.getTime(), e = st + dur * 60000;
    return st < b && a < e;
  });
  const at = `${day}T${time}`;
  const clash = overlaps(time, duration);
  const changed = !re || at !== i?.scheduled_at?.slice(0, 16);
  const todayKey = dayKey(new Date());
  // Month grid from Monday.
  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7, n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, k) => new Date(month.getFullYear(), month.getMonth(), k + 1))];
  }, [month]);
  const whenLabel = (() => { const d = parseLocal(at); return d ? `${fmtDay(d).replace(/,.*$/, "")}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${time}` : ""; })();
  const smsText = `Bună ziua! Vă confirm inspecția pentru ${i?.address ?? "proprietate"}, ${whenLabel.replace(" · ", ", ora ")}. ${ctx.me.name}, VALUEFY.`;

  if (!i) return (<><TopBar title="Programează" onBack={ctx.back} /><div className="iPad"><p className="iEmpty">Se încarcă…</p></div></>);

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setMsg("Alege data.");
    if (re && changed && !reason.trim()) return setMsg("Spune pe scurt de ce se reprogramează.");
    if (parseLocal(at)!.getTime() < Date.now() - 3600_000 && !confirm("Data aleasă este în trecut. Salvezi totuși?")) return;
    const sendSms = sms && !!phone.trim();
    setBusy(true); setMsg("");
    const op = { id: newId(), inspection_id: id, created_at: new Date().toISOString(), error: null,
      body: { scheduled_at: at, duration_min: duration, contact_name: name.trim(), contact_phone: phone.trim(), notes: notes.trim(), reason: changed ? reason.trim() : "", contact_notified: notified || sendSms } };
    await putOp(op);
    await ctx.reload();
    if (navigator.onLine) {
      await ctx.sync();
      const left = (await allOps()).find((o) => o.id === op.id);
      if (left?.error) { await deleteOp(op.id); await ctx.reload(); setBusy(false); return setMsg(left.error); }
    }
    setBusy(false);
    ctx.go(`#/i/${encodeURIComponent(id)}`);
    // The confirmation goes from the inspector's own phone (SMS app with the text filled in).
    if (sendSms) location.href = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(smsText)}`;
  };

  return (
    <>
      <TopBar title={re ? "Reprogramează" : "Programează"} sub={i.property_label} onBack={ctx.back} />
      <div className="iPad withCta">
        {re && <p className="iNote">Programată acum: <b>{fmtDay(start!)}, {fmtTime(i.scheduled_at)}</b>{i.reschedule_count ? ` · reprogramată de ${i.reschedule_count} ori` : ""}</p>}
        <section className="cMonth">
          <span className="cMonthHead">
            <button type="button" aria-label="Luna anterioară" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <b>{MONTHS[month.getMonth()].replace(/^./, (c) => c.toUpperCase())} {month.getFullYear()}</b>
            <button type="button" aria-label="Luna următoare" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </span>
          <div className="cGrid wd">{WD.map((w, n) => <span key={n}>{w}</span>)}</div>
          <div className="cGrid">
            {cells.map((d, n) => {
              if (!d) return <span key={`e${n}`} />;
              const k = dayKey(d);
              return (
                <button key={k} type="button" aria-pressed={k === day} className={`${k === day ? "on" : ""}${k < todayKey ? " past" : ""}${k === todayKey ? " today" : ""}`}
                  onClick={() => setDay(k)} aria-label={fmtDay(d)}>
                  {d.getDate()}{busyDays.has(k) && <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </section>

        <div className="iQ">
          <span className="iQLabel">Ora · {fmtDay(parseLocal(day) ?? new Date())}</span>
          <div className="cHours">
            {[...new Set([...HOURS, ...(HOURS.includes(time) ? [] : [time])])].sort().map((t) => {
              const taken = !!overlaps(t, 60);
              return <button key={t} type="button" aria-pressed={time === t} className={`${time === t ? "on" : ""}${taken ? " taken" : ""}`} onClick={() => setTime(t)}>{t}</button>;
            })}
          </div>
          <label className="cOther">Altă oră
            <select value={time} onChange={(e) => setTime(e.target.value)}>{(QUARTERS.includes(time) ? QUARTERS : [time, ...QUARTERS]).map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <small className="hint">Gri = ai deja o inspecție la ora aceea.{sameDay.length ? ` În ziua aleasă: ${sameDay.map((x) => `${fmtTime(x.scheduled_at)} ${x.city ?? x.address}`).join(", ")}.` : ""}</small>
        </div>

        <div className="iQ">
          <span className="iQLabel">Durată</span>
          <div className="cDur">{DURATIONS.map((d) => <button key={d} type="button" aria-pressed={duration === d} className={duration === d ? "on" : ""} onClick={() => setDuration(d)}>{durLabel(d)}</button>)}</div>
        </div>
        {clash && <p className="iNote warn">Se suprapune cu inspecția de la {fmtTime(clash.scheduled_at)} ({clash.property_label}, {clash.address}).</p>}

        <section className="iBox">
          <h3>Persoana de contact</h3>
          <label className="iField">Nume<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
          <label className="iField">Telefon<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
          {phone.trim() ? (
            <label className="cSms">
              <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
              <span><b>Trimite SMS de confirmare{name.trim() ? ` către ${name.trim()}` : ""}</b><small>„{smsText}”</small></span>
            </label>
          ) : null}
          <label className="iCheck"><input type="checkbox" checked={notified} onChange={(e) => setNotified(e.target.checked)} />Am anunțat deja contactul (telefon)</label>
        </section>
        <section className="iBox">
          {re && changed && (
            <label className="iField">Motivul reprogramării
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. proprietarul nu este disponibil" />
            </label>
          )}
          <label className="iField">Indicații de acces / observații
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex. interfon 7, cheia la vecina de la ap. 5" />
          </label>
        </section>
        {msg && <p role="alert" className="iNote err">{msg}</p>}
      </div>
      <div className="iCta">
        <button type="button" className="iBtn big acc" disabled={busy} onClick={save}>{busy ? "Se salvează…" : `${re && changed ? "Reprogramează" : "Programează"} ${whenLabel}`}</button>
      </div>
    </>
  );
}
