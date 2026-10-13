import { cp, readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { pwa } from './pwa/plugin.ts'

const SPEECH = join(import.meta.dirname, 'data/gen/speech')

/** The phrases' clips (data/gen/speech, scripts/build-speech.ts) at /speech/: served as they are while developing,
 *  copied into the build. Not cached with the app (too many to fetch at install): the app keeps those played. */
function speech(): Plugin {
  return {
    name: 'rtw-speech',
    configureServer(server) {
      server.middlewares.use('/speech', (req, res, next) => {
        const path = normalize(join(SPEECH, decodeURIComponent((req.url ?? '').split('?')[0])))
        if (!path.startsWith(SPEECH + '/') || !path.endsWith('.mp3')) return next()
        readFile(path).then((body) => {
          res.setHeader('Content-Type', 'audio/mpeg')
          res.end(body)
        }, () => next())
      })
    },
    async writeBundle(options) {
      await cp(SPEECH, join(options.dir!, 'speech'), { recursive: true }).catch(() => {})
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), speech(), pwa()],
  worker: { format: 'es' },
  // The trip assistant's API runs in the Worker (npm run dev:api). Its same-site check compares the Origin header
  // with its own address, which differs behind this proxy, so the header is dropped here (development only).
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', configure: (proxy) => proxy.on('proxyReq', (req) => req.removeHeader('origin')) },
      // The runner's side of assistant runs (it calls back the address the run was started on).
      '/internal': { target: 'http://localhost:8787' },
    },
  },
})
