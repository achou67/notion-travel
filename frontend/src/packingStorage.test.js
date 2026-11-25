import assert from "node:assert/strict";
import { test } from "node:test";
import { editPackingItem, packingKey, readPackingList, savePackingList } from "./packingStorage.js";

function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test("legacy checked items survive replacement with the current Notion template", () => {
  const original = storage({
    "nozawa-2027-packing": JSON.stringify(["旅行證件/護照", "衣服與鞋子/衣服", "衣服與鞋子/內衣"])
  });
  const list = readPackingList(original);
  const clothes = list.find(group => group.name === "衣服與鞋子");
  assert.equal(list[0].items.find(item => item.name === "護照").checked, true);
  assert.equal(clothes.items.find(item => item.name === "上衣").checked, true);
  assert.equal(clothes.items.find(item => item.name === "內衣").checked, true);
  assert.equal(clothes.items.find(item => item.name === "內衣/內褲").checked, false);
});

test("editing and moving an item keep its check state and do not change other browsers", () => {
  const first = storage();
  const second = storage();
  const groups = readPackingList(first);
  const source = groups[0], destination = groups[1], item = source.items[0];
  savePackingList(first, current => current.map(group => group.id === source.id
    ? { ...group, items: group.items.map(entry => entry.id === item.id ? { ...entry, checked: true } : entry) }
    : group));
  savePackingList(first, current => editPackingItem(current, source.id, destination.id, item.id, "護照與副本"));
  const edited = readPackingList(first);
  assert.ok(!edited[0].items.some(entry => entry.id === item.id));
  assert.deepEqual(edited[1].items.at(-1), { ...item, checked: true, name: "護照與副本" });
  assert.deepEqual(readPackingList(second), groups);
  savePackingList(first, () => []);
  assert.deepEqual(readPackingList(first), []);
  assert.equal(second.getItem(packingKey), null);
});
