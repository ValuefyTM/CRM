"use client";

export function LogoutButton({ audience }: { audience: "staff" | "partner" }) {
  return (
    <button
      type="button"
      className="logout"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) });
        location.href = location.pathname.startsWith(audience === "staff" ? "/crm" : "/portal") ? `/${audience === "staff" ? "crm" : "portal"}/login` : "/login";
      }}
    >
      Ieși din cont
    </button>
  );
}
