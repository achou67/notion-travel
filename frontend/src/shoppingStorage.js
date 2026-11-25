export const SHOPPING_PREFIX = "nozawa-2027-shopping:";

export function readShoppingItems(storage) {
  return Object.keys(storage)
    .filter(key => key.startsWith(SHOPPING_PREFIX))
    .flatMap(key => {
      try {
        const item = JSON.parse(storage.getItem(key));
        return item?.name && key === SHOPPING_PREFIX + item.id ? [item] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function saveShoppingItem(storage, id, changes) {
  const itemId = id ?? crypto.randomUUID();
  const key = SHOPPING_PREFIX + itemId;
  const previous = JSON.parse(storage.getItem(key));
  if (id && !previous) return false;

  const item = { id: itemId, createdAt: Date.now(), purchased: false, ...previous, ...changes };
  storage.setItem(key, JSON.stringify(item));
  return true;
}

export function removeShoppingItem(storage, id) {
  storage.removeItem(SHOPPING_PREFIX + id);
}
