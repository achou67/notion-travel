// Run after npm run build, with Playwright available: node checks/offline.cjs
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function check() {
  let version = 1;
  let failApi = false;
  let failNote = false;
  let failImage = false;
  let shoppingEnabled = true;
  let workerVersion = 0;
  const requests = [];
  const imageServer = http.createServer((req, res) => {
    res.writeHead(failImage ? 404 : 200, { "Content-Type": failImage ? "text/html" : "image/svg+xml", "Cache-Control": "no-store" });
    res.end(failImage ? "Image not found" : '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="pink"/></svg>');
  });
  await new Promise(resolve => imageServer.listen(0, "127.0.0.1", resolve));
  const imageUrl = `http://127.0.0.1:${imageServer.address().port}/note.svg`;
  const trips = () => ["a", "b"].map((id, index) => ({
    id, name: `Trip ${id} v${version}`, date: `2026-10-${15 + index}`,
    order: index, lastEditedTime: `version-${version}`, mapUrl: "https://example.com/map"
  }));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/.netlify/functions/")) {
      requests.push(req.url);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      if (failApi || (failNote && url.pathname.endsWith("/page") && url.searchParams.get("id") === "b")) {
        res.writeHead(500); res.end('{}'); return;
      }
      if (url.pathname.endsWith("/notion")) res.end(JSON.stringify(trips()));
      else if (url.pathname.endsWith("/shopping")) {
        if (!shoppingEnabled) { res.writeHead(204); res.end(); return; }
        res.end(JSON.stringify([{ id: "s", name: `Shopping v${version}`, description: "Buy this", storeType: "日用品" }]));
      } else res.end(JSON.stringify({ content: [
        { type: "paragraph", text: `Note ${url.searchParams.get("id")} v${version}` },
        { type: "image", url: imageUrl, caption: "Saved image" }
      ] }));
      return;
    }
    const root = path.resolve(__dirname, "../dist");
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + path.sep)) file = path.join(root, "index.html");
    try {
      if (!(await fs.stat(file)).isFile()) throw new Error("not a file");
    } catch { file = path.join(root, "index.html"); }
    const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".webmanifest": "application/manifest+json" };
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    const body = await fs.readFile(file);
    if (url.pathname === "/sw.js") {
      res.end(workerVersion === 0
        ? 'self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));'
        : `${body.toString()}\n// Test worker revision ${workerVersion}`);
    } else res.end(body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let page;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    page.on("pageerror", error => console.error("Browser error:", error.message));
    page.setDefaultTimeout(15000);
    await page.goto(origin);
    await page.getByRole("button", { name: "Trip a v1", exact: true }).waitFor();
    assert.equal(requests.some(url => url.includes("/page?")), false, "Normal browsing must keep notes lazy");
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    workerVersion = 1;
    const readSaved = () => page.evaluate(async () => {
      const response = await (await caches.open("notion-travel-offline-v1")).match("/__offline__/snapshot");
      return response ? response.json() : null;
    });
    await page.getByRole("button", { name: "儲存供離線使用", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "離線版本已保存" }).waitFor({ timeout: 45000 });
    const first = await readSaved();
    assert.equal(first.trips.length, 2);
    assert.deepEqual(Object.keys(first.notes).sort(), ["a", "b"]);
    assert.ok(first.notes.b[1].url.startsWith("/__offline__/image/"));
    assert.ok(requests.some(url => url.includes("download=")), "Download must bypass the note CDN cache");
    workerVersion = 2;
    await page.evaluate(async () => {
      const changed = new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      await (await navigator.serviceWorker.getRegistration()).update();
      await changed;
    });
    assert.equal((await readSaved()).savedAt, first.savedAt, "A worker update must preserve saved data");

    await context.setOffline(true);
    await page.close();
    page = await context.newPage();
    page.on("pageerror", error => console.error("Browser error:", error.message));
    page.setDefaultTimeout(15000);
    await page.goto(`${origin}/2026-10-16`);
    await page.getByText("目前使用離線版本", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Trip b v1", exact: true }).click();
    await page.getByText("Note b v1", { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector(".content-image")?.naturalWidth > 0);
    await page.screenshot({ path: path.join(require("node:os").tmpdir(), "notion-travel-offline.png"), fullPage: true });
    await page.locator(".date-tabs button").first().click();
    await page.getByRole("button", { name: "Trip a v1", exact: true }).click();
    await page.getByText("Note a v1", { exact: true }).waitFor();
    await page.getByRole("button", { name: /購物清單/ }).click();
    await page.getByRole("button", { name: /Shopping v1/ }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: /Shopping v1/ }).click();
    await page.getByText("Buy this", { exact: true }).waitFor();

    version = 2;
    await context.setOffline(false);
    // New Chromium pages can report onLine=true during network emulation; exercise the browser event explicitly.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.getByRole("button", { name: /Shopping v2/ }).waitFor();
    assert.equal(await page.getByText("目前使用離線版本", { exact: true }).count(), 0);
    assert.equal((await readSaved()).savedAt, first.savedAt, "Online reads must not silently replace the snapshot");

    failApi = true;
    await page.goto(origin);
    await page.getByRole("button", { name: "查看已保存版本", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Trip a v1", exact: true }).count(), 0, "HTTP errors must not silently display stale data");
    await page.getByRole("button", { name: "查看已保存版本", exact: true }).click();
    await page.getByRole("button", { name: "Trip a v1", exact: true }).waitFor();

    failApi = false;
    failNote = true;
    await page.getByRole("button", { name: "更新離線版本", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "保存失敗" }).waitFor({ timeout: 45000 });
    assert.equal((await readSaved()).savedAt, first.savedAt);
    assert.equal(await page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith("notion-travel-download-")).length), 1);
    failNote = false;
    failImage = true;
    await page.getByRole("button", { name: "更新離線版本", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "保存失敗" }).waitFor({ timeout: 45000 });
    assert.equal((await readSaved()).savedAt, first.savedAt, "Broken images must not publish an incomplete snapshot");
    failImage = false;

    // A storage-quota failure at publication must also preserve the old pointer and images.
    await page.evaluate(() => {
      window.originalCachePut = Cache.prototype.put;
      Cache.prototype.put = function(request, response) {
        if (String(request).includes("/__offline__/snapshot")) return Promise.reject(new DOMException("quota", "QuotaExceededError"));
        return window.originalCachePut.call(this, request, response);
      };
    });
    await page.getByRole("button", { name: "更新離線版本", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "保存失敗" }).waitFor({ timeout: 45000 });
    assert.equal((await readSaved()).savedAt, first.savedAt);
    await page.evaluate(() => { Cache.prototype.put = window.originalCachePut; });

    shoppingEnabled = false;
    await page.getByRole("button", { name: "更新離線版本", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "離線版本已保存" }).waitFor({ timeout: 45000 });
    const second = await readSaved();
    assert.notEqual(second.savedAt, first.savedAt);
    assert.equal(second.shopping, null);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Trip a v2", exact: true }).waitFor();
    await page.getByRole("button", { name: "Trip a v2", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".content-image")?.naturalWidth > 0);
    await page.getByRole("button", { name: /購物清單/ }).click();
    await page.getByText(/購買清單尚未啟用/).waitFor();
    await page.getByRole("button", { name: "清除離線資料", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "尚未保存離線版本" }).waitFor();
    assert.equal(await readSaved(), null);
    assert.equal(await page.evaluate(async () => (await caches.keys()).some(name => name.startsWith("notion-travel-download-"))), false);
    await page.goto(origin);
    await page.getByText(/此裝置尚未保存離線版本/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Trip a v2", exact: true }).count(), 0);
    console.log("PASS: worker upgrades, cold offline start, all dates/notes, cross-origin images, shopping, online freshness, explicit HTTP-error fallback, partial/image/quota failure recovery, optional shopping and clearing");
  } catch (error) {
    if (page && !page.isClosed()) console.error("Page diagnostics:", await page.evaluate(() => ({
      online: navigator.onLine, text: document.body.innerText, scripts: [...document.scripts].map(script => script.src)
    })).catch(() => null));
    throw error;
  } finally {
    if (browser) await browser.close();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => imageServer.close(resolve))]);
  }
}

check().catch(error => { console.error(error); process.exitCode = 1; });
