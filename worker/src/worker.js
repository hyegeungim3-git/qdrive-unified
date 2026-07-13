/**
 * Qdrive BIS 프록시 — Cloudflare Worker
 *
 * 역할: GitHub Pages(정적 사이트)에서 공공데이터포털 TAGO API를 호출할 수 있게 중계한다.
 *  - CORS 헤더 부여 (data.go.kr은 브라우저 직접 호출 불가)
 *  - 인증키(TAGO_KEY)는 Worker 비밀변수 — 클라이언트·저장소에 노출되지 않음
 *  - 남용 방지: 허용 오리진 + TAGO 버스 조회 2개 경로 + 대구(cityCode=22)만 통과
 *
 * 배포: npx wrangler deploy
 * 키 등록: npx wrangler secret put TAGO_KEY  (URL 인코딩된 키 그대로)
 */

const ALLOWED_ORIGINS = [
  'https://hyegeungim3-git.github.io',
  'http://localhost:5173', // vite dev
  'http://127.0.0.1:5173',
  'http://localhost:4173', // vite preview (프로덕션 빌드 로컬 검증)
  'http://127.0.0.1:4173',
]

const ALLOWED_PATHS = [
  '/1613000/BusRouteInfoInqireService/getRouteNoList',
  '/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList',
]

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: cors })
    if (!ALLOWED_PATHS.includes(url.pathname)) return new Response('Forbidden: path', { status: 403, headers: cors })
    if (url.searchParams.get('cityCode') !== '22')
      return new Response('Forbidden: cityCode', { status: 403, headers: cors })

    // 업스트림 URL 구성 — serviceKey는 이미 URL 인코딩된 비밀값이라 그대로 이어붙인다
    const upstream = new URL('https://apis.data.go.kr' + url.pathname)
    for (const [k, v] of url.searchParams) {
      if (k !== 'serviceKey') upstream.searchParams.set(k, v)
    }
    // trim(): secret 등록 시 셸이 붙인 개행 방어 (PowerShell echo가 CRLF를 붙여 인증 실패했던 사례)
    const finalUrl = upstream.toString() + '&serviceKey=' + (env.TAGO_KEY || '').trim()

    const res = await fetch(finalUrl, { headers: { Accept: 'application/json' } })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        ...cors,
        'Content-Type': res.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=10', // 10초 캐시 — 폴링 부하·쿼터 절약
      },
    })
  },
}
