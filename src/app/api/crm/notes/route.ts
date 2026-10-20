import { err, json, reportApi, staffApi } from "@/lib/api";
import { linkNote, parentChoices } from "@/lib/notes";

/** The reports of a client a note can belong to: `?client=` (and `&not=` the note itself). */
export async function GET(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  const sp = new URL(req.url).searchParams;
  const client = sp.get("client") ?? "";
  if (!client) return Response.json({ results: [] });
  return Response.json({ results: await parentChoices(a.db, client, sp.get("not") ?? undefined) });
}

/** Links a note to its initial report: `{ note, parent }` (`parent` empty: unlinks). */
export async function PATCH(req: Request) {
  const b = await json(req);
  const note = typeof b.note === "string" ? b.note : "";
  if (!note) return err("Alege nota.");
  const a = await reportApi(note, "edit", true);
  if ("res" in a) return a.res;
  const r = await linkNote(a.db, a.user.id, note, typeof b.parent === "string" && b.parent ? b.parent : null);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
