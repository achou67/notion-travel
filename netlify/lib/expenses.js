import { fetchNotionResults, NotionRequestError } from "./notion.js";

const ownerProperty = "網站建立者 ID";
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const notionBase = "https://api.notion.com/v1";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" }
  });
}

function plainText(value) {
  return (value ?? []).map(part => part.plain_text ?? "").join("");
}

function sourceMatches(page, sourceId) {
  return page.parent?.type === "data_source_id" &&
    page.parent.data_source_id.replaceAll("-", "") === sourceId.replaceAll("-", "");
}

function canEdit(row, user) {
  return user.roles?.includes("expense-admin") ||
    plainText(row.properties[ownerProperty]?.rich_text) === user.id;
}

function toExpense(row, user) {
  const p = row.properties;
  return {
    id: row.id,
    title: plainText(p["品項"]?.title),
    date: p["日期"]?.date?.start ?? "",
    amount: p["金額"]?.number ?? null,
    currency: p["幣別"]?.select?.name ?? "",
    payerId: p["付款人"]?.relation?.[0]?.id ?? "",
    participantIds: (p["分攤人"]?.relation ?? []).map(person => person.id),
    incompleteRelations: p["分攤人"]?.has_more === true,
    status: p["資料狀態"]?.formula?.string ?? "",
    updatedAt: row.last_edited_time,
    canEdit: !!canEdit(row, user)
  };
}

function toMember(row) {
  const p = row.properties;
  return { id: row.id, name: plainText(p["旅伴"]?.title) };
}

function expenseProperties(input, knownMembers, owner) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const { amount, currency, payerId, participantIds, date } = input ?? {};
  const scale = currency === "JPY" ? 1 : 100;
  const units = Math.round(amount * scale);
  if (!title || title.length > 120) throw new HttpError(400, "請填寫品項，最多 120 字。");
  if (!["JPY", "TWD"].includes(currency) || !Number.isFinite(amount) ||
      amount <= 0 || amount > 100000000 || Math.abs(amount - units / scale) > 0.00000001) {
    throw new HttpError(400, "請填有效金額。日圓用整數，台幣最多兩位小數。");
  }
  if (!knownMembers.has(payerId) || !Array.isArray(participantIds) || !participantIds.length ||
      participantIds.length > 100 || new Set(participantIds).size !== participantIds.length ||
      !participantIds.every(id => knownMembers.has(id))) {
    throw new HttpError(400, "請選一位付款人和至少一位分攤人。");
  }
  if (date !== "" && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    throw new HttpError(400, "日期格式有誤。");
  }
  return {
    "品項": { title: [{ text: { content: title } }] },
    "日期": { date: date ? { start: date } : null },
    "金額": { number: units / scale },
    "幣別": { select: { name: currency } },
    "付款人": { relation: [{ id: payerId }] },
    "分攤人": { relation: participantIds.map(id => ({ id })) },
    ...(owner ? { [ownerProperty]: { rich_text: [{ text: { content: owner } }] } } : {})
  };
}

export function createExpenseHandler({ getUser, env, notionFetch = fetch, queryResults = fetchNotionResults }) {
  return async request => {
    try {
      if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
        return json({ error: "不支援此操作。" }, 405);
      }
      if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) {
        throw new HttpError(403, "無法確認請求來源。");
      }
      const user = await getUser(request);
      if (!user?.id) throw new HttpError(401, "請先登入。");
      if (!user.roles?.some(role => ["expense-admin", "expense-member"].includes(role))) {
        throw new HttpError(403, "這個帳號還沒有旅伴記帳權限。");
      }

      const token = env("EXPENSE_NOTION_TOKEN");
      const expensesId = env("EXPENSE_NOTION_EXPENSES_ID");
      const membersId = env("EXPENSE_NOTION_MEMBERS_ID");
      if (!token || !uuidPattern.test(expensesId ?? "") || !uuidPattern.test(membersId ?? "")) {
        throw new HttpError(503, "分帳尚未完成設定。");
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json"
      };
      async function query(source) {
        const database = source === membersId ? "旅伴與結算" : "共同支出";
        try {
          const rows = await queryResults(`${notionBase}/data_sources/${source}/query`, {
            method: "POST", headers, signal: AbortSignal.timeout(12000)
          });
          return rows.filter(page => sourceMatches(page, source) && !page.archived && !page.in_trash);
        } catch (error) {
          if (!(error instanceof NotionRequestError)) throw error;
          console.warn("Expense Notion query failed", { database, status: error.status });
          if (error.status === 401) {
            throw new HttpError(503, "Notion 拒絕了分帳金鑰。請確認 Vercel 的 EXPENSE_NOTION_TOKEN 是分帳連線目前的金鑰。");
          }
          if (error.status === 403) {
            throw new HttpError(503, `Notion 分帳連線缺少讀取「${database}」的權限。請確認連線已勾選 Read content。`);
          }
          if (error.status === 404) {
            throw new HttpError(503, `Notion 無法存取「${database}」。請在這個資料庫的「⋯ → Add connections」加入分帳連線。`);
          }
          if (error.status === 429 || error.status >= 500) {
            throw new HttpError(503, "Notion 暫時無法回應分帳查詢，請稍後重新整理。");
          }
          throw new HttpError(503, `Notion 拒絕讀取「${database}」（${error.status}）。請聯絡分帳管理員。`);
        }
      }

      async function notion(path, method, body) {
        const response = await notionFetch(notionBase + path, {
          method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(12000)
        });
        if (response.status === 404 && method === "GET") throw new HttpError(404, "找不到這筆支出。");
        if (!response.ok) throw new HttpError(502, "Notion 暫時無法處理，請重新整理確認後再試。");
        return response.json();
      }

      if (request.method === "GET") {
        const [members, rows] = await Promise.all([query(membersId), query(expensesId)]);
        return json({
          members: members.map(toMember),
          expenses: rows.map(row => toExpense(row, user)).sort((a, b) =>
            b.date.localeCompare(a.date) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
          isAdmin: !!user.roles.includes("expense-admin")
        });
      }

      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        throw new HttpError(415, "請使用記帳表單送出。");
      }
      let input;
      try {
        const text = await request.text();
        if (text.length > 16000) throw new Error("large request");
        input = JSON.parse(text);
      } catch {
        throw new HttpError(400, "請檢查送出的資料。");
      }
      let original;
      const deleting = request.method === "DELETE";
      if (request.method === "PATCH" || deleting) {
        if (!uuidPattern.test(input?.id ?? "")) throw new HttpError(400, "支出編號有誤。");
        original = await notion(`/pages/${input.id}`, "GET");
        if (!sourceMatches(original, expensesId)) throw new HttpError(404, "找不到這筆支出。");
        if (!canEdit(original, user)) {
          throw new HttpError(403, deleting ? "你只能刪除自己新增的記帳。" : "你只能修改自己新增的記帳。");
        }
        if (original.archived || original.in_trash) {
          if (deleting) return json({ id: original.id });
          throw new HttpError(404, "找不到這筆支出。");
        }
        if (input.updatedAt !== original.last_edited_time) {
          throw new HttpError(409, deleting
            ? "這筆支出已更新，請重新整理後再刪除。"
            : "這筆支出已更新，請重新整理後再編輯。");
        }
        if (deleting) {
          await notion(`/pages/${original.id}`, "PATCH", { in_trash: true });
          return json({ id: original.id });
        }
      }

      const members = await query(membersId);
      const properties = expenseProperties(input, new Set(members.map(row => row.id)), original ? null : user.id);
      const saved = original
        ? await notion(`/pages/${original.id}`, "PATCH", { properties })
        : await notion("/pages", "POST", { parent: { type: "data_source_id", data_source_id: expensesId }, properties });
      return json(toExpense(saved, user), original ? 200 : 201);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error("Expense service threw an unexpected error", {
        type: error instanceof TypeError ? "TypeError" : error instanceof DOMException ? error.name : "Error"
      });
      return json({ error: "目前無法讀取分帳服務，請稍後再試。" }, 503);
    }
  };
}
