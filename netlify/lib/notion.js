export class NotionRequestError extends Error {
  constructor(status) {
    super(`Notion API 回傳 ${status}`);
    this.status = status;
  }
}

export async function fetchNotionResults(url, options) {
  const results = [];
  let cursor;
  do {
    const target = new URL(url);
    const request = { ...options };
    if (request.method === "POST") {
      request.body = JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    } else {
      target.searchParams.set("page_size", "100");
      if (cursor) target.searchParams.set("start_cursor", cursor);
    }
    const response = await fetch(target.href, request);
    if (!response.ok) throw new NotionRequestError(response.status);
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error("Notion API 清單格式不正確");
    results.push(...data.results);
    const nextCursor = data.has_more ? data.next_cursor : null;
    if (data.has_more && (!nextCursor || nextCursor === cursor)) throw new Error("Notion API 分頁格式不正確");
    cursor = nextCursor;
  } while (cursor);
  return results;
}
