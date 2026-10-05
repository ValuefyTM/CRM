"use client";

/** Dropdown filter for tables: a label and the chosen value in one pill; highlighted when a value is set. */
export function FilterSelect(props: {
  label: string; value: string; options: [value: string, label: string, count?: number][]; onChange: (v: string) => void; all?: string; name?: string;
}) {
  return (
    <label className="fsel" data-on={props.value ? "" : undefined}>
      <span>{props.label}</span>
      <select name={props.name} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">{props.all ?? "Toate"}</option>
        {props.options.map(([v, l, n]) => (
          <option key={v} value={v}>{l}{n != null ? ` (${n.toLocaleString("ro-RO")})` : ""}</option>
        ))}
      </select>
    </label>
  );
}
