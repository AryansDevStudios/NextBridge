import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/pw-static': {
        target: 'https://static.pw.live',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pw-static/, ''),
      },
      '/api/pw-gateway': {
        target: 'https://nexthope-pw.space-z.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pw-gateway/, ''),
      },
      '/api/course-proxy': {
        target: 'https://course.nexttoppers.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/course-proxy/, ''),
      },
    },
  },
})
