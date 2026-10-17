import { err, json, staffApi } from "@/lib/api";
import { resetContractTemplate, saveContractTemplate } from "@/lib/contract-template-db";

/** Saves the contract model (Setări → Model contract): `{ general, annex1, annex2 }` in HTML with {{variables}}. */
export async function PUT(req: Request) {
  const a = await staffApi("settings.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  if (typeof b.general !== "string" || typeof b.annex1 !== "string" || typeof b.annex2 !== "string") return err("Modelul nu este complet.");
  if (!b.general.trim() || !b.annex1.trim() || !b.annex2.trim()) return err("Nicio parte a contractului nu poate rămâne goală.");
  await saveContractTemplate(a.db, a.user, b);
  return Response.json({ ok: true });
}

/** Back to the standard model. */
export async function DELETE() {
  const a = await staffApi("settings.E", true);
  if ("res" in a) return a.res;
  await resetContractTemplate(a.db, a.user);
  return Response.json({ ok: true });
}
