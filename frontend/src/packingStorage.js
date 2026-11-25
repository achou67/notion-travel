// Snapshot of the trip's Notion packing template.
const defaults = [
  ["旅行證件", ["護照", "錢包（日圓、信用卡）", "航班與交通票券", "住宿確認", "旅遊保險資料"]],
  ["隨身物品", ["雨傘", "太陽眼鏡", "帽子", "口罩", "面紙", "防曬外套", "頸枕"]],
  ["衣服與鞋子", ["上衣", "褲子/裙子", "內衣/內褲", "襪子", "睡衣", "外套", "壓縮袋", "拖鞋", "涼鞋（選帶）"]],
  ["保養品", ["防曬", "化妝品", "保養品", "止汗劑", "身體乳液", "梳子"]],
  ["盥洗用品", ["刮鬍刀", "包髮巾", "洗臉機", "電動牙刷", "牙膏", "卸妝油", "卸妝棉", "棉花棒", "洗面乳", "護髮乳", "毛巾", "洗衣精", "洗衣袋", "指甲剪", "修眉用品"]],
  ["電器與充電", ["吹風機", "離子夾", "手錶充電器", "手機充電器", "360 相機和充電器", "行動電源", "萬國插頭", "平板"]],
  ["藥品", ["止痛藥", "感冒藥", "腸胃藥", "過敏藥", "維他命、鈣鎂鋅", "肌酸、高蛋白", "酸痛貼布"]],
  ["行李配件", ["行李秤"]],
  ["雪具與雪衣", ["雪板", "雪鞋", "固定器", "雪板袋/餃子皮", "安全帽", "雪鏡", "滑雪手套", "護具", "雪襪", "內搭褲", "運動服/運動內衣", "羽絨背心", "雪衣", "雪褲", "護臉面罩"]],
];

export const packingKey = "nozawa-2027-packing-list";
const legacyKey = "nozawa-2027-packing";
const oldNames = {
  "上衣": ["衣服"],
  "褲子/裙子": ["褲子", "裙子"],
  "內衣/內褲": ["內衣", "內褲"],
  "維他命、鈣鎂鋅": ["維他命、鈣"],
  "雪板袋/餃子皮": ["雪板袋"],
  "運動服/運動內衣": ["運動服", "運動內衣"],
  "護臉面罩": ["護臉"]
};

export function defaultPackingList(previouslyPacked = []) {
  const legacy = new Set(previouslyPacked);
  return defaults.map(([name, names], groupIndex) => {
    const remaining = new Set(
      previouslyPacked.filter(key => typeof key === "string" && key.startsWith(name + "/"))
        .map(key => key.slice(name.length + 1))
    );
    const items = names.map((item, itemIndex) => {
      const previousNames = [item, ...(oldNames[item] ?? [])];
      const previousItemNames = oldNames[item] ?? [item];
      const checked = legacy.has(name + "/" + item) ||
        previousItemNames.every(value => legacy.has(name + "/" + value));
      if (checked) previousNames.forEach(value => remaining.delete(value));
      return { id: `item-${groupIndex}-${itemIndex}`, name: item, checked };
    });
    for (const item of remaining) {
      items.push({ id: `legacy-${groupIndex}-${items.length}`, name: item, checked: true });
    }
    return { id: `group-${groupIndex}`, name, items };
  });
}

function validList(list) {
  return Array.isArray(list) && list.every(group => typeof group?.id === "string" &&
    typeof group.name === "string" && Array.isArray(group.items) &&
    group.items.every(item => typeof item?.id === "string" && typeof item.name === "string" &&
      typeof item.checked === "boolean"));
}

export function readPackingList(storage) {
  const saved = storage.getItem(packingKey);
  if (saved !== null) {
    const list = JSON.parse(saved);
    if (!validList(list)) throw new Error("行李清單格式有誤");
    return list;
  }

  const savedChecks = JSON.parse(storage.getItem(legacyKey));
  return defaultPackingList(Array.isArray(savedChecks) ? savedChecks : []);
}

export function savePackingList(storage, update) {
  const current = readPackingList(storage);
  const next = update(current);
  storage.setItem(packingKey, JSON.stringify(next));
  return next;
}

export function editPackingItem(groups, sourceId, destinationId, itemId, name, newId) {
  const destination = groups.find(group => group.id === destinationId);
  const original = groups.find(group => group.id === sourceId)?.items.find(item => item.id === itemId);
  if (!destination || (itemId && !original)) return groups;

  const item = original ? { ...original, name } : { id: newId, name, checked: false };
  if (original && sourceId === destinationId) {
    return groups.map(group => group.id === sourceId
      ? { ...group, items: group.items.map(candidate => candidate.id === itemId ? item : candidate) }
      : group);
  }

  return groups.map(group => {
    if (group.id === destinationId) return { ...group, items: [...group.items, item] };
    if (group.id === sourceId) return { ...group, items: group.items.filter(candidate => candidate.id !== itemId) };
    return group;
  });
}
