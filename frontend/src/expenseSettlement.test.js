import assert from "node:assert/strict";
import { test } from "node:test";
import { settleExpenses, settleInTwd } from "./expenseSettlement.js";

test("equal shares balance exactly, with independent JPY and TWD transfers", () => {
  const members = ["a", "b", "c"].map(id => ({ id }));
  const { JPY, TWD, excluded } = settleExpenses(members, [
    { currency: "JPY", amount: 100, payerId: "a", participantIds: ["c", "b", "a"] },
    { currency: "TWD", amount: 100.01, payerId: "b", participantIds: ["b", "a"] },
    { currency: "JPY", amount: 10, payerId: "c", participantIds: ["archived"] }
  ]);
  assert.deepEqual(JPY.transfers, [{ from: "b", to: "a", amount: 33 }, { from: "c", to: "a", amount: 33 }]);
  assert.deepEqual(TWD.transfers, [{ from: "a", to: "b", amount: 50.01 }]);
  assert.equal(excluded, 1);
});

test("TWD settlement nets the converted JPY balance against existing TWD expenses", () => {
  const settlement = settleExpenses([{ id: "a" }, { id: "b" }], [
    { currency: "JPY", amount: 1000, payerId: "a", participantIds: ["a", "b"] },
    { currency: "TWD", amount: 80, payerId: "b", participantIds: ["a", "b"] }
  ]);
  assert.deepEqual(settleInTwd(settlement, "0.22").transfers, [{ from: "b", to: "a", amount: 70 }]);
  assert.equal(settlement.JPY.transfers[0].amount, 500);
  assert.equal(settleInTwd(settlement, "0"), null);
  assert.equal(settleInTwd(settlement, ""), null);
});

test("converted rounding keeps all TWD transfers balanced to the cent", () => {
  const settlement = settleExpenses(["a", "b", "c"].map(id => ({ id })), [
    { currency: "JPY", amount: 3, payerId: "a", participantIds: ["a", "b", "c"] }
  ]);
  const combined = settleInTwd(settlement, ".004");
  assert.equal([...combined.balances.values()].reduce((total, amount) => total + Math.round(amount * 100), 0), 0);
  assert.equal(combined.transfers.reduce((total, item) => total + Math.round(item.amount * 100), 0), 1);
});
