// Only reached on hosts other than crm./portal. (e.g. the workers.dev preview address).
export default function Home() {
  return (
    <main className="authMain" style={{ minHeight: "100vh" }}>
      <div className="authBox">
        <h1>VALUEFY</h1>
        <p>Alege aplicația:</p>
        <a href="/crm" className="btn btnNavy">CRM (echipa VALUEFY)</a>
        <a href="/portal" className="btn btnGold">Portal colaboratori</a>
      </div>
    </main>
  );
}
