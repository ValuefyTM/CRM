import { err, json, staffApi } from "@/lib/api";
import { isExpert } from "@/lib/expert-cases";
import { portalLookup } from "@/lib/expert-portal";

/** `{ number }`: the case as portal.just.ro has it (for the new-case form). Several when the number is at more courts. */
export async function POST(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  if (!isExpert(a.user)) return err("Modulul este doar pentru experții judiciari.", 403);
  const b = await json(req);
  try {
    const list = await portalLookup(String(b.number ?? ""));
    return list.length ? Response.json({ cases: list }) : err("Dosarul nu a fost găsit pe portal.just.ro.", 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Nu am putut citi portalul.", 502);
  }
}
