// =============================================
// ALS ADMIN — Service Worker
// Cache básico para que funcione más rápido
// =============================================

const CACHE_NAME = 'als-admin-v4';

// Archivos que se guardan en caché para carga rápida
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './admin.html',
  './agregar.html',
  './nueva-renta.html',
  './admin.js',
  './agregar.js',
  './nueva-renta.js',
  './login.js',
  './manifest.json',
  './Icono.jpg'
];

// Al instalar: guarda los archivos en caché
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ARCHIVOS_CACHE);
    })
  );
  self.skipWaiting();
});

// Al activar: limpia cachés viejos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Al hacer fetch: intenta la red primero, si falla usa caché
self.addEventListener('fetch', (e) => {
  // Solo cachear GET (POST/PUT son llamadas a Supabase — no cacheables)
  if (e.request.method !== 'GET') return;

  // No cachear peticiones a APIs externas
  if (e.request.url.includes('google') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Si la red respondió bien, actualiza el caché
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => {
        // Sin internet: sirve desde caché
        return caches.match(e.request);
      })
  );
});
