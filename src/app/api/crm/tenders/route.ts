import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { runTenders } from "@/lib/tenders";

/** "Verifică acum": reads SEAP for the last days right away (owner / admins). `{ days }`, at most 14. */
export async function POST(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const days = Math.min(14, Math.max(1, Number((await json(req)).days) || 3));
  const r = await runTenders(a.db, days, true);
  await audit(a.db, `user:${a.user.id}`, "tenders.run", "tenders", "sicap", `${r.info.fetched} anunțuri citite, ${r.info.added} noi`);
  if (!r.info.ok) return err(r.info.error ?? "SEAP nu a răspuns.", 502);
  return Response.json(r.info);
}
