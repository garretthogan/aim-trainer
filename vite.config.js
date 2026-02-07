import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/aim-trainer/' : '/',
  server: {
    host: true, // listen on 0.0.0.0 so Quest (same Wi‑Fi) can open http://<your-pc-ip>:5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'vr-test': resolve(__dirname, 'vr-test.html'),
      },
    },
  },
})
