/* Service worker : chaque ouverture vérifie auprès du serveur si les fichiers
   ont changé (requête conditionnelle) ; la dernière version reçue sert de
   secours hors ligne. L'app-shell est aussi pré-mis en cache à l'installation,
   pour qu'un tout premier lancement hors ligne affiche l'app au lieu d'un
   écran blanc. */
const CACHE = 'cavalia-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/theme.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/views/equine.css',
  './js/main.js',
  './js/config/firebase-config.js',
  './js/core/dates.js',
  './js/core/schema.js',
  './js/core/store.js',
  './js/core/utils.js',
  './js/core/validation.js',
  './js/features/calendar-prompt.js',
  './js/features/ics.js',
  './js/services/firebase.js',
  './js/services/storage.js',
  './js/ui/charts.js',
  './js/ui/dialog.js',
  './js/ui/equine-icons.js',
  './js/ui/icons.js',
  './js/ui/status.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/views/appointments.js',
  './js/views/calendar.js',
  './js/views/common.js',
  './js/views/contacts.js',
  './js/views/cures.js',
  './js/views/finance.js',
  './js/views/home.js',
  './js/views/planning.js',
  './js/views/profile.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

async function precache() {
  const cache = await caches.open(CACHE);
  // addAll échouerait en bloc au premier fichier manquant ; on isole chaque échec
  // pour que le reste de l'app-shell reste disponible hors ligne.
  await Promise.all(
    PRECACHE_URLS.map(url => cache.add(url).catch(err => console.warn('[sw] précache échoué:', url, err)))
  );
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase (auth + base de données), polices… : non concernés.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
