import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 기본은 루트 '/' — Cloudflare Pages(qdrive-unified.pages.dev)가 정본 배포처.
  // GitHub Pages는 저장소 하위경로라 워크플로에서 BASE_PATH=/qdrive-unified/ 를 넘긴다.
  base: process.env.BASE_PATH ?? '/',
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
