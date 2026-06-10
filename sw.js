// ============================================================
// SERVICE WORKER — MCR Opont Gestion de Flotte v1.6.1
// STRATÉGIE : Network First (toujours le réseau, cache en fallback)
// v1.6.1 : Notification push quotidienne à 7h00
// ============================================================

const CACHE_NAME = 'mcr-flotte-v260610.1402';
const CACHE_URLS = ['./', './index.html', './icon-192.png', './manifest.json'];

// Rappels RV en mémoire { id, titre, corps, tag, fireAt }
let rappelsProgrammes = [];

// Timer du résumé quotidien
let timerResumeQuotidien = null;

// ── Installation ──────────────────────────────────────────────
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
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('SW: suppression ancien cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch : Network First ────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('firestore') || url.includes('firebase') ||
      url.includes('googleapis') || url.includes('gstatic') ||
      url.includes('google.com')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match('./index.html'))
      )
  );
});

// ── Messages depuis l'application ────────────────────────────
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  // Rappel RV (existant)
  if (data.type === 'PROGRAMMER_RAPPEL') {
    const { id, titre, corps, delai, tag } = data.payload;
    rappelsProgrammes = rappelsProgrammes.filter(r => r.id !== id);
    rappelsProgrammes.push({ id, titre, corps, tag, fireAt: Date.now() + delai });
    setTimeout(() => envoyerRappel(id), delai);
    console.log('SW: rappel dans', Math.round(delai / 3600000), 'h — RV', id);
    return;
  }

  if (data.type === 'ANNULER_RAPPEL') {
    rappelsProgrammes = rappelsProgrammes.filter(r => r.id !== data.id);
    return;
  }

  // Résumé quotidien à 7h00
  if (data.type === 'PROGRAMMER_RESUME_QUOTIDIEN') {
    const { contenu, delaiMs } = data.payload;

    // Annuler le timer précédent si existant
    if (timerResumeQuotidien) {
      clearTimeout(timerResumeQuotidien);
      timerResumeQuotidien = null;
    }

    console.log('SW: résumé quotidien dans', Math.round(delaiMs / 3600000 * 10) / 10, 'h');

    timerResumeQuotidien = setTimeout(() => {
      envoyerResumeQuotidien(contenu);
    }, delaiMs);
    return;
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
});

// ── Envoi rappel RV ──────────────────────────────────────────
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

// ── Envoi résumé quotidien ───────────────────────────────────
function envoyerResumeQuotidien(contenu) {
  const { titre, corps, nbAlertes } = contenu;

  self.registration.showNotification(titre, {
    body:               corps,
    icon:               './icon-192.png',
    badge:              './icon-192.png',
    tag:                'resume-quotidien',
    requireInteraction: false,
    silent:             false,
    data:               { url: './', type: 'resume' },
    actions: [
      { action: 'ouvrir', title: '📊 Ouvrir l\'app' },
      { action: 'fermer', title: 'Fermer' }
    ]
  });

  // Reprogrammer pour le lendemain à 7h00 (24h)
  timerResumeQuotidien = setTimeout(() => {
    // Demander à l'app de recalculer le résumé
    self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'RECALCULER_RESUME' }));
      // Si aucun client actif, envoyer une notif générique
      if (!clients.length) {
        envoyerResumeQuotidien({
          titre: '🚗 MCR Opont — Résumé',
          corps: 'Ouvrez l\'app pour voir les alertes du jour.',
          nbAlertes: 0
        });
      }
    });
  }, 24 * 60 * 60 * 1000); // exactement 24h après
}

// ── Clic sur une notification ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'fermer') return;

  const notifType = event.notification.data?.type;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('Flotte-MCR') && 'focus' in client) {
          client.focus();
          // Envoyer le type de notification pour naviguer au bon onglet
          client.postMessage({
            type: notifType === 'message' ? 'NOTIF_MESSAGE' : 'NOTIF_RESUME'
          });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
