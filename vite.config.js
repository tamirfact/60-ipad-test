import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 8000,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
})
