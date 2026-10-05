"use client";

export function LogoutButton({ app }: { app: "crm" | "portal" }) {
  return (
    <button
      type="button"
      className="logout"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app }) });
        location.href = location.pathname.startsWith(`/${app}`) ? `/${app}/login` : "/login";
      }}
    >
      Ieși din cont
    </button>
  );
}
