"use client";

import type { Ctx } from "./InspApp";
import { Icon, TopBar } from "./ui";

const ROLE: Record<string, string> = { inspector: "Inspector", evaluator: "Evaluator", admin: "Administrator", owner: "Proprietar" };

/** The signed-in inspector: sync and sign out. The sheet templates are edited in the CRM. */
export function AccountView({ ctx }: { ctx: Ctx }) {
  const last = ctx.lastSync ? new Date(ctx.lastSync) : null;
  return (
    <>
      <TopBar title="Contul meu" sub={`${ctx.me.name} · ${ROLE[ctx.me.role] ?? ctx.me.role}`} />
      <div className="iPad">
        <section className="iBox">
          <div className="iKv"><span>Nume</span><b>{ctx.me.name}</b></div>
          <div className="iKv"><span>Email</span><b>{ctx.me.email}</b></div>
          <div className="iKv"><span>Rol</span><b>{ROLE[ctx.me.role] ?? ctx.me.role}</b></div>
        </section>
        <section className="iBox">
          <h3>Sincronizare</h3>
          <div className="iKv"><span>Stare</span><b>{ctx.syncing ? "Se sincronizează…" : ctx.online ? "Online" : "Fără semnal"}</b></div>
          <div className="iKv"><span>Ultima actualizare</span><b>{last ? last.toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</b></div>
          <div className="iKv"><span>De trimis</span><b>{ctx.pending.count}</b></div>
          <button type="button" className="iBtn ghost" onClick={() => ctx.sync()} disabled={ctx.syncing}><Icon.refresh />Sincronizează acum</button>
        </section>
        <section className="iBox">
          <h3>Fișele de inspecție</h3>
          <p className="iText">Inspecțiile și tipul fișei vin din CRM. Întrebările fișelor le stabilesc administratorii VALUEFY în CRM, la Setări → Fișe de inspecție.</p>
        </section>
        <button type="button" className="iBtn ghost danger-text" onClick={() => ctx.logout()}>Ieși din cont</button>
        <p className="hint center">VALUEFY Inspecții</p>
      </div>
    </>
  );
}
