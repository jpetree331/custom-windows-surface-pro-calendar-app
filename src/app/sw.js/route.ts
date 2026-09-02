/**
 * The service worker, served from a route instead of public/ so that every
 * build produces DIFFERENT bytes. The browser only installs a new worker when
 * the script changes, and PwaRegister only reloads a resumed app when a new
 * worker takes over — so a static sw.js with a hand-bumped cache name meant
 * a release that forgot the bump (round 13 did) never reached an installed
 * app that was resumed rather than relaunched. Now the build id is baked in.
 *
 * `force-static`: rendered once at build time, so the id is fixed per deploy
 * (Vercel's commit sha when available, else the build's timestamp).
 */
export const dynamic = "force-static";

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

const script = `/* Jo's Planner service worker — offline-first shell (build ${BUILD_ID}).
   Static assets: cache-first. Navigations: network-first with cache fallback.
   The cache is named per build, so activating a new build sweeps the old one. */
const CACHE = "jotter-${BUILD_ID}";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // the browser re-checks this script on its own schedule; never let a
      // proxy hand back last week's build
      "Cache-Control": "no-cache",
    },
  });
}
