import { useState } from "react";
import "./PackingPage.css";

const groups = [
  ["旅行證件", ["護照", "錢包（日圓、信用卡）", "航班與交通票券", "住宿確認", "旅遊保險資料"]],
  ["隨身物品", ["雨傘", "太陽眼鏡", "帽子", "口罩", "面紙", "防曬外套", "頸枕"]],
  ["衣服與鞋子", ["衣服", "內衣", "內褲", "襪子", "睡衣", "褲子", "裙子", "外套", "壓縮袋", "拖鞋", "涼鞋（選帶）"]],
  ["保養品", ["防曬", "化妝品", "保養品", "止汗劑", "身體乳液", "梳子"]],
  ["盥洗用品", ["刮鬍刀", "包髮巾", "洗臉機", "電動牙刷", "牙膏", "卸妝油", "卸妝棉", "棉花棒", "洗面乳", "護髮乳", "毛巾", "電臉棒", "洗衣精", "洗衣袋", "指甲剪", "修眉用品"]],
  ["電器與充電", ["吹風機", "離子夾", "手錶充電器", "手機充電器", "360 相機和充電器", "行動電源", "萬國插頭", "平板"]],
  ["藥品", ["止痛藥", "感冒藥", "腸胃藥", "過敏藥", "維他命、鈣", "中藥"]],
  ["行李配件", ["行李秤"]],
  ["雪具與雪衣", ["雪板", "雪鞋", "固定器", "雪板袋", "安全帽", "雪鏡", "滑雪手套", "護具", "雪襪", "內搭褲", "運動內衣", "運動服", "羽絨背心", "雪衣", "雪褲", "護臉"]],
];
const total = groups.reduce((sum, [, items]) => sum + items.length, 0);
const storageKey = "nozawa-2027-packing";

function itemKey(category, item) {
  return `${category}/${item}`;
}

function readPackedItems() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

export default function PackingPage({ onShowTrips }) {
  const [packed, setPacked] = useState(readPackedItems);
  const [storageError, setStorageError] = useState(false);
  const packedCount = groups.reduce((count, [category, items]) =>
    count + items.filter(item => packed.has(itemKey(category, item))).length, 0);

  function toggleItem(key, checked) {
    const next = new Set(packed);
    if (checked) next.add(key);
    else next.delete(key);

    setPacked(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  return (
    <main className="page page--packing view-enter">
      <header className="hero packing-hero">
        <div>
          <h1>行李清單</h1>
          <p className="subtitle">勾選進度儲存在此瀏覽器。</p>
        </div>
        <button type="button" className="view-switch" onClick={onShowTrips}>返回行程</button>
      </header>

      <div className="packing-progress">
        <p role="status">已打包 {packedCount}／{total} 項</p>
        <progress aria-label="打包進度" value={packedCount} max={total} />
        {storageError && <p role="alert">瀏覽器無法儲存，重新開啟清單後，這次的勾選可能會消失。</p>}
      </div>

      {groups.map(([category, items]) => (
        <details className="packing-group" key={category}>
          <summary>
            {category}
            <span>{items.filter(item => packed.has(itemKey(category, item))).length}／{items.length}</span>
          </summary>
          <ul>
            {items.map(item => {
              const key = itemKey(category, item);
              return (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={packed.has(key)}
                      onChange={event => toggleItem(key, event.target.checked)} />
                    <span>{item}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </main>
  );
}
