import assert from "node:assert/strict";
import { test } from "node:test";
import { settleExpenses } from "./expenseSettlement.js";

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
