import type { Metadata } from "next";
import { partnerPage } from "@/lib/guard";
import { getPartner, kindLabel, partnerUsers } from "@/lib/partners";
import { PortalShell } from "@/components/PortalShell";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Contul meu | Portal colaboratori VALUEFY" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { db, user, base } = await partnerPage();
  const partner = await getPartner(db, user.partner_id);
  const team = (await partnerUsers(db, user.partner_id)).filter((u) => u.status !== "disabled");
  return (
    <PortalShell user={user} base={base} active="account" title="Contul meu" subtitle={user.partner_name}>
      <div className="cols">
        <ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email} />
        <section className="card">
          <h2>{user.partner_name}</h2>
          <dl className="dl">
            <div><dt>Tip</dt><dd>{partner ? kindLabel(partner.kind) : "—"}</dd></div>
            {partner?.cui && <div><dt>CUI</dt><dd>{partner.cui}</dd></div>}
            {partner?.city && <div><dt>Localitate</dt><dd>{partner.city}</dd></div>}
          </dl>
          <div className="section">Persoane cu acces</div>
          <ul className="people">
            {team.map((u) => (
              <li key={u.id}>
                <span className="who"><b>{u.name || u.email}{u.id === user.id && <span className="muted"> (tu)</span>}</b><span className="muted">{u.email}</span></span>
                <span className={`pill ${u.status === "active" ? "pillOk" : "pillWarn"}`}><i />{u.status === "active" ? (u.role === "owner" ? "Administrator" : "Activ") : "Invitat"}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Pentru a adăuga sau elimina colegi, scrie-ne la contact@valuefy.ro.</p>
        </section>
      </div>
    </PortalShell>
  );
}
