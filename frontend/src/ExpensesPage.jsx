import "./ExpensesPage.css";

export default function ExpensesPage({ onShowTrips }) {
  return (
    <main className="page expenses-page">
      <header className="hero">
        <h1 tabIndex={-1}>野澤滑雪分帳</h1>
        <button type="button" className="view-switch" onClick={onShowTrips}>返回行程</button>
      </header>
      <section className="expense-panel">
        <p>首次加入請使用旅伴 LINE 群組裡的邀請。加入後，用同一個 LINE 帳號開啟帳本。</p>
        <a className="expense-primary" href="https://app.lightsplit.com/" target="_blank" rel="noopener noreferrer">
          開啟 Lightsplit
        </a>
      </section>
    </main>
  );
}
