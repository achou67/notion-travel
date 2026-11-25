import { useEffect, useState } from "react";
import { defaultPackingList, editPackingItem, packingKey, readPackingList, savePackingList } from "./packingStorage.js";
import "./PackingPage.css";

function loadList() {
  try {
    return { groups: readPackingList(window.localStorage), error: "" };
  } catch {
    return { groups: defaultPackingList(), error: "無法讀取此瀏覽器的行李清單，目前顯示預設範本。" };
  }
}

export default function PackingPage({ onShowTrips }) {
  const [{ groups, error }, setList] = useState(loadList);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = groups.flatMap(group => group.items);
  const packedCount = items.filter(item => item.checked).length;

  useEffect(() => {
    function syncStorage(event) {
      if (event.key === packingKey || event.key === null) setList(loadList());
    }
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  async function save(update) {
    try {
      const write = () => savePackingList(window.localStorage, update);
      const next = navigator.locks ? await navigator.locks.request(packingKey, write) : write();
      setList({ groups: next, error: "" });
      return true;
    } catch {
      setList({ ...loadList(), error: "無法儲存修改。請確認瀏覽器允許儲存網站資料，再試一次。" });
      return false;
    }
  }

  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = fields.get("name").trim();
    if (!name) {
      const input = event.currentTarget.elements.namedItem("name");
      input.setCustomValidity("請輸入名稱");
      input.reportValidity();
      return;
    }

    setBusy(true);
    const id = crypto.randomUUID();
    const saved = await save(current => {
      if (form.type === "item") {
        return editPackingItem(current, form.groupId, fields.get("category") || form.groupId, form.id, name, id);
      }
      return form.id
        ? current.map(group => group.id === form.id ? { ...group, name } : group)
        : [...current, { id, name, items: [] }];
    });
    setBusy(false);
    if (saved) setForm(null);
  }

  function toggle(groupId, itemId, checked) {
    const update = current => current.map(group => group.id === groupId
      ? { ...group, items: group.items.map(item => item.id === itemId ? { ...item, checked } : item) }
      : group);
    setList(current => ({ ...current, groups: update(current.groups) }));
    void save(update);
  }

  function removeItem(groupId, itemId) {
    void save(current => current.map(group => group.id === groupId
      ? { ...group, items: group.items.filter(item => item.id !== itemId) }
      : group));
    if (form?.id === itemId) setForm(null);
  }

  function removeGroup(group) {
    if (!window.confirm(`刪除「${group.name}」和其中的 ${group.items.length} 個項目？`)) return;
    void save(current => current.filter(item => item.id !== group.id));
    if (form?.id === group.id || form?.groupId === group.id) setForm(null);
  }

  async function restoreDefaults() {
    if (!window.confirm("確定還原預設清單？這會清除這個瀏覽器的所有自訂分類、物品和打包勾選。")) return;
    setBusy(true);
    const restored = await save(() => defaultPackingList());
    setBusy(false);
    if (restored) {
      setForm(null);
      setEditing(false);
    }
  }

  function renderForm() {
    return (
      <form className="packing-edit-form" key={`${form.type}-${form.groupId ?? ""}-${form.id ?? "new"}`} onSubmit={submit}>
        <label>
          {form.type === "item" ? "物品名稱" : "分類名稱"}
          <input name="name" defaultValue={form.name ?? ""} required maxLength={100} autoFocus
            onInput={event => event.currentTarget.setCustomValidity("")} />
        </label>
        {form.type === "item" && form.id && <label>
          所屬分類
          <select name="category" defaultValue={form.groupId}>
            {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>}
        <div className="packing-actions">
          <button type="button" className="view-switch" onClick={() => setForm(null)} disabled={busy}>取消</button>
          <button type="submit" className="view-switch" disabled={busy}>儲存</button>
        </div>
      </form>
    );
  }

  return (
    <main className="page page--packing view-enter">
      <header className="hero packing-hero">
        <div>
          <h1>行李清單</h1>
          <p className="subtitle">清單與打包進度儲存在此瀏覽器。</p>
        </div>
        <button type="button" className="view-switch" onClick={onShowTrips}>返回行程</button>
      </header>

      <div className="packing-progress">
        <p role="status">已打包 {packedCount}／{items.length} 項</p>
        <progress aria-label="打包進度" value={packedCount} max={Math.max(items.length, 1)} />
        {error && <p role="alert">{error}</p>}
      </div>

      <div className="packing-actions packing-toolbar">
        <button type="button" className="view-switch" disabled={busy}
          onClick={() => { setEditing(!editing); setForm(null); }}>
          {editing ? "完成編輯" : "編輯清單"}
        </button>
        {editing && <button type="button" className="view-switch" disabled={busy}
          onClick={() => setForm({ type: "group" })}>新增分類</button>}
      </div>

      {form?.type === "group" && !form.id && renderForm()}
      {!groups.length && <p className="state-card">行李清單目前沒有分類。</p>}
      {groups.map(group => (
        <details className="packing-group" key={group.id}>
          <summary>
            {group.name}
            <span>{group.items.filter(item => item.checked).length}／{group.items.length}</span>
          </summary>
          {editing && (
            <div className="packing-actions packing-group-actions">
              <button type="button" className="view-switch" disabled={busy}
                onClick={() => setForm({ type: "item", groupId: group.id })}>新增物品</button>
              <button type="button" className="view-switch" disabled={busy}
                onClick={() => setForm({ type: "group", id: group.id, name: group.name })}>改分類名稱</button>
              <button type="button" className="view-switch" disabled={busy}
                onClick={() => removeGroup(group)}>刪除分類</button>
            </div>
          )}
          {form?.type === "group" && form.id === group.id && renderForm()}
          {form?.type === "item" && form.groupId === group.id && renderForm()}
          {!group.items.length && <p className="packing-empty">這個分類目前沒有物品。</p>}
          <ul>
            {group.items.map(item => (
              <li className="packing-item" key={item.id}>
                <label className="packing-item-label">
                  <input type="checkbox" checked={item.checked}
                    onChange={event => toggle(group.id, item.id, event.target.checked)} />
                  <span>{item.name}</span>
                </label>
                {editing && (
                  <div className="packing-actions">
                    <button type="button" className="view-switch" aria-label={`編輯 ${item.name}`} disabled={busy}
                      onClick={() => setForm({ type: "item", groupId: group.id, id: item.id, name: item.name })}>編輯</button>
                    <button type="button" className="view-switch" aria-label={`刪除 ${item.name}`} disabled={busy}
                      onClick={() => removeItem(group.id, item.id)}>刪除</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
      {editing && (
        <details className="packing-group">
          <summary>清單還原</summary>
          <p className="packing-empty">還原後會重新載入預設範本，並清除這個瀏覽器的自訂內容與打包勾選。</p>
          <div className="packing-actions packing-group-actions">
            <button type="button" className="view-switch" onClick={restoreDefaults} disabled={busy}>還原預設清單</button>
          </div>
        </details>
      )}
    </main>
  );
}
