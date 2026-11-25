import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "@auth/core/jwt";
import { createExpenseAuth, getExpenseUser } from "../../server/expenseAuth.js";

const origin = "https://trip.example.test";
const cookieName = "__Secure-nozawa-expense.session";
const values = {
  EXPENSE_AUTH_URL: origin,
  EXPENSE_AUTH_SECRET: "example-only-test-secret-never-used-in-production",
  EXPENSE_GOOGLE_CLIENT_ID: "test-client",
  EXPENSE_GOOGLE_CLIENT_SECRET: "test-provider-secret",
  EXPENSE_ADMIN_EMAILS: "leader@example.test",
  EXPENSE_MEMBER_EMAILS: "traveller@example.test"
};
const env = key => values[key];

test("auth entry checks the origin and accepts only verified invited Google accounts", async () => {
  let config;
  const handler = createExpenseAuth({ env, auth: async (request, options) => {
    config = options;
    assert.equal(new URL(request.url).pathname, "/api/auth/callback/google");
    return Response.json({});
  } });
  assert.equal((await handler(new Request("https://other.test/api/auth/callback/google"))).status, 403);
  const callback = await handler(new Request(origin + "/api/expense-auth?expenseAuthAction=callback%2Fgoogle"));
  assert.match(callback.headers.get("cache-control"), /no-store/);
  const account = { provider: "google", providerAccountId: "verified-id" };
  assert.equal(config.callbacks.signIn({ account, profile: { email_verified: true, email: "Traveller@example.test" } }), true);
  assert.equal(config.callbacks.signIn({ account, profile: { email_verified: false, email: "traveller@example.test" } }), false);
  assert.equal(config.callbacks.signIn({ account, profile: { email_verified: true, email: "other@example.test" } }), false);
  const result = await createExpenseAuth({ env })(new Request(origin + "/api/auth/csrf"));
  assert.equal(result.status, 200);
  assert.ok((await result.json()).csrfToken);
  assert.ok(result.headers.getSetCookie().length > 0);
  const start = await createExpenseAuth({ env })(new Request(origin + "/api/auth/signin?callbackUrl=%2Fexpenses"));
  assert.equal(start.status, 200);
  assert.match(await start.text(), /provider=google|\/api\/auth\/signin\/google/);
});

test("ledger identities come from verified session cookies and the current allowlist", async () => {
  const jwt = await encode({ secret: values.EXPENSE_AUTH_SECRET, salt: cookieName,
    token: { email: "traveller@example.test", expenseSubject: "verified-id" } });
  const cookie = cookieName + "=" + jwt;
  const request = new Request(origin + "/api/expenses", { headers: { cookie } });
  assert.deepEqual(await getExpenseUser(request, env), { id: "google:verified-id", roles: ["expense-member"] });
  assert.deepEqual(await getExpenseUser(request, key => key === "EXPENSE_MEMBER_EMAILS" ? "" : env(key)),
    { id: "google:verified-id", roles: [] });
  assert.equal(await getExpenseUser(new Request(origin + "/api/expenses", { headers: { cookie: cookieName + "=invalid" } }), env), null);
  assert.equal(await getExpenseUser(new Request(origin + "/api/expenses", { headers: { authorization: "Bearer " + jwt } }), env), null);
});

test("Vercel route parameters stay out of Google sign-in while callback fields survive", async () => {
  const seen = [];
  const handler = createExpenseAuth({ env, auth: async request => {
    seen.push(new URL(request.url));
    return new Response(null, { status: 200 });
  } });
  await handler(new Request(origin + "/api/expense-auth?action=signin%2Fgoogle&expenseAuthAction=signin%2Fgoogle"));
  await handler(new Request(origin + "/api/auth/callback/google?action=callback%2Fgoogle&code=test-code&state=test-state"));
  assert.equal(seen[0].pathname, "/api/auth/signin/google");
  assert.equal(seen[0].search, "");
  assert.equal(seen[1].pathname, "/api/auth/callback/google");
  assert.deepEqual([...seen[1].searchParams], [["code", "test-code"], ["state", "test-state"]]);
});
