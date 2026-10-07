"use client";

/** Which of the land book extract (CF) and the floor survey (RLV) the inspector will have. */
export type DocState = { cf: boolean; rlv: boolean };

export const missingOf = (have: DocState) => [!have.cf && "extrasul CF", !have.rlv && "releveul"].filter((x): x is string => !!x);

/**
 * Shown when an inspection is given: the inspector needs at least the CF extract and the floor survey. Without them
 * the task is given only after ticking "Aloc fără ele".
 */
export function DocsConfirm({ have, checked, onChange, hint }: { have: DocState; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const miss = missingOf(have);
  if (!miss.length) return <p className="docsOk">✓ Extrasul CF și releveul sunt încărcate; inspectorul le vede în aplicație.</p>;
  return (
    <div className="docsWarn">
      <p><b>Lipsesc {miss.join(" și ")}.</b> Inspectorul are nevoie de ele la vizionare. {hint ?? "Le poți încărca în dosar, la „Documente & Livrare”; apar singure în aplicația de inspecții."}</p>
      <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>Aloc inspecția fără {miss.length > 1 ? "ele" : miss[0] === "releveul" ? "releveu" : "extrasul CF"}</span></label>
    </div>
  );
}
