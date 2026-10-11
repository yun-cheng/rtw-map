// Builds the service worker (pwa/sw.ts) with the list of the built files, so it caches this version of the app whole.
// Production builds only (npm run dev has no service worker).
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { transform } from 'esbuild'
import type { Plugin } from 'vite'

const SW = new URL('./sw.ts', import.meta.url)

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => relative(dir, join(e.parentPath, e.name)))
}

export function pwa(): Plugin {
  let publicDir = ''
  return {
    name: 'rtw-pwa',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    async writeBundle(options, bundle) {
      const source = await readFile(SW, 'utf8')
      // (A new version when the app or this worker changes.)
      const hash = createHash('sha256').update(source)
      const built = Object.values(bundle).filter((f) => !f.fileName.endsWith('.map'))
      for (const f of built) hash.update(f.fileName).update(f.type === 'chunk' ? f.code : f.source)
      const own = await files(publicDir)
      for (const f of own) hash.update(f).update(await readFile(join(publicDir, f)))
      // (The page as "/": the server sends "/index.html" on to "/", and a page from a redirect can't be used.)
      const precache = [...built.map((f) => f.fileName), ...own].map((f) => (f === 'index.html' ? '/' : `/${f.split('\\').join('/')}`))
      const { code } = await transform(source, { loader: 'ts', target: 'es2022' })
      const head = `const PRECACHE = ${JSON.stringify(precache)};\nconst VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 12))};\n`
      await writeFile(join(options.dir!, 'sw.js'), head + code)
    },
  }
}
