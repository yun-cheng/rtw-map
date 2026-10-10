import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
