import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { getFirm } from "@/lib/settings";
import { getStatement, KIND_LABEL, linesOf, linesWith, memberReports, periodLabel, STATUS_LABEL, totalOf } from "@/lib/statements";
import { LinesTable, lei2 } from "../../LinesTable";

export const metadata: Metadata = { title: "Borderou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** A printable statement (the browser's "Save as PDF"). */
export default async function StatementPrint({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("statements");
  const { id } = await params;
  const s = await getStatement(db, id);
  if (!s) notFound();
  const self = !can(user, "statements.all") && s.user_id !== user.id;
  if (self && !can(user, "statements.lead")) redirect(`${base}/borderouri`);
  const [allLines, firm] = await Promise.all([linesOf(db, s), getFirm(db)]);
  // "Profitabilitatea lui": only the lines on the user's reports
  const lines = self ? linesWith(allLines, await memberReports(db, user.id)) : allLines;
  if (self && !lines.length) redirect(`${base}/borderouri`);
  const total = self || s.status === "open" ? totalOf(lines) : s.total ?? totalOf(lines);
  return (
    <main className="stPrintPage">
      <header>
        <div><b>{firm.name}</b>{firm.cui && <div className="muted">CUI {firm.cui}</div>}</div>
        <div style={{ textAlign: "right" }}>
          <h1>Borderou {s.number ?? ""}</h1>
          <div>{KIND_LABEL[s.kind]} · {periodLabel(s.period)}</div>
          <div className="muted">{STATUS_LABEL[s.status][0]}{s.status === "issued" && s.issued_on ? ` · emis ${fmtDate(s.issued_on)}` : s.status === "validated" ? ` · validat ${fmtDate(s.validated_at)}, neemis` : " · în curs, neînghețat"}</div>
        </div>
      </header>
      <p><b>{s.kind === "payout" ? "Beneficiar" : "Client"}:</b> {s.name}{s.sub ? ` · ${s.sub}` : ""}</p>
      <LinesTable lines={lines} base={base} statement={s.id} canEdit={false} print />
      <p className="stGrand">Total: <b>{lei2(total)}</b></p>
      {s.notes && <p><b>Observații:</b> {s.notes}</p>}
      <p className="muted" style={{ fontSize: 11 }}>Generat din CRM {fmtDate(new Date().toISOString(), true)}.</p>
      <script dangerouslySetInnerHTML={{ __html: "setTimeout(function(){window.print()},400)" }} />
    </main>
  );
}
