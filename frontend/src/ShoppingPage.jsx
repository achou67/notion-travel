import { useCallback, useEffect, useState } from "react";
import { readShoppingItems, removeShoppingItem, saveShoppingItem, SHOPPING_PREFIX } from "./shoppingStorage.js";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

function readList() {
  try {
    return { items: readShoppingItems(window.localStorage), canRead: true };
  } catch {
    return { items: [], canRead: false };
  }
}

function ShoppingPage({ onShowTrips }) {
  const [{ items, canRead }, setList] = useState(readList);
  const [showPurchased, setShowPurchased] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const refresh = useCallback(() => setList(readList()), []);

  useEffect(() => {
    function handleStorage(event) {
      if (!event.key || event.key.startsWith(SHOPPING_PREFIX)) refresh();
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refresh]);

  function save(id, changes) {
    try {
      const saved = saveShoppingItem(window.localStorage, id, changes);
      setError(saved ? "" : "這筆商品已被移除。");
      refresh();
      return saved;
    } catch {
      setError("無法儲存購物清單，請確認瀏覽器允許儲存網站資料。");
      return false;
    }
  }

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get("name").trim();
    if (!name) {
      setError("請輸入商品名稱。");
      event.currentTarget.elements.namedItem("name").focus();
      return;
    }
    const quantity = form.get("quantity");
    const budget = form.get("budget");
    if (save(draft.id, {
      name,
      store: form.get("store").trim(),
      quantity: quantity === "" ? null : Number(quantity),
      budget: budget === "" ? null : Number(budget),
      notes: form.get("notes").trim()
    })) {
      if (!draft.id) setShowPurchased(false);
      setDraft(null);
    }
  }

  function remove(item) {
    if (!window.confirm(`要刪除「${item.name}」嗎？`)) return;
    try {
      removeShoppingItem(window.localStorage, item.id);
      if (draft?.id === item.id) setDraft(null);
      setError("");
      refresh();
    } catch {
      setError("無法刪除這筆商品，請稍後再試。");
    }
  }

  const purchasedCount = items.filter(item => item.purchased).length;
  const visible = items.filter(item => item.purchased === showPurchased);

  return (
    <main className="page page--shopping view-enter">
      <header className="hero shopping-hero">
        <div>
          <h1 tabIndex={-1}>我的購物清單</h1>
          <p className="subtitle">清單儲存在此瀏覽器。</p>
        </div>
        <button type="button" className="view-switch" onClick={onShowTrips}>返回行程</button>
      </header>

      <div className="shopping-list">
        <div className="shopping-toolbar">
          <div className="shopping-filters" role="group" aria-label="購買狀態">
            <button type="button" aria-pressed={!showPurchased} onClick={() => setShowPurchased(false)}>
              待買 ({items.length - purchasedCount})
            </button>
            <button type="button" aria-pressed={showPurchased} onClick={() => setShowPurchased(true)}>
              已買 ({purchasedCount})
            </button>
          </div>
          <button type="button" className="shopping-primary" disabled={!canRead}
            onClick={() => { setError(""); setDraft({}); }}>新增商品</button>
        </div>

        {(!canRead || error) && <p className="state-card state-card--error" role="alert">
          {error || "無法讀取此瀏覽器的購物清單。"}
        </p>}

        {draft && (
          <form className="shopping-form" key={draft.id ?? "new"} onSubmit={submit}>
            <h2>{draft.id ? "編輯商品" : "新增商品"}</h2>
            <label>商品名稱<input autoFocus required name="name" maxLength={100} defaultValue={draft.name} /></label>
            <label>店家（選填）<input name="store" maxLength={100} defaultValue={draft.store} /></label>
            <div className="shopping-form-numbers">
              <label>數量（選填）
                <input name="quantity" type="number" min="1" max="999" step="1" defaultValue={draft.quantity ?? ""} />
              </label>
              <label>預算 JPY（選填）
                <input name="budget" type="number" min="0" max="99999999" step="1" defaultValue={draft.budget ?? ""} />
              </label>
            </div>
            <label>備註（選填）<textarea name="notes" rows={2} maxLength={500} defaultValue={draft.notes} /></label>
            <div className="shopping-actions">
              <button type="button" className="view-switch" onClick={() => { setError(""); setDraft(null); }}>取消</button>
              <button type="submit" className="shopping-primary">儲存商品</button>
            </div>
          </form>
        )}

        <section aria-label={showPurchased ? "已買商品" : "待買商品"}>
          {canRead && visible.length === 0 && <p className="state-card">{showPurchased ? "還沒有已買商品。" : "目前沒有待買商品。"}</p>}
          {visible.map(item => (
            <article className="shopping-card" key={item.id}>
              <label className="shopping-item-title">
                <input type="checkbox" checked={item.purchased} aria-label={`已買 ${item.name}`}
                  onChange={event => save(item.id, { purchased: event.target.checked })} />
                <span>{item.name}</span>
              </label>
              <div className="shopping-card-meta">
                {item.store && <span className="shopping-badge shopping-badge--store">{item.store}</span>}
                {item.quantity != null && <span className="shopping-badge">{item.quantity} 件</span>}
                {item.budget != null && <span className="shopping-badge">{yen.format(item.budget)}</span>}
              </div>
              {item.notes && <p className="shopping-description">{item.notes}</p>}
              <div className="shopping-actions">
                <button type="button" className="view-switch" aria-label={`編輯 ${item.name}`}
                  onClick={() => { setError(""); setDraft(item); window.scrollTo({ top: 0 }); }}>編輯</button>
                <button type="button" className="view-switch" aria-label={`刪除 ${item.name}`}
                  onClick={() => remove(item)}>刪除</button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export default ShoppingPage;
