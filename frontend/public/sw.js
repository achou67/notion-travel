const CACHE_NAME = "notion-travel-shell-v2";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("notion-travel-shell-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/__offline__/image/")) {
    const cacheName = url.pathname.split("/")[3];
    event.respondWith((async () => {
      if (!cacheName.startsWith("notion-travel-download-")) return Response.error();
      return (await (await caches.open(cacheName)).match(request)) || Response.error();
    })());
    return;
  }

  if (url.pathname.startsWith("/.netlify/functions/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
          return response;
        })
        .catch(() => savedResource("/"))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => savedResource(request))
  );
});

async function savedResource(request) {
  const pointer = await (await caches.open("notion-travel-offline-v1")).match("/__offline__/snapshot");
  if (pointer) {
    const snapshot = await pointer.json();
    const saved = await (await caches.open(snapshot.cacheName)).match(request);
    if (saved) return saved;
  }
  return (await (await caches.open(CACHE_NAME)).match(request)) || Response.error();
}
