"use client";

/**
 * A table row that opens `href` when clicked anywhere (links, buttons and fields inside keep their own action;
 * Ctrl/⌘-click or the middle button open it in a new tab; selecting text does not navigate).
 */
export function ClickRow({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const inner = (t: EventTarget) => !!(t as HTMLElement).closest("a, button, input, select, textarea, label");
  return (
    <tr
      className={["rowClick", className].filter(Boolean).join(" ")}
      onClick={(e) => {
        if (inner(e.target) || window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else location.href = href;
      }}
      onAuxClick={(e) => { if (e.button === 1 && !inner(e.target)) window.open(href, "_blank"); }}
    >
      {children}
    </tr>
  );
}
