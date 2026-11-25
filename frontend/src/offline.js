const STORE = "notion-travel-offline-v1";
const SNAPSHOT_URL = "/__offline__/snapshot";
const DOWNLOAD_PREFIX = "notion-travel-download-";

export async function readSnapshot() {
  if (!("caches" in globalThis)) return null;
  const response = await (await caches.open(STORE)).match(SNAPSHOT_URL);
  if (!response) return null;
  const snapshot = await response.json();
  if (!Array.isArray(snapshot.trips) || (snapshot.shopping !== null && !Array.isArray(snapshot.shopping)) ||
      !snapshot.notes || !snapshot.cacheName?.startsWith(DOWNLOAD_PREFIX) || !Number.isFinite(Date.parse(snapshot.savedAt))) {
    throw new Error("離線版本格式不正確，請清除後重新下載。");
  }
  return snapshot;
}

export async function clearSnapshot() {
  const store = await caches.open(STORE);
  await store.delete(SNAPSHOT_URL);
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith(DOWNLOAD_PREFIX)).map(name => caches.delete(name)));
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`資料讀取失敗（${response.status}）`);
  if (response.status === 204) return null;
  const data = await response.json();
  if (!Array.isArray(data) && !Array.isArray(data?.content)) throw new Error("資料格式不正確");
  return data;
}

async function prepareWorker() {
  if (!("serviceWorker" in navigator) || !("caches" in globalThis)) {
    throw new Error("此瀏覽器無法保存離線版本，請改用一般模式的 Safari、Chrome 或 Edge。");
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await registration.update();
  const worker = registration.installing || registration.waiting;
  if (worker && worker.state !== "activated") {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("離線功能準備逾時，請重新整理後再試。")), 30000);
      function finish(error) {
        clearTimeout(timer);
        worker.removeEventListener("statechange", check);
        if (error) reject(error);
        else resolve();
      }
      function check() {
        if (worker.state === "activated") finish();
        if (worker.state === "redundant") finish(new Error("離線功能更新失敗，請重新整理後再試。"));
      }
      worker.addEventListener("statechange", check);
      check();
    });
  }
  if (!navigator.serviceWorker.controller) throw new Error("離線功能已準備，請重新整理後再下載。");
}

async function verifyImage(url) {
  await new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error("圖片下載逾時")), 30000);
    function finish(error) {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    }
    image.onload = () => finish();
    image.onerror = () => finish(new Error("圖片下載失敗，請確認 Notion 圖片仍可開啟。"));
    image.src = url;
  });
}

export async function saveSnapshot(onProgress) {
  await prepareWorker();
  const previous = await readSnapshot();
  const cacheName = `${DOWNLOAD_PREFIX}${crypto.randomUUID()}`;
  const cache = await caches.open(cacheName);
  try {
    onProgress("正在下載網頁與清單…");
    const shell = await fetch("/", { cache: "reload", signal: AbortSignal.timeout(30000) });
    if (!shell.ok || !shell.headers.get("content-type")?.includes("text/html")) throw new Error("網頁下載失敗");
    const html = new DOMParser().parseFromString(await shell.clone().text(), "text/html");
    await cache.put("/", shell);
    const assets = new Set(["/manifest.webmanifest?v=nozawa-4", "/pwa-icon-192.png?v=nozawa-4", "/pwa-icon-512.png?v=nozawa-4"]);
    for (const element of html.querySelectorAll("script[src], link[rel=stylesheet], link[rel=modulepreload]")) {
      const url = new URL(element.getAttribute("src") || element.getAttribute("href"), location.origin);
      if (url.origin !== location.origin) throw new Error("網頁使用外部程式資源，無法完整保存。");
      assets.add(url.href);
    }
    for (const url of assets) {
      const response = await fetch(url, { cache: "reload", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("網頁資源下載失敗");
      await cache.put(url, response);
    }

    const trips = await fetchJson(`/.netlify/functions/notion?refresh=${Date.now()}`);
    if (!Array.isArray(trips)) throw new Error("清單格式不正確");
    const notes = {};
    let imageCount = 0;
    for (const [index, item] of trips.entries()) {
      onProgress(`正在下載筆記 ${index + 1} / ${trips.length}…`);
      const params = new URLSearchParams({ id: item.id, edited: item.lastEditedTime || "", download: cacheName });
      const data = await fetchJson(`/.netlify/functions/page?${params}`);
      const content = Array.isArray(data) ? data : data.content;
      for (const block of content) {
        if (block.type !== "image" || !block.url) continue;
        const url = `/__offline__/image/${cacheName}/${imageCount++}`;
        const image = await fetch(block.url, {
          mode: "no-cors", credentials: "omit", cache: "reload", signal: AbortSignal.timeout(30000)
        });
        if (!image.ok && image.type !== "opaque") throw new Error("圖片下載失敗");
        await cache.put(url, image);
        await verifyImage(url);
        block.url = url;
      }
      notes[item.id] = content;
      // Space out page requests, each of which reads both page metadata and blocks from Notion.
      if (index + 1 < trips.length) await new Promise(resolve => setTimeout(resolve, 750));
    }
    const snapshot = { savedAt: new Date().toISOString(), cacheName, trips, shopping: null, notes };
    const store = await caches.open(STORE);
    // Publish the pointer last so an interrupted download cannot replace a complete snapshot.
    await store.put(SNAPSHOT_URL, Response.json(snapshot));
    // shortcut: other tabs must reload after replacement; coordinate tabs if concurrent offline sessions are needed.
    if (previous) await caches.delete(previous.cacheName).catch(() => {});
    return snapshot;
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}
