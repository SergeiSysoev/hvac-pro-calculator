const CACHE_PREFIX = 'professional-hvac-calculator-';
const CACHE_NAME = `${CACHE_PREFIX}v8`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const scoped = (path) => `${BASE_PATH}${path}`;
const APP_SHELL = [scoped('/'), scoped('/manifest.webmanifest'), scoped('/icon.png'), scoped('/og.png')];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootUrl = scoped('/');
  const rootResponse = await fetch(rootUrl, { cache: 'reload' });
  if (!rootResponse.ok) throw new Error(`App shell request failed: ${rootResponse.status}`);

  const html = await rootResponse.clone().text();
  await cache.put(rootUrl, rootResponse);
  const linkedResources = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
    .map((match) => new URL(match[1], self.registration.scope))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith(`${BASE_PATH}/`))
    .map((url) => url.href);
  const resourceUrls = [...APP_SHELL.slice(1), ...linkedResources]
    .map((resource) => new URL(resource, self.registration.scope).href);
  await cache.addAll(Array.from(new Set(resourceUrls)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    !requestUrl.pathname.startsWith(`${BASE_PATH}/`)
  ) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const shell = await cache.match(scoped('/'));
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
