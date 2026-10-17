import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { baseTemplate } from "@/lib/insp-templates";
import { createTemplate, templateList, templateOf } from "@/lib/insp-templates-db";
import { inspChannel, later, syncTemplates } from "@/lib/uvalo";

/** A new sheet: `{ name, from: <sheet key>, model?: true }` copies that sheet (or its VALUEFY model). */
export async function POST(req: Request) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name) return err("Scrie numele fișei.");
  if ((await templateList(a.db)).some((x) => x.name.toLowerCase() === name.toLowerCase())) return err("Există deja o fișă cu acest nume.");
  const made = await createTemplate(a.db, name, typeof b.from === "string" ? b.from : "", b.model === true, a.user.id);
  if (!made) return err("Alege fișa de la care pornești.");
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", made.key, `Fișă nouă: ${name}`);
  if ((await inspChannel(a.db)) === "uvalo") await later(syncTemplates(a.db, made.key));
  const cur = await templateOf(a.db, made.key, made.base);
  return NextResponse.json({ ok: true, key: made.key, base: made.base, name, tpl: cur.tpl, model: baseTemplate(made.base) });
}
