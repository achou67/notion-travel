import { getExpenseUser, expenseAuthReady } from "../server/expenseAuth.js";
import { expenseInvites, inviteCookie, inviteCookieHeader, invitesConfigured, InviteError } from "../server/expenseInvites.js";

function json(body, status = 200, cookie) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...(cookie && { "Set-Cookie": cookie }) }
  });
}

async function handle(request) {
  const origin = process.env.EXPENSE_AUTH_URL;
  if (new URL(request.url).origin !== origin || (request.method === "POST" && request.headers.get("origin") !== origin)) {
    return json({ error: "請從野澤分帳正式網址操作。" }, 403);
  }
  if (!expenseAuthReady(key => process.env[key]) || !invitesConfigured()) {
    return json({ error: "旅伴邀請尚未啟用。" }, 503);
  }
  try {
    const cookie = inviteCookie(request);
    if (request.method === "GET") {
      if (!cookie) return json({ pending: false });
      const user = await getExpenseUser(request);
      return json({ pending: await expenseInvites.valid(cookie, user?.id), signedIn: Boolean(user?.id) });
    }

    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "請使用分帳頁面操作。" }, 415);
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: "請求格式有誤。" }, 400);
    let input;
    try { input = JSON.parse(raw); } catch { return json({ error: "請求格式有誤。" }, 400); }
    const user = await getExpenseUser(request);

    if (input?.action === "start") {
      if (typeof input.token !== "string" || !await expenseInvites.valid(input.token, user?.id)) {
        return json({ error: "邀請已使用或過期，請向管理員索取新連結。" }, 410);
      }
      return json({ signedIn: Boolean(user?.id) }, 200, inviteCookieHeader(input.token, 86400));
    }
    if (!user?.id) return json({ error: "請先使用 Google 登入。" }, 401);
    if (input?.action === "issue") {
      if (!user.roles.includes("expense-admin")) return json({ error: "只有分帳管理員可以邀請旅伴。" }, 403);
      const { token, expiresAt } = await expenseInvites.issue();
      return json({ url: `${origin}/expenses#invite=${token}`, expiresAt }, 201);
    }
    if (input?.action === "redeem") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      await expenseInvites.redeem(cookie, user.id, name);
      return json({ joined: true }, 200, inviteCookieHeader("", 0));
    }
    return json({ error: "不支援此操作。" }, 400);
  } catch (error) {
    if (error instanceof InviteError) return json({ error: error.message }, error.status);
    console.error("Expense invitation failed");
    return json({ error: "暫時無法處理邀請，請稍後再試。" }, 503);
  }
}

export { handle as GET, handle as POST };
