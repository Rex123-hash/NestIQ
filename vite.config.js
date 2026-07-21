import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Local browsers cannot call the production API directly because its CORS
    // allowlist intentionally contains only production origins. Proxy only the
    // grounded-reviews requests during development; production never uses this.
    proxy: {
      '/reviews-api': {
        target: 'https://nestiq-api-603719952072.us-central1.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/reviews-api/, ''),
      },
    },
  },
})
