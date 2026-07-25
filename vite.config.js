import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  // Only NestIQ's own suite counts toward the gate. Scoping the test root to
  // src/ keeps any stray cloned repo (e.g. a future eval_repos/) from
  // contaminating the run or the pass/fail count.
  test: {
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/eval_repos/**'],
  },
})
