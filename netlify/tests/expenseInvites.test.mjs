import { test } from "node:test";
import assert from "node:assert/strict";
import { createInviteService, InviteError, inviteCookie, inviteCookieHeader } from "../../server/expenseInvites.js";

function fixture(ensureMember) {
  let state = { invitations: {}, members: {} };
  let version = 0;
  let time = 100;
  const store = {
    async read() { return { state: structuredClone(state), version }; },
    async write(candidate, expected) {
      if (expected !== version) return false;
      state = structuredClone(candidate);
      version++;
      return true;
    }
  };
  const calls = [];
  const service = createInviteService({ store, now: () => time, secret: () => "test-fixture-secret", roster: {
    async ensureMember(account, name) {
      calls.push({ account, name });
      await ensureMember?.();
    }
  } });
  return { service, calls, elapse: value => { time += value; } };
}

test("a one-time link grants one verified account even when two claim it together", async () => {
  const { service, calls } = fixture();
  const { token } = await service.issue();
  const results = await Promise.allSettled([
    service.redeem(token, "google:first", "旅伴甲"),
    service.redeem(token, "google:second", "旅伴乙")
  ]);
  const winner = results[0].status === "fulfilled" ? "google:first" : "google:second";
  const loser = winner === "google:first" ? "google:second" : "google:first";
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(calls.length, 1);
  assert.equal(await service.isMember(winner), true);
  assert.equal(await service.isMember(loser), false);
  await service.redeem(token, winner, "再次加入");
  assert.equal(calls.length, 1);
});

test("a failed roster write never grants access and can only be retried by the claimant", async () => {
  let fail = true;
  const { service, calls } = fixture(() => {
    if (fail) throw new InviteError(424, "Notion is inaccessible");
  });
  const { token } = await service.issue();
  await assert.rejects(service.redeem(token, "google:first", "旅伴甲"), { status: 424 });
  assert.equal(await service.isMember("google:first"), false);
  await assert.rejects(service.redeem(token, "google:second", "旅伴乙"), { status: 410 });
  fail = false;
  await service.redeem(token, "google:first", "改過的名稱");
  assert.equal(await service.isMember("google:first"), true);
  assert.equal(calls.at(-1).name, "旅伴甲");
});

test("expired and tampered invitations cannot be redeemed; state cookie is host-only", async () => {
  const { service, elapse } = fixture();
  const { token } = await service.issue();
  const replacement = token.startsWith("a") ? "b" : "a";
  assert.equal(await service.valid(replacement + token.slice(1)), false);
  const header = inviteCookieHeader(token, 86400);
  assert.match(header, /; Path=\/; Secure; HttpOnly; SameSite=Lax;/);
  const request = new Request("https://example.test", { headers: { cookie: header.split(";")[0] } });
  assert.equal(inviteCookie(request), token);
  elapse(86_400_000);
  assert.equal(await service.valid(token), false);
  await assert.rejects(service.redeem(token, "google:first", "旅伴甲"), { status: 410 });
});
