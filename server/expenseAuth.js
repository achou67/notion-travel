import { Auth } from "@auth/core";
import { getToken } from "@auth/core/jwt";
import Google from "@auth/core/providers/google";

const basePath = "/api/auth";
const maxAge = 60 * 60 * 24 * 7;
const routes = new Set(["signin", "signin/google", "callback/google", "signout", "csrf", "providers", "session", "error"]);

function invitationRole(email, env) {
  const address = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!address) return null;
  const list = name => (env(name) || "").split(/[\s,]+/).map(value => value.toLowerCase());
  if (list("EXPENSE_ADMIN_EMAILS").includes(address)) return "expense-admin";
  if (list("EXPENSE_MEMBER_EMAILS").includes(address)) return "expense-member";
  return null;
}

function settings(env) {
  const origin = env("EXPENSE_AUTH_URL");
  const secret = env("EXPENSE_AUTH_SECRET");
  const clientId = env("EXPENSE_GOOGLE_CLIENT_ID");
  const clientSecret = env("EXPENSE_GOOGLE_CLIENT_SECRET");
  if (!origin || !secret || !clientId || !clientSecret || !env("EXPENSE_ADMIN_EMAILS")) return null;
  try {
    const url = new URL(origin);
    const secure = url.protocol === "https:";
    if ((!secure && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
        origin !== url.origin) return null;
    return { origin, secret, clientId, clientSecret, secure, cookieName: `${secure ? "__Secure-" : ""}nozawa-expense.session` };
  } catch {
    return null;
  }
}

export function expenseAuthReady(env) {
  return Boolean(settings(env));
}

export function createExpenseAuth({ env = key => process.env[key], auth = Auth } = {}) {
  return async request => {
    const config = settings(env);
    const headers = { "Cache-Control": "private, no-store" };
    if (!config) return Response.json({ error: "分帳登入尚未完成設定。" }, { status: 503, headers });

    const url = new URL(request.url);
    if (url.origin !== config.origin) return Response.json({ error: "請從野澤行程正式網址登入。" }, { status: 403, headers });
    const route = url.pathname.startsWith(basePath + "/")
      ? url.pathname.slice(basePath.length + 1)
      : url.searchParams.get("expenseAuthAction");
    if (!routes.has(route)) return new Response(null, { status: 404, headers });
    url.pathname = `${basePath}/${route}`;
    url.searchParams.delete("expenseAuthAction");
    url.searchParams.delete("action");
    // Auth.js forwards query parameters on provider sign-in to Google.
    // The form body already carries the CSRF token and callback URL.
    if (route === "signin/google") url.search = "";

    const response = await auth(new Request(url, request), {
      basePath,
      secret: config.secret,
      trustHost: true,
      useSecureCookies: config.secure,
      session: { strategy: "jwt", maxAge },
      cookies: {
        sessionToken: {
          name: config.cookieName,
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: config.secure }
        }
      },
      providers: [Google({ clientId: config.clientId, clientSecret: config.clientSecret })],
      pages: { error: "/expenses" },
      callbacks: {
        signIn({ account, profile }) {
          return account?.provider === "google" && profile?.email_verified === true &&
            Boolean(account.providerAccountId && invitationRole(profile.email, env));
        },
        jwt({ token, account, profile }) {
          if (account?.provider === "google") {
            token.expenseSubject = account.providerAccountId;
            token.email = profile.email;
          }
          return token;
        }
      }
    });
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", headers["Cache-Control"]);
    return result;
  };
}

export async function getExpenseUser(request, env = key => process.env[key]) {
  const config = settings(env);
  if (!config || new URL(request.url).origin !== config.origin) return null;
  const token = await getToken({
    req: { headers: new Headers({ cookie: request.headers.get("cookie") ?? "" }) },
    secret: config.secret,
    cookieName: config.cookieName,
    secureCookie: config.secure,
    salt: config.cookieName
  });
  if (typeof token?.expenseSubject !== "string" || !token.expenseSubject) return null;
  const role = invitationRole(token.email, env);
  return { id: `google:${token.expenseSubject}`, roles: role ? [role] : [] };
}
