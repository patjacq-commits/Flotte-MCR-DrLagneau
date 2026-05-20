// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte v1.0.0
// ============================================================

const CACHE_NAME = 'mcr-flotte-v1.0.0';

const CACHE_URLS = [
  './',
  './index.html'
];

// Rappels en mémoire { id, titre, corps, tag, fireAt }
let rappelsProgrammes = [];

// ── Installation ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .catch(e => console.warn('SW cache partiel:', e))
  );
  self.skipWaiting();
});

// ── Activation ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Cache réseau ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Laisser passer Firebase et Google sans cache
  const url = event.request.url;
  if (url.includes('firestore') || url.includes('firebase') ||
      url.includes('googleapis') || url.includes('gstatic')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Toujours tenter le réseau en arrière-plan pour mettre à jour le cache
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      // Retourner le cache immédiatement si disponible, sinon attendre le réseau
      return cached || networkFetch || caches.match('./index.html');
    })
  );
});

// ── Messages depuis l'application ────────────────────────────
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'PROGRAMMER_RAPPEL') {
    const { id, titre, corps, delai, tag } = data.payload;
    const fireAt = Date.now() + delai;
    rappelsProgrammes = rappelsProgrammes.filter(r => r.id !== id);
    rappelsProgrammes.push({ id, titre, corps, tag, fireAt });
    // Planifier via setTimeout (fiable dans les SW modernes)
    setTimeout(() => envoyerRappel(id), delai);
    console.log('SW: rappel dans', Math.round(delai / 3600000), 'h — RV', id);
    return;
  }

  if (data.type === 'ANNULER_RAPPEL') {
    rappelsProgrammes = rappelsProgrammes.filter(r => r.id !== data.id);
  }
});

// ── Envoi du rappel ───────────────────────────────────────────
function envoyerRappel(id) {
  const r = rappelsProgrammes.find(x => x.id === id);
  if (!r) return;
  self.registration.showNotification(r.titre, {
    body:             r.corps,
    icon:             './icon-192.png',
    badge:            './icon-192.png',
    tag:              r.tag,
    requireInteraction: true,
    actions:          [{ action: 'voir', title: 'Voir le RV' }]
  });
  rappelsProgrammes = rappelsProgrammes.filter(x => x.id !== id);
}

// ── Clic sur une notification ─────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('Flotte-MCR') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIF_CLICK' });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
