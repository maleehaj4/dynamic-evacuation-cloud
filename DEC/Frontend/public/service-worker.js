const APP_CACHE = 'evac-app-v1'
const MAP_CACHE = 'evac-tiles-v1'

const PRECACHE_FILES = [
  '/',
  '/index.html',
  '/data/hyderabad_graph.json',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(PRECACHE_FILES))
  )
  self.skipWaiting()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(caches.open(MAP_CACHE).then(async cache => {
      const cached = await cache.match(e.request)
      if (cached) return cached
      try {
        const res = await fetch(e.request)
        cache.put(e.request, res.clone())
        return res
      } catch { return new Response('', { status: 503 }) }
    }))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ offline: true }),
          { headers: { 'Content-Type': 'application/json' } })
      )
    )
    return
  }

  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
})