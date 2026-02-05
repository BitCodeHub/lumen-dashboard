// Service worker disabled - causing caching issues with Chrome extensions
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
