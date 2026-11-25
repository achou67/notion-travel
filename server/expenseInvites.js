import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

const pathname = "nozawa-expense-invites/v1.json";
const day = 86_400_000;
const claimLease = 60_000;
const joinCookie = "__Host-nozawa-expense-invite";
const tokenPattern = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
const accountHash = id => digest("account:" + id);
const secretToken = () => randomBytes(32).toString("base64url");
const memberProperty = "分帳帳號 ID";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function inviteCookie(request) {
  return request.headers.get("cookie")?.split(";").map(piece => piece.trim())
    .find(piece => piece.startsWith(joinCookie + "="))?.slice(joinCookie.length + 1) || "";
}

export function inviteCookieHeader(token, maxAge) {
  return `${joinCookie}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function invitesConfigured(env = process.env) {
  return Boolean(env.VERCEL_ENV === "production" && env.BLOB_READ_WRITE_TOKEN && env.EXPENSE_NOTION_TOKEN && env.EXPENSE_NOTION_MEMBERS_ID);
}

const blobStore = {
  async read() {
    const result = await get(pathname, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(6000) });
    if (!result) return { state: { invitations: {}, members: {} }, version: null };
    if (result.statusCode !== 200 || !result.blob.etag) throw new Error("Unexpected invite storage response");
    return { state: await new Response(result.stream).json(), version: result.blob.etag };
  },
  async write(state, version) {
    try {
      await put(pathname, JSON.stringify(state), {
        access: "private", contentType: "application/json", allowOverwrite: Boolean(version),
        ...(version && { ifMatch: version }), abortSignal: AbortSignal.timeout(6000)
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      if (!version && (await blobStore.read()).version) return false;
      throw error;
    }
  }
};

export class InviteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function available(invitation, id, now) {
  return invitation && (invitation.account === id || (!invitation.account && invitation.expiresAt > now));
}

export function createInviteService({
  store = blobStore, roster = notionRoster(), now = Date.now, secret = () => process.env.EXPENSE_AUTH_SECRET
} = {}) {
  function sign(nonce) {
    return createHmac("sha256", secret()).update("nozawa-expense-invite:" + nonce).digest("base64url");
  }

  function validToken(token) {
    if (!tokenPattern.test(token)) return false;
    const [nonce, signature] = token.split(".");
    return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(nonce)));
  }

  async function mutate(update) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { state, version } = await store.read();
      const result = update(state, now());
      if (!result.changed || await store.write(state, version)) return result.value;
    }
    throw new InviteError(409, "有其他旅伴正在操作，請再試一次。");
  }

  return {
    async issue() {
      const nonce = secretToken();
      const token = nonce + "." + sign(nonce);
      const expiresAt = await mutate((state, time) => {
        for (const [key, invite] of Object.entries(state.invitations)) {
          if (invite.expiresAt <= time && (!invite.account || state.members[invite.account]?.active)) {
            delete state.invitations[key];
          }
        }
        const expires = time + day;
        state.invitations[digest(token)] = { expiresAt: expires };
        return { changed: true, value: expires };
      });
      return { token, expiresAt };
    },

    async valid(token, userId) {
      if (!validToken(token)) return false;
      const { state } = await store.read();
      return Boolean(available(state.invitations[digest(token)], userId ? accountHash(userId) : null, now()));
    },

    async isMember(userId) {
      const { state } = await store.read();
      return state.members[accountHash(userId)]?.active === true;
    },

    async redeem(token, userId, displayName) {
      if (!validToken(token)) throw new InviteError(410, "邀請已使用或過期，請向管理員索取新連結。");
      if (!displayName || displayName.length > 60) throw new InviteError(400, "請輸入顯示名稱，最多 60 字。");
      const account = accountHash(userId);
      const key = digest(token);
      const claim = await mutate((state, time) => {
        const invite = state.invitations[key];
        const member = state.members[account];
        if (member?.active) return { value: { active: true } };
        if (!available(invite, account, time)) throw new InviteError(410, "邀請已使用或過期，請向管理員索取新連結。");
        if (member?.invite !== undefined && member.invite !== key) {
          throw new InviteError(409, "這個帳號已有待完成的邀請，請使用原連結再試。");
        }
        if (member?.busyUntil > time) throw new InviteError(409, "正在加入旅伴名單，請稍後再試一次。");
        invite.account = account;
        state.members[account] = { name: member?.name ?? displayName, invite: key, busyUntil: time + claimLease };
        return { changed: true, value: { name: state.members[account].name } };
      });
      if (claim.active) return;

      try {
        await roster.ensureMember(account, claim.name);
      } catch (error) {
        // A timeout may have committed a Notion row. The lease prevents immediate retries.
        if (error instanceof InviteError && error.status === 424) {
          await mutate(state => {
            state.members[account].busyUntil = 0;
            return { changed: true };
          });
        }
        throw error;
      }

      await mutate(state => {
        state.members[account] = { active: true };
        return { changed: true };
      });
    }
  };
}

function notionRoster(env = process.env, send = fetch) {
  return {
    async ensureMember(account, name) {
      const source = env.EXPENSE_NOTION_MEMBERS_ID;
      const api = "https://api.notion.com/v1";
      const headers = {
        Authorization: `Bearer ${env.EXPENSE_NOTION_TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json"
      };
      async function request(path, body) {
        const response = await send(api + path, {
          method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
          console.warn("Expense invite Notion request failed", { status: response.status });
          const definite = [400, 401, 403, 404, 429].includes(response.status);
          throw new InviteError(definite ? 424 : 503, "目前無法寫入旅伴名單，請稍後重試或聯絡分帳管理員。");
        }
        return response.json();
      }
      const existing = await request(`/data_sources/${source}/query`, {
        filter: { property: memberProperty, rich_text: { equals: account } },
        page_size: 1
      });
      if (existing.results.length) return;
      await request("/pages", {
        parent: { type: "data_source_id", data_source_id: source },
        properties: {
          "旅伴": { title: [{ text: { content: name } }] },
          [memberProperty]: { rich_text: [{ text: { content: account } }] }
        }
      });
    }
  };
}

export const expenseInvites = createInviteService();
