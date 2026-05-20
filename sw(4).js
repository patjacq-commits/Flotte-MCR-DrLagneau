// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte v1.0.0
// Mettre à jour CACHE_NAME à chaque nouvelle version
// ============================================================

const CACHE_NAME = 'mcr-flotte-v1.0.0';

const CACHE_URLS = [
  './',
  './index.html',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// Stocke les rappels programmés { id, titre, corps, tag, fireAt }
let rappelsProgrammes = [];

// ── Installation ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CACHE_URLS).catch(e => console.warn('SW cache partiel:', e))
    )
  );
  self.skipWaiting();
});

// ── Activation ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => {
      self.clients.claim();
      // Démarrer la boucle de vérification des rappels
      demarrerBoucleRappels();
    })
  );
});

// ── Cache réseau ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('google')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Messages depuis l'application ────────────────────────────
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (data.type === 'PROGRAMMER_RAPPEL') {
    const { id, titre, corps, delai, tag } = data.payload;
    const fireAt = Date.now() + delai;

    // Remplacer si un rappel pour ce RV existe déjà
    rappelsProgrammes = rappelsProgrammes.filter(r => r.id !== id);
    rappelsProgrammes.push({ id, titre, corps, tag, fireAt });
    console.log(`SW: rappel programmé dans ${Math.round(delai/3600000)}h pour RV ${id}`);
  }

  if (data.type === 'ANNULER_RAPPEL') {
    rappelsProgrammes = rappelsProgrammes.filter(r => r.id !== data.id);
  }
});

// ── Clic sur une notification ─────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si l'app est déjà ouverte, la mettre au premier plan
      for (const client of clientList) {
        if (client.url.includes('Flotte-MCR') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIF_CLICK' });
          return;
        }
      }
      // Sinon ouvrir l'app
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});

// ── Boucle de vérification des rappels (toutes les 10 minutes) ─
function demarrerBoucleRappels() {
  setInterval(verifierRappels, 10 * 60 * 1000); // toutes les 10 min
  verifierRappels(); // vérifier immédiatement au démarrage
}

function verifierRappels() {
  const now = Date.now();
  const aFirer = rappelsProgrammes.filter(r => r.fireAt <= now);

  aFirer.forEach(r => {
    self.registration.showNotification(r.titre, {
      body: r.corps,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: r.tag,
      requireInteraction: true, // reste affiché jusqu'à interaction
      actions: [
        { action: 'voir', title: 'Voir le RV' }
      ]
    });
    // Supprimer le rappel après l'avoir envoyé
    rappelsProgrammes = rappelsProgrammes.filter(x => x.id !== r.id);
  });
}
