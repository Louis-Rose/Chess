import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5001'
    }
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      // Multiple HTML entries that all boot the same SPA. nginx serves each for
      // its route so the per-app PWA manifest is hard-coded in the served HTML
      // (Safari ignores a JS-swapped manifest):
      //   blitzcrewrankings.html — custom link-preview tags for /blitzcrewrankings
      //   fit.html               — gym PWA manifest for /fit
      //   chess.html             — chess PWA manifest for /chess
      input: {
        main: 'index.html',
        blitzcrewrankings: 'blitzcrewrankings.html',
        fit: 'fit.html',
        chess: 'chess.html',
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
        }
      }
    }
  }
})
