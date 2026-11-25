import { createExpenseHandler } from "../netlify/lib/expenses.js";
import { expenseAuthReady, getExpenseUser } from "../server/expenseAuth.js";

const env = key => process.env[key];
const ledger = createExpenseHandler({ getUser: getExpenseUser, env });

function handler(request) {
  if (!expenseAuthReady(env)) {
    return Response.json({ error: "分帳登入尚未完成設定。" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  return ledger(request);
}

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
