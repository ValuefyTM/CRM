"use client";
// The month's figures and statements seen through one administrator: only the reports they were in the team of.
export function MemberFilter({ value, choices, period, here }: { value: string; choices: { id: string; name: string }[]; period: string; here: string }) {
  return (
    <label className="stFilter">
      <span>Doar unde a fost în echipă</span>
      <select className="select" value={value} aria-label="Filtru administrator" onChange={(e) => { location.href = `${here}?luna=${period}${e.target.value ? `&evaluator=${e.target.value}` : ""}`; }}>
        <option value="">— toată firma —</option>
        {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}
