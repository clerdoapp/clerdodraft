import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Writes the offline worker with the exact file list of this build.
const offline = (): Plugin => ({
  name: 'clerdodraft-offline',
  apply: 'build',
  closeBundle() {
    // Only the main document fonts are stored up front; the rest are kept the first time they're used.
    const core = /^(carlito|caladea|arimo|tinos|cousine|noto-naskh-arabic|hanken-grotesk)-(latin|latin-ext|arabic)-/;
    const assets = readdirSync('dist/assets').filter((f) => !f.endsWith('.woff') && (!f.endsWith('.woff2') || core.test(f))).map((f) => `assets/${f}`);
    const files = ['./', 'manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', ...assets];
    const version = assets.join('').length + '-' + Date.now().toString(36);
    writeFileSync(join('dist', 'sw.js'), `const CACHE = 'clerdodraft-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./', { ignoreVary: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreVary: true }).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && e.request.url.endsWith('.woff2')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  })));
});
`);
  },
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [react(), offline()],
  build: { target: ['es2022', 'safari16'], sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
