import { useEffect, useState } from "react";
import { acceptInvite, handleAuthCallback, login, logout, requestPasswordRecovery, updateUser } from "@netlify/identity";
import "./ExpensesPage.css";

const endpoint = "/.netlify/functions/expenses";
const newExpense = () => ({
  title: "", date: "", amount: "", currency: "JPY", payerId: "", participantIds: []
});

async function expenseRequest(options = {}) {
  const response = await fetch(endpoint, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error || "無法連線到分帳服務，請稍後再試。");
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatMoney(amount, currency) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
}

function balanceLabel(amount, currency) {
  if (amount === null) return "尚未結算";
  if (!amount) return formatMoney(0, currency);
  return `${amount > 0 ? "應收" : "應付"} ${formatMoney(Math.abs(amount), currency)}`;
}

let pendingCallback;

function readCallback() {
  return pendingCallback ??= handleAuthCallback().finally(() => { pendingCallback = null; });
}

export default function ExpensesPage({ onShowTrips }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("loading");
  const [inviteToken, setInviteToken] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState(newExpense);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function initialize() {
      try {
        const callback = await readCallback();
        if (!active) return;
        if (callback) window.history.replaceState(null, "", "/expenses");
        if (callback?.type === "invite" && callback.token) {
          setInviteToken(callback.token);
          setMode("invite");
          return;
        }
        if (callback?.type === "recovery") {
          setMode("recovery");
          return;
        }
        const result = await expenseRequest({ signal: controller.signal });
        if (active) {
          setData(result);
          setMode("ledger");
        }
      } catch (failure) {
        if (!active) return;
        if (failure.status !== 401) setError(failure.status
          ? failure.message
          : "無法處理登入連結或連線，請重新開啟邀請信或再試一次。");
        setMode("login");
      }
    }

    initialize();
    return () => { active = false; controller.abort(); };
  }, []);

  async function authenticate(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = fields.get("password");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        await requestPasswordRecovery(email.trim());
        setNotice("如果帳號已啟用，你會收到重設密碼郵件。");
        setMode("login");
        return;
      }
      if (mode === "invite") await acceptInvite(inviteToken, password);
      else if (mode === "recovery") await updateUser({ password });
      else await login(email.trim(), password);
      setInviteToken("");
      setMode("login");
      setData(await expenseRequest());
      setMode("ledger");
    } catch (failure) {
      setError(failure.status === 403 ? failure.message : "登入或設定密碼未完成，請確認資料和連結是否有效。");
    } finally {
      setBusy(false);
    }
  }

  async function saveExpense(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await expenseRequest({
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, amount: Number(draft.amount) })
      });
      setDraft(newExpense());
      setNotice("支出已儲存。");
      try {
        setData(await expenseRequest());
      } catch {
        setNotice("支出已儲存。重新整理頁面即可查看最新明細。");
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    setNotice("");
    setData(null);
    setDraft(newExpense());
    try {
      await logout();
    } catch {
      setError("登出服務未回應，請關閉頁面後再開啟確認。");
    } finally {
      setMode("login");
      setBusy(false);
    }
  }

  const update = (property, value) => setDraft(current => ({ ...current, [property]: value }));
  const memberNames = new Map((data?.members ?? []).map(member => [member.id, member.name]));
  const hasRoster = !!data?.members.length;
  const loginAction = { login: "登入", invite: "接受邀請", recovery: "設定新密碼", forgot: "寄送重設連結" };

  return (
    <main className="page expenses-page">
      <header className="hero">
        <div><h1>野澤滑雪分帳</h1></div>
        <div className="expense-actions">
          <button type="button" className="view-switch" onClick={onShowTrips}>返回行程</button>
          {mode === "ledger" && <button type="button" className="view-switch" onClick={signOut} disabled={busy}>登出</button>}
        </div>
      </header>

      {mode === "loading" && <p role="status">正在讀取分帳…</p>}
      {error && <p className="expense-error" role="alert">{error}</p>}
      {notice && <p className="expense-message" role="status">{notice}</p>}

      {mode !== "loading" && mode !== "ledger" && (
        <form className="expense-panel expense-form" onSubmit={authenticate}>
          <h2>{loginAction[mode]}</h2>
          {mode === "login" && <p>使用受邀的電子郵件登入。</p>}
          {(mode === "login" || mode === "forgot") && <label>電子郵件
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>}
          {mode !== "forgot" && <label>{mode === "login" ? "密碼" : "新密碼"}
            <input key={mode} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? undefined : 8} required />
          </label>}
          <div className="expense-actions">
            <button type="submit" className="expense-primary" disabled={busy}>{busy ? "處理中…" : loginAction[mode]}</button>
            {(mode === "login" || mode === "forgot") && <button type="button" className="view-switch" disabled={busy}
              onClick={() => { setError(""); setMode(mode === "login" ? "forgot" : "login"); }}>
              {mode === "login" ? "忘記密碼" : "返回登入"}
            </button>}
          </div>
        </form>
      )}

      {mode === "ledger" && data && (
        <div className="expense-grid">
          <div className="expense-stack">
            <form id="expense-form" className="expense-panel expense-form" onSubmit={saveExpense}>
              <h2>{draft.id ? "編輯支出" : "新增支出"}</h2>
              {!hasRoster && <p>請在 Notion「旅伴與結算」新增同行者，再重新整理。</p>}
              <label>品項<input value={draft.title} onChange={e => update("title", e.target.value)} maxLength={120} required /></label>
              <div className="expense-fields">
                <label>金額<input type="number" inputMode="decimal" min={draft.currency === "JPY" ? 1 : 0.01} max="100000000"
                  step={draft.currency === "JPY" ? 1 : 0.01} value={draft.amount ?? ""} onChange={e => update("amount", e.target.value)} required /></label>
                <label>幣別<select value={draft.currency} onChange={e => update("currency", e.target.value)}>
                  <option value="JPY">日圓 JPY</option><option value="TWD">台幣 TWD</option>
                </select></label>
              </div>
              <label>日期（選填）<input type="date" value={draft.date} onChange={e => update("date", e.target.value)} /></label>
              <label>付款人<select value={draft.payerId} onChange={e => update("payerId", e.target.value)} required>
                <option value="">選擇付款人</option>
                {data.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select></label>
              <fieldset>
                <legend>分攤人（平分）</legend>
                {data.members.map(member => (
                  <label key={member.id} className="expense-checkbox">
                    <input type="checkbox" checked={draft.participantIds.includes(member.id)}
                      onChange={event => update("participantIds", event.target.checked
                        ? [...draft.participantIds, member.id]
                        : draft.participantIds.filter(id => id !== member.id))} />
                    {member.name}
                  </label>
                ))}
              </fieldset>
              <div className="expense-actions">
                <button type="submit" className="expense-primary" disabled={busy || !hasRoster || !draft.participantIds.length}>
                  {busy ? "處理中…" : "儲存支出"}
                </button>
                {draft.id && <button type="button" className="view-switch" disabled={busy} onClick={() => setDraft(newExpense())}>取消編輯</button>}
              </div>
            </form>
            <section className="expense-panel">
              <h2>旅伴與結算</h2>
              {!hasRoster && <p>目前還沒有旅伴。</p>}
              <ul className="expense-rows">{data.members.map(member => (
                <li key={member.id}><strong>{member.name}</strong><span>{balanceLabel(member.jpy, "JPY")} · {balanceLabel(member.twd, "TWD")}</span></li>
              ))}</ul>
            </section>
          </div>

          <section className="expense-panel">
            <h2>支出明細</h2>
            {!data.expenses.length && <p>目前還沒有支出。</p>}
            <ul className="expense-rows">{data.expenses.map(expense => (
              <li key={expense.id}>
                <strong>{expense.title} · {["JPY", "TWD"].includes(expense.currency) ? formatMoney(expense.amount, expense.currency) : "幣別待補"}</strong>
                <span>{[expense.date, memberNames.get(expense.payerId) && `${memberNames.get(expense.payerId)} 付款`].filter(Boolean).join(" · ")}</span>
                {!!expense.participantIds.length && <span>分攤 {expense.participantIds.map(id => memberNames.get(id)).filter(Boolean).join("、")}</span>}
                {expense.status && expense.status !== "可結算" && <span>{expense.status}</span>}
                {expense.canEdit && <button type="button" className="view-switch" disabled={busy} onClick={() => {
                  setDraft(expense);
                  setError("");
                  setNotice("");
                  document.getElementById("expense-form").scrollIntoView();
                }}>編輯</button>}
              </li>
            ))}</ul>
          </section>
        </div>
      )}
    </main>
  );
}
