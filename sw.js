// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte v1.6.0
// STRATÉGIE : Network First (toujours le réseau, cache en fallback)
// Chaque mise à jour du code → incrémenter la version ici
// ============================================================

const CACHE_NAME = 'mcr-flotte-v1.6.0';
const CACHE_URLS = ['./', './index.html', './icon-192.png', './manifest.json'];

// Rappels en mémoire { id, titre, corps, tag, fireAt }
let rappelsProgrammes = [];

// ── Installation ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .catch(e => console.warn('SW cache partiel:', e))
  );
  // Prendre le contrôle immédiatement sans attendre
  self.skipWaiting();
});

// ── Activation : supprimer les anciens caches ─────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('SW: suppression ancien cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch : NETWORK FIRST avec fallback cache ────────────────
// → Toujours essayer le réseau en premier
// → Si pas de réseau (offline), utiliser le cache
// → Firebase et Google passent toujours sans cache
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Firebase / Google : jamais mis en cache
  if (url.includes('firestore') || url.includes('firebase') ||
      url.includes('googleapis') || url.includes('gstatic') ||
      url.includes('google.com')) {
    return;
  }

  // Requêtes non-GET : pas de cache
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Succès réseau → mettre à jour le cache et retourner
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Pas de réseau → fallback cache
        return caches.match(event.request)
          .then(cached => cached || caches.match('./index.html'));
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
    body:               r.corps,
    icon:               './icon-192.png',
    badge:              './icon-192.png',
    tag:                r.tag,
    requireInteraction: true,
    actions:            [{ action: 'voir', title: 'Voir le RV' }]
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
