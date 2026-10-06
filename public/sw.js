/**
 * NextBridge Service Worker
 * - App shell caching (offline navigation)
 * - HLS segment serving from IndexedDB (Capacitor Filesystem web storage)
 * - Network-first for API, cache-first for static assets
 */

const CACHE_VERSION = 'nb-v3.4.1';
const SHELL_CACHE  = `${CACHE_VERSION}-shell`;
const API_CACHE    = `${CACHE_VERSION}-api`;

// Static shell assets to precache on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/pdfjs/web/viewer.html',
  '/pdfjs/web/viewer.css',
  '/pdfjs/web/viewer.js',
  '/pdfjs/build/pdf.js',
  '/pdfjs/build/pdf.worker.js'
];

// ─── IndexedDB helpers (mirrors Capacitor Filesystem web adapter) ──────────────
// DB: 'Disc', store: 'FileStorage', keyPath: 'path'
// Path format: /DATA/downloads/{itemId}/{filename}
const IDB_NAME    = 'Disc';
const IDB_VERSION = 1;
const IDB_STORE   = 'FileStorage';

function openCapacitorDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    // If the DB doesn't exist yet we still resolve with it (no upgrade needed)
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'path' });
        store.createIndex('by_folder', 'folder');
      }
    };
  });
}

async function readFromCapacitorFS(idbPath) {
  // idbPath = /DATA/downloads/{itemId}/{filename}
  const db    = await openCapacitorDB();
  const tx    = db.transaction([IDB_STORE], 'readonly');
  const store = tx.objectStore(IDB_STORE);
  return new Promise((resolve, reject) => {
    const req = store.get(idbPath);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// base64 string → Uint8Array
function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Install: precache shell ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Shell precache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: purge old caches immediately ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => {
            console.log('[SW] Deleting stale cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Message: Instant SkipWaiting and Cache Invalidation ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE' || event.data?.action === 'clearCache') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

// ─── Fetch: main routing ───────────────────────────────────────────────────────

// Paths that must never be intercepted by the static asset handler.
// These are proxy/API routes that Netlify redirects or the browser must handle directly.
const SW_PASSTHROUGH_PREFIXES = ['/manifest/', '/api/', '/buildcode/'];

// Content-Types that are safe to cache as static assets.
// Prevents caching SPA fallback HTML responses for non-HTML resource URLs.
const CACHEABLE_STATIC_TYPES = [
  'application/javascript', 'text/javascript',
  'text/css',
  'image/', 'font/',
  'application/wasm',
  'application/json',
  'image/svg+xml',
  'application/manifest+json'
];

function isStaticContentType(contentType) {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return CACHEABLE_STATIC_TYPES.some(t => ct.includes(t));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. HLS segment requests: /sw-hls/{itemId}/{filename}
  if (url.pathname.startsWith('/sw-hls/')) {
    event.respondWith(handleHlsRequest(url.pathname));
    return;
  }

  // 2. Navigation & document requests (HTML pages & SPA shell) → network-first with cache fallback
  const isDocOrNavigate = request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html') ||
    (url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html'));

  if (isDocOrNavigate) {
    event.respondWith(handleNavigation(request));
    return;
  }

  // 3. Passthrough: /manifest/, /api/, /buildcode/ — never intercept, let browser handle
  if (SW_PASSTHROUGH_PREFIXES.some(p => url.pathname.startsWith(p))) {
    return; // fall through to network
  }

  // 4. Same-origin JS/CSS/images → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // 5. Cross-origin (CDN, Firebase, etc.) → network only, no cache
  // Just let it fall through normally
});

// ─── Handler: HLS segment from Capacitor IndexedDB ────────────────────────────
async function handleHlsRequest(pathname) {
  // pathname: /sw-hls/{itemId}/{filename}
  const parts    = pathname.split('/').filter(Boolean); // ['sw-hls', itemId, filename]
  const itemId   = parts[1];
  const filename = parts[2];

  if (!itemId || !filename) {
    return new Response('Bad HLS path', { status: 400 });
  }

  const idbPath = `/DATA/downloads/${itemId}/${filename}`;

  try {
    const entry = await readFromCapacitorFS(idbPath);

    if (!entry || !entry.content) {
      return new Response(`Segment not found: ${idbPath}`, { status: 404 });
    }

    // content is base64 string (from DownloadTask.arrayBufferToBase64)
    const mimeType = filename.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/mp2t';

    if (filename.endsWith('.m3u8')) {
      // For the playlist, content is utf-8 text stored via encoding: 'utf8'
      const text = typeof entry.content === 'string' ? entry.content : '';
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Binary segment — stored as base64
    const bytes = base64ToUint8Array(entry.content);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(bytes.byteLength),
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[SW] HLS read error:', err);
    return new Response(`SW error: ${err.message}`, { status: 500 });
  }
}

// ─── Handler: Navigation (SPA shell) ──────────────────────────────────────────
async function handleNavigation(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    // Cache the fresh response under /index.html for offline fallback (not dynamic query URLs)
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', networkResponse.clone());
      return networkResponse;
    }
    // If server responded with 5xx (e.g. Netlify 502/503/504), serve cached shell
    if (networkResponse && networkResponse.status >= 500) {
      const cached = await caches.match('/index.html');
      if (cached) return cached;
    }
    return networkResponse;
  } catch {
    // Offline → serve cached shell
    const cached = await caches.match('/index.html');
    if (cached) return cached;
    return new Response('<h1>You are offline</h1><p>Open the NextBridge app to study downloaded content.</p>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// ─── Handler: Static assets (stale-while-revalidate) ──────────────────────────
async function handleStaticAsset(request) {
  const cache  = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  // Start network fetch in background for revalidation
  const networkPromise = fetch(request).then((res) => {
    // Only cache responses with genuine static content-types.
    // This prevents Netlify's SPA catch-all (/* → /index.html) from
    // poisoning the cache with HTML responses for JS/CSS/image URLs.
    if (res.ok && isStaticContentType(res.headers.get('content-type'))) {
      cache.put(request, res.clone());
    }
    return res;
  }).catch(() => null);

  // Return cached immediately if available (stale-while-revalidate)
  if (cached) return cached;

  // No cache hit: must wait for network
  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // If request happens to be for document or shell, fall back to /index.html
  const fallbackShell = await caches.match('/index.html');
  if (fallbackShell) return fallbackShell;

  // Both cache and network failed
  return new Response('Offline', { status: 503 });
}
