import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: vite on :5173 proxies API calls to the Go backend on :8080.
// Prod: `npm run build` output is copied to internal/webui/dist and embedded.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
