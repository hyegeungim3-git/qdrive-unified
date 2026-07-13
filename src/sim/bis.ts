import { useSyncExternalStore } from 'react'

/**
 * 대구 BIS 실데이터 연동 — 국토교통부 TAGO 오픈API (cityCode 22 = 대구).
 * 시뮬레이션 버스와 함께 실제 대구 시내버스 위치를 지도에 오버레이한다.
 * 공공데이터포털 일반 인증키 1개로 동작 (data.go.kr 회원가입 → 활용신청 → 즉시 발급).
 * CORS는 Vite 개발서버 프록시(/tago)로 우회.
 */

export interface RealBus {
  vehicleNo: string
  routeNo: string
  lat: number
  lng: number
  /** 방면 (nodeord 1xxx=기점→종점, 2xxx=종점→기점 인코딩에서 도출) */
  heading: string
}

export type BisStatus = 'idle' | 'loading' | 'ok' | 'error'

export interface BisState {
  status: BisStatus
  message: string
  buses: RealBus[]
  lastUpdated: number | null
  matchedRoutes: string[]
}

const CITY_CODE = 22 // 대구광역시
const POLL_MS = 15000
export const DEFAULT_ROUTES = ['급행1', '급행3', '급행10', '순환2']
const KEY_STORAGE = 'qdrive-bis-key'

/**
 * 배포판(GitHub Pages)은 Cloudflare Worker 프록시 경유 — 키가 Worker 비밀변수에 있어
 * 사용자 키 입력이 필요 없다. 로컬 개발은 Vite 프록시(/tago) + localStorage 키.
 */
const IS_DEV = import.meta.env.DEV
const WORKER_BASE = 'https://qdrive-bis-proxy.hyegeungim3.workers.dev' // 배포 후 실제 URL로 확정

let state: BisState = { status: 'idle', message: '', buses: [], lastUpdated: null, matchedRoutes: [] }
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let routeIds: { routeId: string; routeNo: string; startName: string; endName: string }[] = []

/** 종점 표기 정리: "매곡(종점)" → "매곡", "동화시설집단지구(종점)1" → "동화시설집단지구" */
function cleanTerminus(name: unknown): string {
  return String(name ?? '')
    .replace(/\(.*?\)\d*$/, '')
    .trim()
}

function emit(next: Partial<BisState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function getBisKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? ''
}

export function setBisKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key.trim())
}

/** 인코딩키(%포함)면 그대로, 디코딩키면 인코딩해서 사용 */
function encodedKey(): string {
  const k = getBisKey()
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k)
}

async function tago(path: string, params: string): Promise<any> {
  const url = IS_DEV
    ? `/tago/1613000/${path}?serviceKey=${encodedKey()}&_type=json&${params}`
    : `${WORKER_BASE}/1613000/${path}?_type=json&${params}`
  const res = await fetch(url)
  const text = await res.text()
  // 키 오류 등은 XML 또는 평문으로 반환됨
  if (text.trimStart().startsWith('<')) {
    const m = text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>|<errMsg>([^<]+)<\/errMsg>/)
    throw new Error(m ? (m[1] ?? m[2]) : 'API 오류 (XML 응답)')
  }
  if (!text.trimStart().startsWith('{')) {
    throw new Error(`인증 실패 또는 API 오류: ${text.trim().slice(0, 80)} — 인증키를 확인하세요`)
  }
  const json = JSON.parse(text)
  const header = json?.response?.header
  if (header && header.resultCode !== '00') throw new Error(header.resultMsg ?? 'API 오류')
  return json?.response?.body
}

function asItems(body: any): any[] {
  const item = body?.items?.item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

async function resolveRouteIds(routeNos: string[]): Promise<void> {
  const found: typeof routeIds = []
  for (const no of routeNos) {
    const body = await tago(
      'BusRouteInfoInqireService/getRouteNoList',
      `cityCode=${CITY_CODE}&routeNo=${encodeURIComponent(no)}&numOfRows=20`,
    )
    const exact = asItems(body).find((x) => String(x.routeno) === no)
    if (exact)
      found.push({
        routeId: String(exact.routeid),
        routeNo: no,
        startName: cleanTerminus(exact.startnodenm),
        endName: cleanTerminus(exact.endnodenm),
      })
  }
  routeIds = found
}

async function pollOnce(): Promise<void> {
  const buses: RealBus[] = []
  for (const r of routeIds) {
    const body = await tago(
      'BusLcInfoInqireService/getRouteAcctoBusLcList',
      `cityCode=${CITY_CODE}&routeId=${encodeURIComponent(r.routeId)}&numOfRows=100`,
    )
    for (const it of asItems(body)) {
      // 대구 BIS의 nodeord: 1xxx = 기점→종점 방향, 2xxx = 종점→기점 방향
      const dirCode = Math.floor(Number(it.nodeord ?? 0) / 1000)
      const heading = dirCode === 1 ? r.endName : dirCode === 2 ? r.startName : ''
      buses.push({
        vehicleNo: String(it.vehicleno ?? ''),
        routeNo: r.routeNo,
        lat: Number(it.gpslati),
        lng: Number(it.gpslong),
        heading,
      })
    }
  }
  emit({ status: 'ok', buses, lastUpdated: Date.now(), message: '' })
}

export async function startBis(routeNos: string[] = DEFAULT_ROUTES): Promise<void> {
  stopBis()
  if (IS_DEV && !getBisKey()) {
    emit({ status: 'error', message: '인증키가 없습니다. data.go.kr에서 발급한 키를 입력하세요.' })
    return
  }
  emit({ status: 'loading', message: '노선 조회 중…', buses: [] })
  try {
    await resolveRouteIds(routeNos)
    if (routeIds.length === 0) {
      emit({ status: 'error', message: '노선을 찾지 못했습니다 (심야에는 데이터가 없을 수 있음)' })
      return
    }
    emit({ matchedRoutes: routeIds.map((r) => r.routeNo) })
    await pollOnce()
    timer = setInterval(() => {
      pollOnce().catch((e) => emit({ status: 'error', message: String(e.message ?? e) }))
    }, POLL_MS)
  } catch (e) {
    emit({ status: 'error', message: String((e as Error).message ?? e) })
  }
}

export function stopBis() {
  if (timer) clearInterval(timer)
  timer = null
  emit({ status: 'idle', buses: [], message: '', matchedRoutes: [] })
}

export function useBis(): BisState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
