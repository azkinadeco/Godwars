/**
 * GOD WARS: ASGARD ROYALE — Lightweight Mobile PWA Service Worker
 * Enables native full-screen "Add to Home Screen" app experience on Android & iOS.
 */
const CACHE_NAME = 'godwars-asgard-v9';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
