import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { listPartners } from "@/lib/partners";
import { isAdmin, type Kind } from "@/lib/users";
import { CrmShell } from "@/components/CrmShell";
import { UserForm } from "../UserForm";

export const metadata: Metadata = { title: "Utilizator nou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KINDS: [string, Kind, string, string][] = [
  ["intern", "internal", "Intern", "Echipa VALUEFY și evaluatorii (angajați sau colaboratori externi). Intră în CRM."],
  ["colaborator", "partner", "Colaborator", "O persoană de la o firmă parteneră (broker, agenție…). Intră în Portalul colaboratori."],
  ["client", "client", "Client", "Un client VALUEFY. Intră în Portalul client și își urmărește evaluările."],
];

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ tip?: string; firma?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const options = KINDS.filter(([, k]) => k !== "internal" || isAdmin(user));
  const [tip, kind] = options.find(([t]) => t === sp.tip) ?? options[0];
  const firms = kind === "partner" ? (await listPartners(db)).filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name })) : [];

  return (
    <CrmShell user={user} base={base} active="users" title="Utilizator nou" subtitle="Alege tipul contului, completează datele și trimite invitația pe email">
      <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 18 }}>
        <nav className="segment" aria-label="Tip utilizator">
          {options.map(([t, , label]) => (
            <a key={t} href={`${base}/utilizatori/nou?tip=${t}`} aria-current={t === tip ? "page" : undefined}>{label}</a>
          ))}
        </nav>
        <p className="hint">{options.find(([t]) => t === tip)![3]}</p>
        {kind === "partner" && firms.length === 0 ? (
          <div className="card">
            <h2>Adaugă întâi firma parteneră</h2>
            <p className="hint">Persoanele de la colaboratori aparțin unei firme (sau unui PFA). Creează firma și, în același pas, prima persoană cu acces.</p>
            <div className="actions"><a href={`${base}/utilizatori/firme/nou`} className="btn btnGold">+ Firmă parteneră</a></div>
          </div>
        ) : (
          <>
            {kind === "partner" && <p className="hint">Firma nu e în listă? <a className="rowLink" href={`${base}/utilizatori/firme/nou`}>Adaug-o întâi →</a></p>}
            <UserForm key={kind} kind={kind} base={base} firms={firms} initial={{ partner_id: sp.firma ?? "" }} canMakeOwner={user.role === "owner"} />
          </>
        )}
      </div>
    </CrmShell>
  );
}
