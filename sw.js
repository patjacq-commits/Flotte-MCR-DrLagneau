// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte
// STRATÉGIE : HTML toujours depuis le réseau, assets en cache
// ============================================================

const CACHE_NAME = 'mcr-flotte-v260814.1716';
const CACHE_ASSETS = ['./icon-192.png', './manifest.json'];

let timerResumeQuotidien = null;

// ── Installation ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_ASSETS))
      .catch(e => console.warn('SW cache partiel:', e))
  );
  // Forcer le nouveau SW à prendre le contrôle immédiatement
  self.skipWaiting();
});

// ── Activation ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('SW: suppression ancien cache', k);
          return caches.delete(k);
        })
      ))
      .then(() => {
        console.log('SW: activation v260704.1436 — prise de contrôle');
        return self.clients.claim();
      })
      .then(() => {
        // Forcer le rechargement de tous les clients ouverts
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: '260704.1436' });
        });
      })
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (url.includes('firestore') || url.includes('firebase') ||
      url.includes('googleapis') || url.includes('gstatic') ||
      url.includes('google.com')) return;

  // HTML principal → toujours réseau, jamais en cache
  const isHTML = url.includes('.html') || url.includes('nocache=') ||
                 url.endsWith('/') || url === self.location.origin + '/';
  if (isHTML) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets (icônes, manifest) → cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
  );
});

// ── Message handler ──────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
