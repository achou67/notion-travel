import { useCallback, useEffect, useState } from "react";
import "./App.css";
import ExpensesPage from "./ExpensesPage.jsx";
import PackingPage from "./PackingPage.jsx";
import ShoppingPage from "./ShoppingPage.jsx";
import TripPage from "./TripPage.jsx";
import { getView } from "./viewRoute.js";
import { clearSnapshot, readSnapshot, saveSnapshot } from "./offline.js";

function App() {
  const [view, setView] = useState(() => getView(window.location.pathname));
  const [saved, setSaved] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  const returnOnline = useCallback(() => {
    setSnapshot(null);
    setFailed(false);
    setMessage("已要求重新讀取線上資料。");
    setRevision(value => value + 1);
  }, []);

  const handleLoadFailure = useCallback(async error => {
    setFailed(true);
    try {
      const stored = await readSnapshot();
      setSaved(stored);
      if (stored && (!navigator.onLine || error instanceof TypeError || error?.name === "TimeoutError")) {
        setSnapshot(stored);
        setMessage("無法連線，已切換為保存的離線版本。");
      }
      if (!stored) setMessage("無法取得線上資料；此裝置尚未保存離線版本，請連網後再試。");
    } catch {
      setMessage("無法讀取離線資料，請檢查瀏覽器儲存空間或連網後重試。");
    }
  }, []);

  useEffect(() => {
    let active = true;
    readSnapshot().then(value => { if (active) setSaved(value); }).catch(() => {
      if (active) setMessage("此瀏覽器無法讀取離線儲存空間。");
    });
    window.addEventListener("online", returnOnline);
    window.addEventListener("offline", handleLoadFailure);
    return () => {
      active = false;
      window.removeEventListener("online", returnOnline);
      window.removeEventListener("offline", handleLoadFailure);
    };
  }, [returnOnline, handleLoadFailure]);

  async function download() {
    setBusy(true);
    setMessage("正在準備離線版本…");
    try {
      const stored = await saveSnapshot(setMessage);
      setSaved(stored);
      if (snapshot) setSnapshot(stored);
      setMessage("離線版本已保存，可開啟飛航模式測試。");
    } catch (error) {
      console.error(error);
      setMessage(`保存失敗：${error.message}。原有離線版本不受影響。`);
    } finally {
      setBusy(false);
    }
  }

  async function removeDownload() {
    setBusy(true);
    try {
      await clearSnapshot();
      setSaved(null);
      setSnapshot(null);
      setFailed(false);
      setRevision(value => value + 1);
      setMessage("已清除此裝置的離線版本。");
    } catch {
      setMessage("清除未完成，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    document.body.dataset.view = view;
    return () => delete document.body.dataset.view;
  }, [view]);

  useEffect(() => {
    function handlePopState() {
      setView(getView(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(nextView) {
    const path = nextView === "trips" ? "/" : `/${nextView}`;
    window.history.pushState({}, "", path);
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pageKey = `${view}-${revision}-${snapshot?.savedAt || "online"}`;

  return (
    <>
      {view !== "expenses" && view !== "shopping" && (snapshot || failed) && <aside className="offline-notice" aria-label="資料連線狀態" aria-live="polite">
        <span>{snapshot ? <><strong>目前使用離線版本</strong> · {new Date(snapshot.savedAt).toLocaleString("zh-TW")}</> : saved ? "線上資料讀取失敗" : "線上資料讀取失敗，且此裝置尚未保存離線版本"}</span>
        {failed && saved && !snapshot && <button type="button" disabled={busy} onClick={() => { setSnapshot(saved); setMessage(""); }}>查看已保存版本</button>}
        <button type="button" disabled={busy} onClick={returnOnline}>重試線上資料</button>
      </aside>}
      {view === "shopping" ? (
        <ShoppingPage onShowTrips={() => navigate("trips")} />
      ) : view === "packing" ? (
        <PackingPage onShowTrips={() => navigate("trips")} />
      ) : view === "expenses" ? (
        <ExpensesPage onShowTrips={() => navigate("trips")} />
      ) : (
        <TripPage key={pageKey} snapshot={snapshot} onLoadFailure={handleLoadFailure} onShowShopping={() => navigate("shopping")} onShowPacking={() => navigate("packing")} onShowExpenses={() => navigate("expenses")} />
      )}
      {view !== "expenses" && view !== "shopping" && <details className="offline-panel">
        <summary>離線使用{saved && <small>已保存</small>}</summary>
        <div className="offline-content">
          <p>連線時優先讀取線上資料；出發前可保存到此裝置，供斷網時查看。</p>
          <p>{saved
            ? `離線版本保存時間：${new Date(saved.savedAt).toLocaleString("zh-TW")}`
            : "出發前先保存，斷網後仍可查看行程、筆記圖片。"}</p>
          {snapshot && <p>離線內容不會自動更新；外部地圖與導航仍需網路。</p>}
          {failed && !snapshot && saved && <p>線上資料讀取失敗，可重試或查看已保存版本。</p>}
          <p role="status" aria-live="polite">{message}</p>
          <div className="offline-actions">
            <button type="button" onClick={download} disabled={busy}>{busy ? "處理中…" : saved ? "更新離線版本" : "儲存供離線使用"}</button>
            {saved && <button type="button" disabled={busy} onClick={removeDownload}>清除離線資料</button>}
          </div>
        </div>
      </details>}
    </>
  );
}

export default App;
