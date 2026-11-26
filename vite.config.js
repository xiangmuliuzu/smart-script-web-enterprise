import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { remoteMediaFallback } from './vite.media-fallback'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const prefix = env.VITE_APP_BASE_API || '/dev-api'
  // 本机 uploadPath 缺的媒体从远端存储回源（仅 dev server 生效）
  const mediaFallback = remoteMediaFallback({ apiPrefix: prefix, remoteBase: env.VITE_REMOTE_MEDIA_BASE, localDir: env.VITE_LOCAL_PROFILE_DIR })
  return { base: '/enterprise/', plugins: [vue(), mediaFallback], server: { port: 3002, strictPort: true, proxy: { [prefix]: { target: env.VITE_API_TARGET || 'http://localhost:8080', changeOrigin: true, rewrite: path => path.slice(prefix.length) }, '/ws': { target: env.VITE_API_TARGET || 'http://localhost:8080', changeOrigin: true, ws: true } } } }
})
