import { useEffect, useState } from "react";
import "./ExpensesPage.css";
import { settleExpenses, settleInTwd } from "./expenseSettlement.js";
import { ExpenseInvite } from "./ExpenseInvite.jsx";
import { inviteRequest } from "./expenseInviteRequest.js";

const endpoint = "/.netlify/functions/expenses";
const exchangeRateKey = "nozawa-2027-expense-exchange-rate";
const participantIds = members => members.map(member => member.id);
const newExpense = (members = []) => ({
  title: "", date: "", amount: "", currency: "JPY", payerId: "", participantIds: participantIds(members)
});

function readExchangeRate() {
  try { return window.localStorage.getItem(exchangeRateKey) || ""; } catch { return ""; }
}

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

export default function ExpensesPage({ onShowTrips }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("loading");
  const [inviteToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("invite") || "");
  const [draft, setDraft] = useState(() => newExpense());
  const [exchangeRate, setExchangeRate] = useState(readExchangeRate);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function initialize() {
      try {
        const result = await expenseRequest({ signal: controller.signal });
        if (active) {
          setData(result);
          setDraft(newExpense(result.members));
          setMode("ledger");
        }
      } catch (failure) {
        if (!active) return;
        if (failure.status === 403) {
          const invite = await inviteRequest(null, { signal: controller.signal }).catch(() => null);
          if (!active) return;
          if (invite?.pending && invite.signedIn) {
            setMode("join");
            return;
          }
        }
        const loginError = new URLSearchParams(window.location.search).get("error");
        if (failure.status === 401) {
          if (loginError === "AccessDenied") setError("這個 Google 帳號不在旅伴邀請名單中。");
          else if (loginError) setError("登入未完成，請再試一次。");
          setMode("login");
        } else {
          setError(failure.message);
          setMode(failure.status === 403 ? "login" : "unavailable");
        }
      }
    }

    function onPageShow(event) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    initialize();
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

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
      setDraft(newExpense(data.members));
      setNotice("支出已儲存。");
      try {
        const latest = await expenseRequest();
        setData(latest);
        setDraft(newExpense(latest.members));
      } catch {
        setNotice("支出已儲存。重新整理頁面即可查看最新明細。");
      }
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) {
        setData(null);
        setMode("login");
      }
    } finally {
      setBusy(false);
    }
  }

  const update = (property, value) => setDraft(current => ({ ...current, [property]: value }));
  const memberNames = new Map((data?.members ?? []).map(member => [member.id, member.name]));
  const hasRoster = !!data?.members.length;
  const settlement = data && settleExpenses(data.members, data.expenses);
  const combined = settlement && settleInTwd(settlement, exchangeRate);
  const settlements = combined ? [["TWD", "全用台幣結算", combined]] : [
    ["JPY", "日圓結算", settlement?.JPY], ["TWD", "台幣結算", settlement?.TWD]
  ];
  const signInUrl = "/api/auth/signin?callbackUrl=%2Fexpenses";
  const signOutUrl = "/api/auth/signout?callbackUrl=%2Fexpenses";

  return (
    <main className="page expenses-page">
      <header className="hero">
        <div><h1>野澤滑雪分帳</h1></div>
        <div className="expense-actions">
          <button type="button" className="view-switch" onClick={onShowTrips}>返回行程</button>
          {mode === "ledger" && <a className="view-switch" href={signOutUrl}>登出</a>}
        </div>
      </header>

      {mode === "loading" && <p role="status">正在讀取分帳…</p>}
      {error && <p className="expense-error" role="alert">{error}</p>}
      {notice && <p className="expense-message" role="status">{notice}</p>}

      {mode === "login" && (inviteToken
        ? <ExpenseInvite mode="start" token={inviteToken} signInUrl={signInUrl} />
        : <section className="expense-panel">
          <h2>旅伴登入</h2>
          <p>請使用受邀的 Google 帳號查看帳本或新增支出。</p>
          <a className="expense-primary" href={signInUrl}>使用 Google 登入</a>
        </section>)}
      {mode === "join" && <ExpenseInvite mode="join" signOutUrl={signOutUrl} />}
      {mode === "ledger" && data?.isAdmin && <ExpenseInvite mode="admin" />}

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
                {hasRoster && <button type="button" className="view-switch" disabled={busy || draft.participantIds.length === data.members.length}
                  onClick={() => update("participantIds", participantIds(data.members))}>勾選全部人</button>}
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
                {draft.id && <button type="button" className="view-switch" disabled={busy} onClick={() => setDraft(newExpense(data.members))}>取消編輯</button>}
              </div>
            </form>
            <section className="expense-panel">
              <h2>旅伴與結算</h2>
              {!hasRoster && <p>目前還沒有旅伴。</p>}
              {settlement.excluded > 0 && <p>有 {settlement.excluded} 筆支出缺少有效資料，已暫時排除。</p>}
              <div className="expense-rate expense-form">
                <label>匯率（1 日圓折合多少台幣）
                  <input type="text" inputMode="decimal" maxLength={11} placeholder="例如 0.22" value={exchangeRate}
                    aria-describedby="expense-rate-help" aria-invalid={Boolean(exchangeRate.trim() && !combined)}
                    onChange={event => {
                      const value = event.target.value;
                      setExchangeRate(value);
                      try { window.localStorage.setItem(exchangeRateKey, value); } catch { /* In-memory rate still works. */ }
                    }} />
                </label>
                <p id="expense-rate-help">輸入匯率後，以台幣合併結算。清空即可切回分幣別結算。</p>
                {exchangeRate.trim() && !combined && <p className="expense-error" role="alert">請輸入大於 0 的匯率，最多六位小數。</p>}
              </div>
              <ul className="expense-rows">{data.members.map(member => (
                <li key={member.id}><strong>{member.name}</strong><span>{combined
                  ? balanceLabel(combined.balances.get(member.id), "TWD")
                  : `${balanceLabel(settlement.JPY.balances.get(member.id), "JPY")} · ${balanceLabel(settlement.TWD.balances.get(member.id), "TWD")}`}</span></li>
              ))}</ul>
              {settlements.map(([currency, title, { transfers }]) => (
                <div key={currency}>
                  <h3>{title}</h3>
                  {transfers.length ? (
                    <ul className="expense-rows">{transfers.map(({ from, to, amount }) => (
                      <li key={from + "/" + to}><strong>{memberNames.get(from)} → {memberNames.get(to)}</strong><span>{formatMoney(amount, currency)}</span></li>
                    ))}</ul>
                  ) : <p>目前沒有需要轉帳的金額。</p>}
                </div>
              ))}
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
