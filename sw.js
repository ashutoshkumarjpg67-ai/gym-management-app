/* Gym Management App — sw.js (service worker, Step 1)
 * Cache version MUST bump on every deploy, otherwise phones keep serving
 * the old cached app shell forever (cache-first never re-checks network).
 * Strategy: network-first for HTML/JS (fresh code always wins, cache is
 * only the offline fallback); cache-first for CSS/icons/manifest/fonts.
 */
var CACHE = "gym-app-v7";
var FILES = ["./", "./index.html?v=7", "./styles.css?v=7", "./config.js?v=7", "./auth.js?v=7", "./data.js?v=7", "./app.js?v=7", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.svg", "./fonts/barlow-400.woff2", "./fonts/barlow-600.woff2", "./fonts/barlow-700.woff2", "./fonts/barlow-condensed-600.woff2", "./fonts/barlow-condensed-700.woff2"];

self.addEventListener("install", function (e) {
  // Add files one by one: a single missing file (e.g. PNG icons not yet
  // uploaded via the web flow) must not fail the whole precache.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = e.request.url;
  var isCode = url.indexOf(".html") !== -1 || url.indexOf(".js") !== -1;
  if (isCode) {
    // Network-first: fresh code on every visit when online.
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
        return res;
      }).catch(function () { return caches.match(e.request); })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }).catch(function () { return caches.match("./index.html"); })
    );
  }
});
