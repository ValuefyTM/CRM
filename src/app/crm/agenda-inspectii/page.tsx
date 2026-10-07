import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { BOARD_PERIODS, BOARD_STATES, inspectionBoard, type BoardFilters } from "@/lib/inspections-board";
import { CrmShell } from "@/components/CrmShell";
import { InspectionBoard } from "./InspectionBoard";

export const metadata: Metadata = { title: "Inspecții | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<BoardFilters & { vezi?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const d = await inspectionBoard(db, sp);
  const k = d.counts;
  const link = (change: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = { ...sp, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([a, v]) => `${a}=${encodeURIComponent(v!)}`).join("&");
    return `${base}/agenda-inspectii${qs ? `?${qs}` : ""}`;
  };
  const cards: [string, number, string, string][] = [
    ["De programat", k.toSchedule, "var(--acc-ink)", link({ stare: "deprogramat", perioada: undefined })],
    ["Programate azi", k.today, "var(--ink)", link({ stare: "programate", perioada: "azi" })],
    ["Programate în total", k.scheduled, "var(--muted)", link({ stare: "programate", perioada: undefined })],
    ["Întârziate", k.late, "var(--err)", link({ stare: "intarziate", perioada: undefined })],
    ["Realizate luna aceasta", k.doneMonth, "var(--ok)", link({ stare: "realizate", perioada: "luna" })],
  ];
  return (
    <CrmShell user={user} base={base} active="inspections" title="Inspecții" subtitle="Toate inspecțiile echipei: de programat, programate, realizate · listă, calendar și hartă">
      <div className="dbKpis ibKpis">
        {cards.map(([l, n, c, h]) => (
          <a key={l} className="dbKpi" href={h}>
            <span className="dbKpiLabel"><i style={{ background: c }} />{l}</span>
            <b style={l === "Întârziate" && n > 0 ? { color: "var(--err)" } : undefined}>{n}</b>
          </a>
        ))}
      </div>
      <InspectionBoard base={base} current={sp} rows={d.rows} weekRows={d.weekRows} week={d.week} today={d.today}
        people={d.people} states={BOARD_STATES} periods={BOARD_PERIODS} />
    </CrmShell>
  );
}
