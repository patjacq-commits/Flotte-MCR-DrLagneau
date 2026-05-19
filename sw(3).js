// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte
// Mettre à jour CACHE_NAME à chaque nouvelle version du HTML
// pour forcer le rechargement chez tous les utilisateurs
// ============================================================

const CACHE_NAME = 'mcr-flotte-v1.0.0';

// Fichiers à mettre en cache pour le mode hors ligne
const CACHE_URLS = [
  './',
  './index.html',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// ── Installation : mise en cache des ressources ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS).catch(e => {
        // Si une ressource externe échoue, on continue quand même
        console.warn('SW cache partiel:', e);
      });
    })
  );
  // Ne pas attendre l'expiration de l'ancien SW
  self.skipWaiting();
});

// ── Activation : suppression des anciens caches ──────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('SW supprime ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Interception des requêtes ────────────────────────────────
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes Firebase (temps réel obligatoire)
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('google')) {
    return; // Laisser passer sans cache
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Ressource en cache : servir immédiatement + mettre à jour en arrière-plan
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached); // Si hors ligne, retourner le cache
        return cached; // Réponse immédiate depuis le cache
      }
      // Pas en cache : aller chercher sur le réseau
      return fetch(event.request).catch(() => {
        // Hors ligne et pas en cache : retourner la page principale
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Message depuis l'application ─────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
