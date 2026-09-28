"use strict";

/* ==========================================================
   SPARTA AI — Production PWA Service Worker
   - يخزّن ملفات الواجهة الأساسية فقط.
   - لا يخزّن /api ولا مفاتيح ولا ردود الذكاء الاصطناعي.
   ========================================================== */

const CACHE_VERSION = "sparta-ai-cache-v2026-09-28-3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/assistant.html",
  "/about.html",
  "/faq.html",
  "/privacy.html",
  "/404.html",
  "/style.css",
  "/page.css",
  "/floating-assistant.css",
  "/app.js",
  "/floating-assistant.js",
  "/pwa.js",
  "/public-theme.js",
  "/web.webmanifest",
  "/assistant.webmanifest",
  "/manifest.json",
  "/favicon.svg",
  "/images/favicon-32.png",
  "/images/apple-touch-icon.png",
  "/images/icon-192.png",
  "/images/icon-512.png",
  "/images/icon-512-maskable.png",
  "/images/bot-spark.svg",
  "/images/sparta-mark.svg",
  "/images/sparta-logo.svg",
  "/images/og-image.jpg"
];

const NEVER_CACHE_PREFIXES = [
  "/api/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.warn("SPARTA AI SW install cache failed:", error);
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_VERSION)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNeverCached(url) {
  return NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNeverCached(url)) {
    // Network only for AI/API calls to protect privacy and prevent stale responses.
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  if (/\.(?:png|jpg|jpeg|svg|webp|gif|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/\.(?:css|js|webmanifest|json|html)$/i.test(url.pathname) || APP_SHELL.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
