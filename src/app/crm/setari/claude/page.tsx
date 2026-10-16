import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { origin } from "@/lib/site";
import { listGrants, mcpAllowed } from "@/lib/mcp-auth";
import { TOOLS } from "@/lib/mcp-tools";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { CopyUrl, RevokeGrant } from "./ClaudeControls";

export const metadata: Metadata = { title: "Conexiuni Claude | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The Claude connector (MCP): its address, how to add it, the active connections and what Claude can read. */
export default async function ClaudePage() {
  const { db, user, base } = await staffPage("settings");
  const allowed = mcpAllowed(user);
  const [grants, o] = await Promise.all([allowed ? listGrants(db, user.id) : Promise.resolve([]), origin()]);
  const url = `${o}/api/mcp`;
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări" subtitle="Conectorul Claude: întrebi în Claude despre comenzi, rapoarte, clienți și facturi">
      <SettingsTabs base={base} active="claude" user={user} />
      {!allowed ? <div className="note">Conectarea Claude la CRM este disponibilă deocamdată doar proprietarului și administratorilor.</div> : (
        <div className="cols">
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <section className="card">
              <h2>Adaugă conectorul în Claude</h2>
              <CopyUrl url={url} />
              <ol className="hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>În claude.ai: <b>Setări → Conectori → Adaugă conector personalizat</b>.</li>
                <li>Nume: <b>CRM VALUEFY</b>, adresa de mai sus. Fără alte setări.</li>
                <li>Apasă <b>Conectează</b>: se deschide CRM-ul și aprobi accesul (dacă nu ești logat, te loghezi întâi).</li>
                <li>Conectorul apare apoi și în aplicația Claude de pe telefon și desktop.</li>
              </ol>
              <p className="hint">Claude poate doar <b>citi</b>. Fiecare întrebare apare în istoricul CRM, iar accesul se oprește de aici oricând.</p>
            </section>
            <section className="card">
              <h2>Conexiuni active <span className="muted">{grants.length}</span></h2>
              {grants.length === 0 ? <div className="empty">Nicio conexiune încă.</div> : (
                <div className="tableWrap">
                  <table className="table">
                    <thead><tr><th>Aplicație</th><th>Conectată</th><th>Ultima folosire</th><th /></tr></thead>
                    <tbody>
                      {grants.map((g) => (
                        <tr key={g.id}>
                          <td>{g.client_name}</td>
                          <td className="muted">{fmtDate(g.created_at, true)}</td>
                          <td className="muted">{g.last_used_at ? fmtDate(g.last_used_at, true) : "—"}</td>
                          <td style={{ textAlign: "right" }}><RevokeGrant id={g.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          <section className="card">
            <h2>Ce poate citi Claude</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {TOOLS.map((t) => <li key={t.name}><b>{t.title}</b><div className="muted" style={{ fontSize: 12.5 }}>{t.description}</div></li>)}
            </ul>
          </section>
        </div>
      )}
    </CrmShell>
  );
}
