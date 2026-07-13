import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/qdrive-unified/', // GitHub Pages 서브경로 — 배포 저장소명과 일치시킬 것
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 공공데이터포털(TAGO)은 CORS 미지원 — 개발 서버가 중계
      '/tago': {
        target: 'https://apis.data.go.kr',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tago/, ''),
      },
    },
  },
})
