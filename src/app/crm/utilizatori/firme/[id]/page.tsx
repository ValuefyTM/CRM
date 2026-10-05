import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { getPartner, kindLabel } from "@/lib/partners";
import { history } from "@/lib/history";
import { isAdmin, partnerPeople } from "@/lib/users";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { PartnerForm } from "../PartnerForm";
import { PeoplePanel } from "./PeoplePanel";
import { StatusToggle } from "./StatusToggle";

export const metadata: Metadata = { title: "Firmă parteneră | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function PartnerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nou?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const p = await getPartner(db, id);
  if (!p) notFound();
  const people = await partnerPeople(db, id);
  const log = await history(db, [id, ...people.map((u) => u.id)]);
  const nou = (await searchParams).nou;

  return (
    <CrmShell
      user={user} base={base} active="users" title={p.name}
      subtitle={`Firmă parteneră · ${kindLabel(p.kind)}${p.city ? ` · ${p.city}` : ""} · adăugată ${fmtDate(p.created_at)}`}
      actions={<><a href={`${base}/utilizatori?tab=colaboratori&vezi=firme`} className="btn btnGhost btnSm">← Firme partenere</a><StatusToggle partnerId={p.id} status={p.status} canChange={isAdmin(user)} /></>}
    >
      {nou && (
        <div className={nou === "invitat" ? "okMsg" : "note"}>
          {nou === "invitat" ? "Firma a fost salvată și invitația a fost trimisă pe email." : nou === "neinvitat" ? "Firma a fost salvată, dar emailul de invitație nu a putut fi trimis. Verifică setările de email și retrimite invitația din pagina persoanei." : "Firma a fost salvată. Adaugă persoanele care vor avea acces în portal."}
        </div>
      )}
      {p.status === "suspended" && <div className="note">Firmă suspendată: persoanele ei nu se pot autentifica în portal.</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <PeoplePanel
            base={base}
            partnerId={p.id}
            people={people.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, invitedAt: fmtDate(u.invited_at, true), lastLogin: fmtDate(u.last_login_at, true) }))}
          />
          <PartnerForm
            base={base}
            partnerId={p.id}
            initial={{ name: p.name, kind: p.kind, cui: p.cui ?? "", reg_com: p.reg_com ?? "", email: p.email ?? "", phone: p.phone ?? "", city: p.city ?? "", address: p.address ?? "", notes: p.notes ?? "" }}
          />
        </div>
        <History log={log} />
      </div>
    </CrmShell>
  );
}
