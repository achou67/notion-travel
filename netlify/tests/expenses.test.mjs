import assert from "node:assert/strict";
import { test } from "node:test";
import { createExpenseHandler } from "../lib/expenses.js";
import { NotionRequestError } from "../lib/notion.js";

const membersId = "11111111-1111-4111-8111-111111111111";
const expensesId = "22222222-2222-4222-8222-222222222222";
const payerId = "33333333-3333-4333-8333-333333333333";
const expenseId = "44444444-4444-4444-8444-444444444444";
const updatedAt = "2026-11-24T00:00:00.000Z";
const origin = "https://example.test";
const input = { title: "團體晚餐", amount: 1500, currency: "JPY", date: "", payerId, participantIds: [payerId] };
const user = { id: "member-1", roles: ["expense-member"] };

function handlerFixture({ identity = user, owner = user.id, sourceId = expensesId, queryError, trashed = false } = {}) {
  const calls = [];
  const page = {
    id: expenseId, last_edited_time: updatedAt, in_trash: trashed,
    parent: { type: "data_source_id", data_source_id: sourceId },
    properties: { "網站建立者 ID": { rich_text: [{ plain_text: owner }] } }
  };
  const handler = createExpenseHandler({
    getUser: async () => identity,
    env: key => ({
      EXPENSE_NOTION_TOKEN: "test-only", EXPENSE_NOTION_EXPENSES_ID: expensesId, EXPENSE_NOTION_MEMBERS_ID: membersId
    })[key],
    queryResults: async url => {
      calls.push({ url, method: "QUERY" });
      if (queryError && url.includes(membersId)) throw queryError;
      return url.includes(membersId) ? [{
        id: payerId, parent: { type: "data_source_id", data_source_id: membersId }, properties: {}
      }] : [page];
    },
    notionFetch: async (url, { method, body }) => {
      calls.push({ url, method, body: body && JSON.parse(body) });
      return Response.json(page);
    }
  });
  return { handler, calls };
}

function request(method = "GET", data, siteOrigin = origin) {
  return new Request(`${origin}/.netlify/functions/expenses`, {
    method,
    headers: { origin: siteOrigin, "Content-Type": "application/json" },
    body: data && JSON.stringify(data)
  });
}

test("private reads require an invited, authorized role and are never cached", async () => {
  for (const [identity, code] of [[null, 401], [{ id: "other", roles: [] }, 403]]) {
    const { handler, calls } = handlerFixture({ identity });
    const result = await handler(request());
    assert.equal(result.status, code);
    assert.equal(calls.length, 0);
  }
  const { handler } = handlerFixture();
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.match(result.headers.get("cache-control"), /no-store/);
  const payload = await result.json();
  assert.equal(payload.expenses[0].canEdit, true);
  assert.equal(JSON.stringify(payload).includes(user.id), false);
});

test("creation derives ownership from the session and rejects invalid inputs and cross-origin writes", async () => {
  const { handler, calls } = handlerFixture();
  assert.equal((await handler(request("POST", input, "https://other.test"))).status, 403);
  assert.equal((await handler(request("POST", { ...input, amount: 1.5 }))).status, 400);
  assert.equal((await handler(request("POST", { ...input, participantIds: ["other"] }))).status, 400);
  assert.equal((await handler(request("POST", { ...input, owner: "spoofed" }))).status, 201);
  const writes = calls.filter(call => call.method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.properties["網站建立者 ID"].rich_text[0].text.content, user.id);
});

test("updates check source, owner and stale versions before writing", async () => {
  const payload = { ...input, id: expenseId, updatedAt };
  for (const [options, data, status] of [
    [{ owner: "someone-else" }, payload, 403],
    [{ sourceId: membersId }, payload, 404],
    [{}, { ...payload, updatedAt: "older" }, 409],
    [{}, payload, 200],
    [{ owner: "someone-else", identity: { id: "admin", roles: ["expense-admin"] } }, payload, 200]
  ]) {
    const { handler, calls } = handlerFixture(options);
    assert.equal((await handler(request("PATCH", data))).status, status);
    const writes = calls.filter(call => call.method === "PATCH");
    assert.equal(writes.length, status === 200 ? 1 : 0);
    if (writes.length) assert.equal("網站建立者 ID" in writes[0].body.properties, false);
  }
});

test("Notion failures explain how to restore access without exposing upstream data", async () => {
  for (const [status, message] of [[401, /EXPENSE_NOTION_TOKEN/], [403, /Read content/], [404, /旅伴與結算.*Add connections/]]) {
    const { handler } = handlerFixture({ queryError: new NotionRequestError(status) });
    const result = await handler(request());
    assert.equal(result.status, 503);
    assert.match((await result.json()).error, message);
    assert.match(result.headers.get("cache-control"), /no-store/);
  }
});

test("deletion only trashes the authorized expense at the displayed version", async () => {
  const selected = { id: expenseId, updatedAt };
  for (const [fixture, body, site, status, writes] of [
    [{ identity: null }, selected, origin, 401, 0],
    [{ owner: "another" }, selected, origin, 403, 0],
    [{}, selected, "https://other.test", 403, 0],
    [{ sourceId: membersId }, selected, origin, 404, 0],
    [{}, { ...selected, updatedAt: "stale" }, origin, 409, 0],
    [{}, selected, origin, 200, 1],
    [{ trashed: true }, selected, origin, 200, 0],
    [{ owner: "another", identity: { id: "admin", roles: ["expense-admin"] } }, selected, origin, 200, 1]
  ]) {
    const { handler, calls } = handlerFixture(fixture);
    const result = await handler(request("DELETE", body, site));
    assert.equal(result.status, status);
    const updates = calls.filter(call => call.method === "PATCH");
    assert.equal(updates.length, writes);
    if (writes) assert.deepEqual(updates[0].body, { in_trash: true });
    assert.equal(calls.some(call => call.method === "QUERY"), false);
  }
});
