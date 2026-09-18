import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// El código del frontend vive en frontend/, pero el proyecto (package.json,
// node_modules, .env) es uno solo y está en la raíz.
export default defineConfig({
  root: fileURLToPath(new URL('./frontend', import.meta.url)),
  // Las variables VITE_* se leen del .env de la raíz, no de frontend/.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: {
    proxy: {
      // El mismo truco que hace la CloudFront Function en producción: recoge
      // /api/* y lo reenvía a la API quitando el prefijo. Así
      // VITE_API_BASE_URL=/api vale igual en local y desplegado.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    // dist/ dentro de frontend/: es lo que se sube a S3 el día 1.
    outDir: fileURLToPath(new URL('./frontend/dist', import.meta.url)),
    emptyOutDir: true,
  },
})
