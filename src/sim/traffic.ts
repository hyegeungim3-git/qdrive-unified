import { EXTRA_ROUTES } from './routes'
import { MAJOR_ROADS } from './roads'
import { indexPolyline, pointAt, type PolylineIndex } from './geo'
import type { LatLng } from './geo'

/**
 * 배경 교통 — 주요 노선과 간선도로 위를 «표시용» 버스가 달린다.
 *
 * 실증 9대(`snap.vehicles`)와 **철저히 분리**한다. 여기 있는 버스는 상태를 갖지 않고,
 * 거리·연료·CO₂·안전점수 어디에도 들어가지 않는다. 시뮬 시각만 넣으면 위치가 나오는 순수 함수다.
 * 이렇게 두는 이유: 지도를 채우려고 엔진에 차량을 더하면 「실증 9대」라는 스케일이 무너지고
 * 정산·연비·귀속 수치가 전부 오염된다. 지도는 도시처럼 보이되, 숫자는 실증 그대로여야 한다.
 */

export interface BgBus {
  id: string
  pos: LatLng
  color: string
  /** 무엇 위를 달리는가 — 툴팁에 그대로 쓴다 */
  on: string
  kind: '주요 노선' | '간선도로'
}

/** 대당 순항 속도(m/s) — 시내버스 평균 20km/h 근사 */
const SPEED = 5.6
/** 노선당 배경 버스 수 */
const PER_ROUTE = 3
/** 도로 조각당 배경 버스 수 (긴 조각에만) */
const PER_ROAD_SEG = 1
/** 간선도로에서 배경 버스를 태울 최소 조각 길이(m) — 짧은 조각은 점처럼 보인다 */
const MIN_ROAD_SEG_M = 900

type Track = { key: string; idx: PolylineIndex; color: string; on: string; kind: BgBus['kind']; n: number }

/** 트랙은 한 번만 만든다 — 폴리라인 인덱싱은 비싸고 노선·도로는 변하지 않는다 */
let cache: Track[] | null = null

function tracks(): Track[] {
  if (cache) return cache
  const out: Track[] = []

  EXTRA_ROUTES.forEach((r) => {
    out.push({ key: `x:${r.id}`, idx: indexPolyline(r.points), color: r.color, on: r.name, kind: '주요 노선', n: PER_ROUTE })
  })

  MAJOR_ROADS.forEach((rd) => {
    rd.segments.forEach((seg, i) => {
      if (seg.length < 2) return
      const idx = indexPolyline(seg)
      if (idx.totalM < MIN_ROAD_SEG_M) return
      out.push({ key: `r:${rd.name}:${i}`, idx, color: '#f59e0b', on: rd.name, kind: '간선도로', n: PER_ROAD_SEG })
    })
  })

  cache = out
  return out
}

/** 문자열에서 0~1 난수 — 시드 고정이라 새로고침해도 같은 배치가 나온다 */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/**
 * 시뮬 시각(초) → 배경 버스 위치.
 * 왕복 트랙은 «갔다 오는» 삼각파로 접어 끝에서 자연스럽게 되돌아온다.
 */
export function backgroundBuses(simTime: number): BgBus[] {
  const out: BgBus[] = []
  for (const t of tracks()) {
    const total = t.idx.totalM
    if (total < 200) continue
    for (let i = 0; i < t.n; i++) {
      const offset = hash01(`${t.key}#${i}`)
      // 왕복 주기: 편도 total 을 두 번 — 2*total 안에서 접는다
      const cycle = total * 2
      const d = (simTime * SPEED + offset * cycle) % cycle
      const along = d <= total ? d : cycle - d
      const { pos } = pointAt(t.idx, along)
      out.push({
        id: `${t.key}#${i}`,
        pos,
        color: t.color,
        on: t.on,
        kind: t.kind,
      })
    }
  }
  return out
}

