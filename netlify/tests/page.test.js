import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "../functions/page.js";

test("拒絕讀取行程資料庫以外的 Notion 頁面", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.NOTION_TOKEN;
  const originalDatabaseId = process.env.NOTION_DATABASE_ID;
  const requests = [];

  process.env.NOTION_TOKEN = "test-token";
  process.env.NOTION_DATABASE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  globalThis.fetch = async url => {
    requests.push(url);
    return Response.json({
      parent: { database_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }
    });
  };

  try {
    const response = await handler({
      queryStringParameters: { id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }
    });

    assert.equal(response.statusCode, 404);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = originalToken;
    if (originalDatabaseId === undefined) delete process.env.NOTION_DATABASE_ID;
    else process.env.NOTION_DATABASE_ID = originalDatabaseId;
  }
});

test("下載筆記包含後續分頁並停用 CDN 快取", async t => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.NOTION_TOKEN;
  const originalDatabaseId = process.env.NOTION_DATABASE_ID;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = originalToken;
    if (originalDatabaseId === undefined) delete process.env.NOTION_DATABASE_ID;
    else process.env.NOTION_DATABASE_ID = originalDatabaseId;
  });
  process.env.NOTION_TOKEN = "test-token";
  process.env.NOTION_DATABASE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  globalThis.fetch = async url => {
    if (url.includes("/pages/")) return Response.json({ parent: { database_id: process.env.NOTION_DATABASE_ID } });
    const next = new URL(url).searchParams.has("start_cursor");
    return Response.json({
      results: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: next ? "第二頁" : "第一頁" }] } }],
      has_more: !next, next_cursor: next ? null : "next"
    });
  };
  const response = await handler({ queryStringParameters: { id: "cccccccccccccccccccccccccccccccc", download: "snapshot" } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).content.map(block => block.text), ["第一頁", "第二頁"]);
  assert.equal(response.headers["Netlify-CDN-Cache-Control"], "no-store");
  assert.equal(response.headers["Netlify-Vary"], "query=id|edited|download");
});
