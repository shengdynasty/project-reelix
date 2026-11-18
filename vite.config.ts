/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The production build is served from https://sheng-yan.com/reelix/, so every asset URL is prefixed with
// /reelix/. `npm run dev` serves from / as usual.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/reelix/' : '/',
  plugins: [react(), tailwindcss()],
  // transformers.js (inside kokoro-js) code-splits, so the TTS worker must be an ES module worker.
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['kokoro-js'] },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
}))
