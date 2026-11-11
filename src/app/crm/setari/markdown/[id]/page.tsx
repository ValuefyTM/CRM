import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";

export const metadata: Metadata = { title: "Raport ca Markdown | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** One report read into Markdown: the text as it will be searched and handed to an agent, and the facts. */
export default async function MarkdownReport({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("settings");
  if (user.role !== "owner") notFound();
  const { id } = await params;
  const m = await db.prepare(`SELECT m.markdown, m.facts, m.model, m.input_tokens, m.output_tokens, m.cost_usd, r.number, r.label FROM report_markdown m JOIN reports r ON r.id = m.report_id WHERE m.report_id = ?`)
    .bind(id).first<{ markdown: string | null; facts: string | null; model: string; input_tokens: number | null; output_tokens: number | null; cost_usd: number | null; number: string | null; label: string | null }>();
  if (!m?.markdown) notFound();
  let facts = "";
  try { facts = JSON.stringify(JSON.parse(m.facts ?? "{}"), null, 2); } catch { facts = m.facts ?? ""; }
  return (
    <CrmShell user={user} base={base} active="settings" title={`Raport ${m.number ?? ""} ca Markdown`} subtitle={`${m.label ?? ""} · ${m.model} · ${m.input_tokens ?? 0} + ${m.output_tokens ?? 0} tokeni · $${(m.cost_usd ?? 0).toFixed(3)}`}
      back={{ href: `${base}/setari/markdown`, label: "Pilot Markdown" }}>
      <div className="mdView">
        <section className="card"><div className="cardHead"><h2>Markdown</h2><a className="link" href={`${base}/rapoarte/${id}`}>Deschide raportul →</a></div><pre className="mdPre">{m.markdown}</pre></section>
        <section className="card"><h2>Date cheie (JSON)</h2><pre className="mdPre small">{facts}</pre></section>
      </div>
    </CrmShell>
  );
}
