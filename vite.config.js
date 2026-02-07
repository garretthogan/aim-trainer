import { defineConfig } from 'vite'

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
  },
})
