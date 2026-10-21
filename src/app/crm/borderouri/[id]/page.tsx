import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { getStatement, KIND_LABEL, linesOf, linesWith, memberChoices, memberReports, periodLabel, statementLog, STATUS_LABEL, BASIS_PICK, totalOf } from "@/lib/statements";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { LinesTable, lei2 } from "../LinesTable";
import { NotesEdit, StatementActions } from "../StatementActions";
import { AddLine } from "../LineActions";
import { ExportXlsx } from "../ExportXlsx";

export const metadata: Metadata = { title: "Borderou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** One statement: its lines (live while open, frozen after validation), the adjustments with their reasons, the history. */
export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ evaluator?: string }> }) {
  const { db, user, base } = await staffPage("statements");
  const { id } = await params;
  const { evaluator } = await searchParams;
  const s = await getStatement(db, id);
  if (!s) notFound();
  const all = can(user, "statements.all");
  const mine = s.user_id === user.id;
  // "Profitabilitatea lui": any statement, but only its lines on the user's reports (none: not shown)
  const self = !all && !mine && can(user, "statements.lead");
  if (!all && !mine && !self) redirect(`${base}/borderouri`);
  // Seen through one administrator (?evaluator=): only the lines on reports they were in the team of; read-only.
  const who = self ? { id: user.id, name: user.name || user.email } : all && evaluator ? (await memberChoices(db)).find((a) => a.id === evaluator) ?? null : null;
  const canEdit = all && can(user, "statements.E") && !who;
  const [allLines, log] = await Promise.all([linesOf(db, s), statementLog(db, id)]);
  const lines = who ? linesWith(allLines, await memberReports(db, who.id)) : allLines;
  if (self && !lines.length) redirect(`${base}/borderouri`);
  const [st, cls] = STATUS_LABEL[s.status];
  const back = `${base}/borderouri`;
  const total = who || s.status === "open" ? totalOf(lines) : s.total ?? totalOf(lines);
  const criteria = s.criteria ? (JSON.parse(s.criteria) as { basis?: string }) : null;
  const basis = BASIS_PICK.find(([k]) => k === (criteria?.basis ?? "delivered"))?.[1];
  return (
    <CrmShell back={{ href: back, label: "Borderouri" }} user={user} base={base} active="statements" title={`${s.number ? `Borderou ${s.number}` : "Borderou"} · ${s.name}`}
      subtitle={`${KIND_LABEL[s.kind]} · ${periodLabel(s.period)}${s.sub ? ` · ${s.sub}` : ""}`}
      actions={<>
        <ExportXlsx id={s.id} evaluator={who && !self ? who.id : null} />
        <StatementActions id={s.id} status={s.status} canEdit={canEdit} canDelete={all && can(user, "statements.D")} back={back} lines={lines.filter((l) => !l.removed).length} />
      </>}>
      <div className="stHead">
        {s.kind === "payout" ? (s.status === "open" ? <span className="stBadge wait">În curs · nevalidat încă</span> : <span className="stBadge">✓ Validat de firmă{s.status === "issued" ? " · emis" : ""}</span>)
          : <span className={`pill ${cls}`}><i />{st}</span>}
        <b className="stTotal">{lei2(total)}</b>
        <span className="muted">
          {s.status === "open" ? "se calculează din datele de azi; se îngheață la validare" : s.status === "validated" ? `validat ${fmtDate(s.validated_at, true)}${s.validated_name ? ` de ${s.validated_name}` : ""}; se mai poate ajusta până la emitere` : `emis ${fmtDate(s.issued_on)}${s.issued_name ? ` de ${s.issued_name}` : ""}`}
          {basis ? ` · ${basis.toLowerCase()}` : ""}
        </span>
      </div>
      {who && <div className="note"><b>Filtrat după {who.name}:</b> doar {lines.length} din {allLines.length} linii, cele pe rapoartele în care a fost în echipă. {!self && <a className="link" href={`${back}/${s.id}`}>Vezi tot borderoul</a>}.</div>}
      {s.status === "open" && !all && !self && <div className="note">Borderoul e în curs: se actualizează pe măsură ce lucrările se predau. La final de lună îl validează și îl emite firma; orice ajustare apare aici, cu motivul.</div>}
      {mine && lines.some((l) => l.changed_at && !l.accepted_at) && <div className="note"><b>Ai ajustări de confirmat.</b> Uită-te în coloana „Ajustare · comentariu” și bifează „Accept ajustarea” la fiecare.</div>}
      <section className="card flush">
        <div className="cardHead"><h2>Linii</h2>{canEdit && s.status !== "issued" && <AddLine statement={s.id} />}</div>
        <LinesTable lines={lines} base={base} statement={s.id} canEdit={canEdit && s.status !== "issued"} adjust={s.kind === "payout"} accept={mine} locked={s.status === "issued"} />
      </section>
      <div className="dGrid2">
          <section className="card">
            <h2>Detalii</h2>
            <dl className="dl">
              <div><dt>Pentru</dt><dd>{s.user_id && all ? <a className="link" href={`${base}/utilizatori/${s.user_id}`}>{s.name}</a> : s.contract_id ? <a className="link" href={`${base}/contracte/${s.contract_id}`}>{s.name}</a> : s.name}</dd></div>
              <div><dt>Luna</dt><dd>{periodLabel(s.period)}</dd></div>
              <div><dt>Număr</dt><dd>{s.number ?? <span className="muted">la emitere</span>}</dd></div>
              <div><dt>Linii</dt><dd>{lines.filter((l) => !l.removed).length}{lines.some((l) => l.removed) ? ` (+${lines.filter((l) => l.removed).length} scoase)` : ""}</dd></div>
              <div><dt>Calcul</dt><dd>{s.user_id ? "automat, cu cotele din fișa utilizatorului" : "automat, rapoartele predate în lună"}</dd></div>
            </dl>
            <div className="section">Observații</div>
            <NotesEdit id={s.id} notes={s.notes} canEdit={canEdit && s.status !== "issued"} />
          </section>
          <History log={log} />
      </div>
    </CrmShell>
  );
}
