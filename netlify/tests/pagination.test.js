import assert from "node:assert/strict";
import test from "node:test";
import { fetchNotionResults } from "../lib/notion.js";

test("讀完 POST 與 GET 的所有分頁，保留認證標頭", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const method of ["POST", "GET"]) {
      let calls = 0;
      globalThis.fetch = async (url, options) => {
        assert.equal(options.headers.Authorization, "Bearer test");
        const params = method === "POST" ? JSON.parse(options.body) : Object.fromEntries(new URL(url).searchParams);
        assert.equal(Number(params.page_size), 100);
        assert.equal(params.start_cursor, calls ? "next" : undefined);
        calls++;
        return Response.json({ results: [calls], has_more: calls === 1, next_cursor: calls === 1 ? "next" : null });
      };
      assert.deepEqual(await fetchNotionResults("https://api.notion.com/v1/test", {
        method, headers: { Authorization: "Bearer test" }
      }), [1, 2]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("後續分頁失敗或游標無效時拒絕回傳不完整結果", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1
      ? Response.json({ results: [1], has_more: true, next_cursor: "next" })
      : new Response(null, { status: 429 });
    await assert.rejects(fetchNotionResults("https://api.notion.com/v1/test", { method: "GET" }), /429/);
    globalThis.fetch = async () => Response.json({ results: [], has_more: true });
    await assert.rejects(fetchNotionResults("https://api.notion.com/v1/test", { method: "GET" }), /分頁/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
