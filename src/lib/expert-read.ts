// Server-only: the appointment decision („încheierea de ședință” that names the expert) read by a cheap model (Claude
// Haiku 5.5) into the fields of a new case: the case, the parties, the objectives (the court's and the parties'), the
// provisional fee, the next hearing. The expert checks the form before saving; nothing is saved from here.
import Anthropic from "@anthropic-ai/sdk";

export const readAvailable = () => !!process.env.ANTHROPIC_API_KEY;
const model = () => process.env.EXPERT_READ_MODEL?.trim() || "claude-haiku-5-5";
export const MAX_READ = 12 * 1024 * 1024;

// only plain strings (the API allows few optional / union fields): "" where the decision does not say
const str = { type: "string" } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const SCHEMA = obj({
  este_incheiere_de_numire: str, numar_dosar: str, instanta: str, sectia: str, complet: str, obiect: str, data_sedintei: str, specializarea: str, expert_numit: str, bun_expertizat: str,
  onorariu_provizoriu: str, onorariu_in_sarcina: str, termen_plata_onorariu: str, urmatorul_termen: str, ora_termen: str, sala: str, termen_depunere_raport: str,
  parti: { type: "array", items: obj({ calitate: str, nume: str, avocat: str }) },
  obiective: { type: "array", items: obj({ text: str, stabilit_de: str }) },
  observatii: str,
});

const PROMPT = `Documentul atașat este o încheiere de ședință a unei instanțe din România, prin care se dispune o expertiză tehnică judiciară și se numește expertul.
Extrage datele pentru evidența dosarului, exact cum scrie în document (text gol „” unde nu scrie; nu deduce și nu completa din afară):
- numar_dosar (ex. „38331/325/2024”), instanta, sectia, complet (dacă apare), obiect (obiectul cauzei);
- data_sedintei și urmatorul_termen ca AAAA-LL-ZZ; ora_termen ca HH:MM; sala;
- specializarea expertizei, expert_numit (numele expertului desemnat), bun_expertizat (bunul sau lucrul supus expertizei, dacă e descris);
- onorariu_provizoriu doar cu cifre, în lei; onorariu_in_sarcina (partea care îl plătește); termen_plata_onorariu (ex. „5 zile”); termen_depunere_raport (cum scrie, ex. „cu cel puțin 10 zile înaintea termenului”);
- parti: fiecare parte cu calitatea ei („Reclamant”, „Pârât”, „Intervenient”…, la forma de masculin singular) și numele complet; avocat dacă apare;
- obiective: fiecare obiectiv al expertizei, cu textul integral, câte unul pe element. stabilit_de: „instanța” pentru cele fixate de instanță (din oficiu sau încuviințate ca atare), altfel partea care l-a propus (ex. „reclamant”, „pârât”). Obiectivul principal al instanței vine primul;
- observatii: alte dispoziții pentru expert, pe scurt (ex. unde se comunică, ce trebuie depus);
- este_incheiere_de_numire: „da” dacă documentul chiar numește un expert, altfel „nu”.`;

export type ReadResult = {
  number: string; court: string; section: string; panel: string; object: string; appointed_on: string; specialty: string; expert: string; property: string; fee_prov: string; fee_by: string; fee_due: string;
  next_hearing: string; next_time: string; room: string; filing: string; parties: { role: string; name: string; lawyer: string }[]; objectives: { text: string; by: string }[]; notes: string; appoints: boolean;
};

const s = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v: unknown) => { const t = s(v); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ""; };
const time = (v: unknown) => { const m = /^(\d{1,2})[:.](\d{2})/.exec(s(v)); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Reads the decision (a PDF). Returns the fields, or an error for the page. */
export async function readAppointment(pdf: ArrayBuffer): Promise<{ ok: true; data: ReadResult } | { ok: false; error: string }> {
  if (!readAvailable()) return { ok: false, error: "Citirea automată nu este configurată (lipsește ANTHROPIC_API_KEY)." };
  if (pdf.byteLength > MAX_READ) return { ok: false, error: "Fișierul este prea mare pentru citirea automată (cel mult 12 MB)." };
  try {
    const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
    const msg = await client.messages.create({
      model: model(), max_tokens: 6000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
        { type: "text", text: PROMPT },
      ] }],
    });
    if (msg.stop_reason === "refusal") return { ok: false, error: "Modelul a refuzat citirea documentului." };
    const text = msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
    const j = JSON.parse(text) as Record<string, unknown>;
    const fee = s(j.onorariu_provizoriu).replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
    return { ok: true, data: {
      number: s(j.numar_dosar, 60).replace(/^(dosar\s*)?nr\.?\s*/i, ""), court: s(j.instanta, 160), section: s(j.sectia, 160), panel: s(j.complet, 40), object: cap(s(j.obiect, 240)), appointed_on: date(j.data_sedintei),
      specialty: cap(s(j.specializarea, 160)), expert: s(j.expert_numit, 160), property: s(j.bun_expertizat, 500), fee_prov: Number(fee) > 0 ? String(Number(fee)) : "", fee_by: s(j.onorariu_in_sarcina, 160),
      fee_due: s(j.termen_plata_onorariu, 80), next_hearing: date(j.urmatorul_termen), next_time: time(j.ora_termen), room: s(j.sala, 40), filing: s(j.termen_depunere_raport, 200),
      parties: arr(j.parti).map((p) => ({ role: cap(s(p.calitate, 60)) || "Altă parte", name: s(p.nume, 200), lawyer: s(p.avocat, 200) })).filter((p) => p.name).slice(0, 20),
      objectives: arr(j.obiective).map((o) => ({ text: s(o.text, 1500), by: s(o.stabilit_de, 80) || "instanța" })).filter((o) => o.text).slice(0, 30),
      notes: s(j.observatii, 1500), appoints: s(j.este_incheiere_de_numire).toLowerCase().startsWith("da"),
    } };
  } catch (e) {
    console.error("expert read", e);
    return { ok: false, error: "Nu am putut citi încheierea. Completează datele de mână sau încearcă din nou." };
  }
}
