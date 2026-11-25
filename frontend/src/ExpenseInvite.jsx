import { useState } from "react";
import { inviteRequest } from "./expenseInviteRequest.js";

export function ExpenseInvite({ mode, token, signInUrl, signOutUrl }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(input) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await inviteRequest(input);
      if (mode === "admin") {
        setLink(result.url);
      } else if (mode === "start") {
        window.location.replace(result.signedIn ? "/expenses" : signInUrl);
      } else {
        window.location.replace("/expenses");
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError("");
    } catch {
      setError("無法自動複製，請長按連結欄位手動複製。");
    }
  }

  const message = error && <p className="expense-error" role="alert">{error}</p>;
  if (mode === "admin") {
    return (
      <details className="expense-panel expense-invite">
        <summary>邀請旅伴</summary>
        <p>每個連結可讓一位旅伴加入，24 小時內有效。</p>
        <button type="button" className="expense-primary" disabled={busy} onClick={() => void send({ action: "issue" })}>產生邀請連結</button>
        {link && <div>
          <input aria-label="旅伴邀請連結" readOnly value={link} onFocus={event => event.currentTarget.select()} />
          <button type="button" className="view-switch" onClick={copyLink}>複製連結</button>
          {copied && <p role="status">已複製</p>}
        </div>}
        {message}
      </details>
    );
  }

  if (mode === "start") {
    return (
      <section className="expense-panel">
        <h2>加入野澤旅伴帳本</h2>
        <p>用 Google 帳號登入後，填寫你在分帳名單上的名稱。</p>
        <button type="button" className="expense-primary" disabled={busy}
          onClick={() => void send({ action: "start", token })}>使用 Google 登入並加入</button>
        {message}
      </section>
    );
  }

  return (
    <form className="expense-panel expense-form" onSubmit={event => {
      event.preventDefault();
      const name = new FormData(event.currentTarget).get("name");
      void send({ action: "redeem", name });
    }}>
      <h2>加入旅伴名單</h2>
      <label>顯示名稱<input name="name" maxLength={60} required autoComplete="nickname" /></label>
      <div className="expense-actions">
        <button type="submit" className="expense-primary" disabled={busy}>加入分帳</button>
        <a className="view-switch" href={signOutUrl}>切換 Google 帳號</a>
      </div>
      {message}
    </form>
  );
}
