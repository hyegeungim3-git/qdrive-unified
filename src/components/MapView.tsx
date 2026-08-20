import { memo, useEffect, useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from '../theme'
import { DAEGU_CENTER, EXTRA_ROUTES, ROUTES } from '../sim/routes'
import type { BusRoute } from '../sim/routes'
import { MAJOR_ROADS } from '../sim/roads'
import { backgroundBuses } from '../sim/traffic'
import { mapColor } from './mapColors'
import { indexPolyline, pointAt } from '../sim/geo'
import type { LatLng } from '../sim/geo'
import type { RealBus } from '../sim/bis'
import type { Incident, Packet409, VehicleState } from '../sim/types'

const INCIDENT_ICON: Record<Incident['kind'], string> = { 사고: '🚨', 고장: '🔧', 공사: '🚧', 기타: '⚠️' }
const INCIDENT_COLOR: Record<Incident['kind'], string> = { 사고: '#ef4444', 고장: '#f59e0b', 공사: '#9ca3af', 기타: '#6366f1' }
/** 영향 반경 (m) — 지도에 반투명 서클로 표시 */
const INCIDENT_RADIUS: Record<Incident['kind'], number> = { 사고: 250, 고장: 120, 공사: 150, 기타: 0 }

function incidentIcon(inc: Incident): L.DivIcon {
  const c = INCIDENT_COLOR[inc.kind]
  return L.divIcon({
    className: '',
    html: `<div class="incident-marker${inc.status === '발생' ? ' fresh' : ''}">
      <span class="badge" style="border-color:${c};background:${c}2b">${INCIDENT_ICON[inc.kind]}</span>
      <span class="tag" style="color:${c};border-color:${c}66">${inc.kind} · ${inc.status}</span>
    </div>`,
    iconSize: [0, 0],
  })
}

/** 패널에서 위치 클릭 시 지도 이동 + 포커스 링 표시 */
function FlyTo({ target }: { target: { lat: number; lng: number; label?: string; nonce: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    // 아코디언 등 새로 마운트되는 좁은 컨테이너에서 크기 재계산 후 이동
    const t = setTimeout(() => {
      map.invalidateSize()
      map.flyTo([target.lat, target.lng], 15, { duration: 0.8 })
    }, 60)
    return () => clearTimeout(t)
  }, [target, map])
  if (!target) return null
  return (
    <CircleMarker
      center={[target.lat, target.lng]}
      radius={16}
      pathOptions={{ color: '#8b5cf6', weight: 2.5, dashArray: '6 4', fillColor: '#8b5cf6', fillOpacity: 0.12 }}
    >
      {target.label && (
        <Tooltip direction="top" offset={[0, -14]} permanent>
          <span style={{ fontSize: 11, fontWeight: 700 }}>{target.label}</span>
        </Tooltip>
      )}
    </CircleMarker>
  )
}

/**
 * LIVE 배지 — 지도가 실제 실시간임을 알리는 신호.
 * 지도 HUD 안에도, 지도 밖 헤더 줄에도 같은 모양으로 놓을 수 있게 밖으로 뺐다.
 */
export function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-gray-900/90 px-2.5 py-1 text-[11px] font-bold text-emerald-300 shadow-lg">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      LIVE
    </div>
  )
}

const ROUTE_IDX = new Map(ROUTES.map((r) => [r.id, indexPolyline(r.points)]))

/**
 * 간선도로 배경 — 도로는 변하지 않는다. memo로 묶지 않으면 엔진이 250ms마다 스냅샷을
 * 갈아끼울 때마다 폴리라인 수백 개가 다시 조정돼 지도가 눈에 띄게 느려진다.
 */
const RoadLayer = memo(function RoadLayer({ light }: { light: boolean }) {
  /* 밝은 타일 위에서는 같은 앰버가 흰 종이에 노란 형광펜처럼 날아간다 — 라이트 모드는 진한 색으로 */
  const opacity = light ? 0.62 : 0.5
  const color = mapColor(light ? '#b45309' : '#fbbf24', light, opacity)
  return (
    <>
      {MAJOR_ROADS.flatMap((rd) =>
        rd.segments.map((seg, i) => (
          <Polyline
            key={`${rd.name}-${i}`}
            positions={seg}
            pathOptions={{ color, weight: 6, opacity, lineCap: 'round' }}
          >
            <Tooltip sticky>
              <b>{rd.name}</b> · {rd.km}km · 노선 {rd.routes}개가 함께 타는 축
            </Tooltip>
          </Polyline>
        )),
      )}
    </>
  )
})

/** 지금 줌 단계 — 정류장 핀을 언제 보여줄지 정하는 데 쓴다 */
function useZoom(): number {
  const map = useMap()
  const [z, setZ] = useState(() => map.getZoom())
  useEffect(() => {
    const on = () => setZ(map.getZoom())
    map.on('zoomend', on)
    return () => {
      map.off('zoomend', on)
    }
  }, [map])
  return z
}

/**
 * 정류장 핀 — 노선 선형 위 실제 위치에 찍는다.
 * 축소 상태(z<13)에서는 기점·종점만, 확대하면 전 정류장을 연다.
 * 전부 다 켜 두면 핀이 노선을 덮어 «어디를 지나는가»가 오히려 안 보인다.
 */
function StopPins({ routes, dimmed, light }: { routes: BusRoute[]; dimmed: (id: string) => boolean; light: boolean }) {
  const z = useZoom()
  return (
    <>
      {routes.flatMap((r) => {
        const idx = ROUTE_IDX.get(r.id) ?? indexPolyline(r.points)
        const dim = dimmed(r.id)
        const list =
          z >= 14 ? r.stops : z >= 13 ? r.stops.filter((_, i) => i % 3 === 0 || i === r.stops.length - 1) : [r.stops[0], r.stops[r.stops.length - 1]].filter(Boolean)
        return list.map((st) => {
          const { pos } = pointAt(idx, st.at * idx.totalM)
          return (
            <CircleMarker
              key={`${r.id}-${st.name}-${st.at}`}
              center={pos}
              radius={z >= 15 ? 4 : 3}
              pathOptions={{
                color: mapColor(r.color, light, 0.95),
                fillColor: '#0b0f16',
                fillOpacity: 1,
                weight: 1.8,
                opacity: dim ? 0.2 : 0.95,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <b>{st.name}</b> · {r.name}
              </Tooltip>
            </CircleMarker>
          )
        })
      })}
    </>
  )
}

/** 지도 HUD — LIVE 배지(좌상단) · 줌 컨트롤(우하단 44px) · 히트맵 범례(줌 위). 지도 위 절대배치. */
function MapHud({
  showHeat,
  hidden,
  onToggle,
  showExtra,
  onToggleExtra,
  extraOpen,
  onToggleExtraOpen,
  onBulk,
  visibleExtraCount,
  showRoads,
  onToggleRoads,
  showLive,
  bgCount,
  drivenCount,
  realCount,
}: {
  showHeat: boolean
  hidden: Set<string>
  onToggle: (id: string) => void
  showExtra: boolean
  onToggleExtra: () => void
  /** 주요 노선 목록 패널 열림 — 12개를 칩 줄에 다 풀면 지도를 덮는다 */
  extraOpen: boolean
  onToggleExtraOpen: () => void
  onBulk: (on: boolean) => void
  visibleExtraCount: number
  showRoads: boolean
  onToggleRoads: () => void
  /** 지도 밖에 이미 LIVE 배지가 있으면 HUD에서는 빼고 칩 줄을 그만큼 올린다 */
  showLive: boolean
  /** 지금 화면에 떠 있는 표시용 버스 수 — 레이어를 끄면 같이 줄어야 표기가 거짓이 되지 않는다 */
  bgCount: number
  /** 실증 차량 수 — 노선 수가 아니라 차량 수여야 한다 */
  drivenCount: number
  /** BIS 실차 수 — 있으면 시뮬은 물러나고 이 숫자가 진짜다 */
  realCount: number
}) {
  const map = useMap()
  // 스크롤 휠만 지도로 전파 차단(지도 줌 방지). 클릭 전파는 막지 않는다 —
  // L.DomEvent.disableClickPropagation은 stopPropagation을 걸어 React 19의
  // 루트 위임 onClick까지 삼켜버리므로 줌 버튼이 동작하지 않게 된다.
  const stop = (el: HTMLDivElement | null) => {
    if (!el) return
    L.DomEvent.disableScrollPropagation(el)
  }
  return (
    <>
      {/*
        좌상단 스택 — LIVE 배지와 노선 칩. 한 흐름에 넣어야 배지 크기가 바뀌어도 겹치지 않는다.
        지도 밖 헤더 줄(날씨+LIVE)은 좁은 화면에서 두 줄로 접히므로 그때만 칩 줄을 내린다.
        주의: 여는 태그 «안»에는 블록 주석을 두지 말 것 — esbuild가 파일 전체를 못 읽어 dev 서버가 500을 낸다.
      */}
      <div
        ref={stop}
        className={`pointer-events-auto absolute left-3 z-[1000] flex max-w-[calc(100%-6rem)] flex-col items-start gap-1.5 ${
          showLive ? 'top-14' : 'top-14 max-[900px]:top-[88px]'
        }`}
      >
        {showLive && <LiveBadge />}

        {/* 노선 선택 — 실증 3개는 개별 토글, 나머지 주요 노선은 한 번에 */}
        <div className="flex flex-wrap items-center gap-1">
        {ROUTES.map((r) => {
          const off = hidden.has(r.id)
          return (
            <button
              key={r.id}
              onClick={() => onToggle(r.id)}
              title={`${r.name} · ${r.ends ?? ''}${r.lengthKm ? ` · ${r.lengthKm}km` : ''} — 눌러서 켜고 끄기`}
              className={`flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                off ? 'border-gray-700 bg-gray-900/85 text-gray-500' : 'border-gray-600 bg-gray-900/90 text-gray-100'
              }`}
            >
              <span className="h-[3px] w-3 rounded-full" style={{ background: off ? '#4b5563' : r.color }} />
              {r.name}
            </button>
          )
        })}
        {/* 주요 노선 — 왼쪽은 전체 on/off, 오른쪽 ▾는 노선별로 고르는 목록 */}
        <span className="relative flex items-center">
          <button
            onClick={onToggleExtra}
            title="대구 주요 버스 노선을 한 번에 켜고 끕니다 (실증 차량은 이 노선을 달리지 않습니다)"
            className={`rounded-l-full border border-r-0 px-2 py-[3px] text-[10px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
              showExtra ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-gray-700 bg-gray-900/85 text-gray-500'
            }`}
          >
            + 주요 노선 {visibleExtraCount}/{EXTRA_ROUTES.length}
          </button>
          <button
            onClick={onToggleExtraOpen}
            aria-label="주요 노선 목록"
            title="노선별로 켜고 끄기"
            className={`rounded-r-full border px-1.5 py-[3px] text-[10px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
              showExtra ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-gray-700 bg-gray-900/85 text-gray-500'
            }`}
          >
            ▾
          </button>
          {extraOpen && (
            <div className="absolute left-0 top-7 z-[1001] w-[236px] rounded-xl border border-gray-700 bg-gray-900/95 p-2 shadow-2xl">
              <div className="flex flex-wrap gap-1">
                {EXTRA_ROUTES.map((r) => {
                  const off = hidden.has(r.id)
                  return (
                    <button
                      key={r.id}
                      onClick={() => onToggle(r.id)}
                      title={`${r.name}${r.ends ? ` · ${r.ends}` : ''}${r.lengthKm ? ` · ${r.lengthKm}km` : ''}`}
                      className={`flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        off ? 'border-gray-700 bg-gray-900/85 text-gray-500' : 'border-gray-600 bg-gray-800/90 text-gray-100'
                      }`}
                    >
                      <span className="h-[3px] w-3 rounded-full" style={{ background: off ? '#4b5563' : r.color }} />
                      {r.name}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1.5 flex gap-1 border-t border-gray-800 pt-1.5">
                <button onClick={() => onBulk(true)} className="flex-1 rounded-lg bg-gray-800 px-2 py-1 text-[10px] font-bold text-gray-200">
                  전체 켜기
                </button>
                <button onClick={() => onBulk(false)} className="flex-1 rounded-lg bg-gray-800 px-2 py-1 text-[10px] font-bold text-gray-400">
                  전체 끄기
                </button>
              </div>
            </div>
          )}
        </span>
        <button
          onClick={onToggleRoads}
          title="여러 노선이 함께 타는 간선 축만 깔아 «버스가 실제로 다니는 길»이 보이게 합니다 (버스가 지나지 않는 도로는 그리지 않습니다)"
          className={`rounded-full border px-2 py-[3px] text-[10px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
            showRoads ? 'border-amber-500/50 bg-amber-500/15 text-amber-200' : 'border-gray-700 bg-gray-900/85 text-gray-500'
          }`}
        >
            간선도로 {MAJOR_ROADS.length}
          </button>
          {/*
            움직이는 점이 실증 9대보다 훨씬 많다. 툴팁에만 «표시용»이라 적으면 마우스를 올린 사람만 안다 —
            발표를 지켜보는 사람에게는 상시로 적혀 있어야 한다. 숫자는 실제 렌더 개수라 레이어를 끄면 따라 줄어든다.
          */}
          {realCount > 0 ? (
            <span
              title="대구 BIS에서 받은 실제 차량 위치입니다 — 시뮬레이션 차량은 표시를 멈춥니다"
              className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-[3px] text-[10px] font-bold text-emerald-300"
            >
              📡 실차 {realCount}대 · 시뮬 표시 중지
            </span>
          ) : (
            bgCount > 0 && (
              <span
                title="표시용 버스는 거리·연료·CO₂·안전점수 등 실증 집계에 포함되지 않습니다"
                className="rounded-full border border-gray-700 bg-gray-900/85 px-2 py-[3px] text-[10px] font-bold text-gray-400"
              >
                표시용 {bgCount} · 실증 {drivenCount}대
              </span>
            )
          )}
        </div>
      </div>

      {/* 히트맵 범례 — 히트맵 ON 시에만, 줌 컨트롤 위 */}
      {showHeat && (
        <div
          ref={stop}
          className="pointer-events-auto absolute bottom-[104px] right-3 z-[1000] rounded-lg border border-gray-700 bg-gray-900/95 px-2.5 py-2 text-[10px] shadow-xl"
        >
          <div className="mb-1 font-bold text-red-300">🔥 위험운전 밀도</div>
          <div
            className="h-2 w-28 rounded-full"
            style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.14), rgba(239,68,68,0.85))' }}
          />
          <div className="mt-0.5 flex w-28 justify-between text-gray-500">
            <span>적음</span>
            <span>많음</span>
          </div>
        </div>
      )}

      {/* 줌 컨트롤 — 우하단, 44px 터치 타깃 (기본 zoomControl 대체) */}
      <div
        ref={stop}
        className="pointer-events-auto absolute bottom-3 right-3 z-[1000] flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900/95 shadow-xl"
      >
        <button
          onClick={() => map.setZoom(Math.min(map.getMaxZoom(), map.getZoom() + 1), { animate: false })}
          aria-label="지도 확대"
          className="flex h-11 w-11 items-center justify-center text-xl font-bold leading-none text-gray-200 hover:bg-gray-800"
        >
          ＋
        </button>
        <div className="h-px bg-gray-700" />
        <button
          onClick={() => map.setZoom(Math.max(map.getMinZoom(), map.getZoom() - 1), { animate: false })}
          aria-label="지도 축소"
          className="flex h-11 w-11 items-center justify-center text-xl font-bold leading-none text-gray-200 hover:bg-gray-800"
        >
          －
        </button>
      </div>
    </>
  )
}

/** 측면 버스 SVG — 노선색 차체 + 창문 + 바퀴 */
function busSvg(fill: string, outline = false): string {
  const stroke = outline ? '#38bdf8' : 'rgba(0,0,0,0.45)'
  const body = outline ? 'rgba(56,189,248,0.18)' : fill
  const win = outline ? 'rgba(56,189,248,0.6)' : 'rgba(255,255,255,0.88)'
  return `<svg class="bus-svg" width="28" height="16" viewBox="0 0 28 16" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1.5" width="26" height="10.5" rx="3" fill="${body}" stroke="${stroke}" stroke-width="${outline ? 1.6 : 1}"/>
    <rect x="3.6" y="3.6" width="4.1" height="3.6" rx="1" fill="${win}"/>
    <rect x="9" y="3.6" width="4.1" height="3.6" rx="1" fill="${win}"/>
    <rect x="14.4" y="3.6" width="4.1" height="3.6" rx="1" fill="${win}"/>
    <rect x="19.8" y="3.6" width="4.6" height="5.8" rx="1" fill="${win}"/>
    <circle cx="7.5" cy="13" r="2.3" fill="#1f2937" stroke="#9ca3af" stroke-width="0.8"/>
    <circle cx="20.5" cy="13" r="2.3" fill="#1f2937" stroke="#9ca3af" stroke-width="0.8"/>
  </svg>`
}

function busIcon(v: VehicleState, color: string, warn: boolean): L.DivIcon {
  // 대략적 진행 방향으로 차체 방향 전환 (기본: 동쪽/우향)
  const flip = v.headingDeg > 180
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker${warn ? ' warn' : ''}">
      <span class="bus-body"${flip ? ' style="transform:scaleX(-1)"' : ''}>${busSvg(color)}</span>
      <span class="label">${v.id.slice(-4)}</span>
    </div>`,
    iconSize: [0, 0],
  })
}

/** 이벤트를 ~110m 격자로 묶어 히트 서클 생성 */
/**
 * 표시용 버스 아이콘 — 실증 차량과 **같은 형태·같은 크기**. 구분은 «차량번호 라벨이 없다»로 한다.
 * 크기를 줄였더니 같은 버스인데 멀리 있는 것처럼 보였다(사용자 지적). 도로 선 위에 떠야 하므로
 * 기본 마커 pane(600)에 둔다 — 전용 pane(390)에 두면 도로·노선 아래로 깔려 가려진다.
 */
function bgBusIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker bg-bus"><span class="bus-body">${busSvg(color)}</span></div>`,
    iconSize: [0, 0],
  })
}

/** 이벤트를 ~110m 격자로 묶어 히트 서클 생성 */
/** 점에서 폴리라인까지 최단거리(m) — 평면 근사(대구 위도에서 오차 무시 가능) */
function distToLine(lat: number, lng: number, line: LatLng[]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][1] * 88000
    const ay = line[i][0] * 111000
    const bx = line[i + 1][1] * 88000
    const by = line[i + 1][0] * 111000
    const px = lng * 88000
    const py = lat * 111000
    const dx = bx - ax
    const dy = by - ay
    const L = dx * dx + dy * dy
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}

/** 이 거리(m)를 넘으면 «우리가 그린 구간 밖» — 정류장 오프셋·GPS 오차를 넉넉히 넘긴 값 */
const OFF_ROUTE_M = 300

const ALL_ROUTES = [...ROUTES, ...EXTRA_ROUTES]

/**
 * 실차가 «우리 지도에 그린 구간» 위에 있는가.
 *
 * 우리 폴리라인은 OSM에 매핑된 일부 구간이라, 실차의 절반쯤은 그 밖을 달린다(실측 110대 중 57대).
 * 감추면 실데이터를 숨기는 것이고, 그냥 두면 «선도 없는데 왜 저기 버스가»가 된다.
 * → 다 보여 주되 **선 밖은 다르게 그리고 왜 그런지 말한다.**
 */
function offOurLine(b: RealBus): boolean {
  const r = ALL_ROUTES.find((x) => x.name === b.routeNo)
  if (!r) return true
  return distToLine(b.lat, b.lng, r.points) > OFF_ROUTE_M
}

function heatCells(events: Packet409[]) {
  const cells = new Map<string, { lat: number; lng: number; count: number }>()
  for (const e of events) {
    const key = `${e.lat.toFixed(3)}|${e.lng.toFixed(3)}`
    const c = cells.get(key)
    if (c) c.count++
    else cells.set(key, { lat: e.lat, lng: e.lng, count: 1 })
  }
  return [...cells.values()]
}

function realBusIcon(b: RealBus, off: boolean): L.DivIcon {
  const dir = b.heading ? ` ▸${b.heading.slice(0, 5)}` : ''
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker real${off ? ' off-line' : ''}">
      <span class="bus-body">${busSvg(off ? '#94a3b8' : '#38bdf8', true)}</span>
      <span class="label">실 ${b.routeNo}${dir}</span>
    </div>`,
    iconSize: [0, 0],
  })
}

/** 시뮬레이션 버스의 방면 라벨 (순환선은 '순환') */
function simHeading(v: VehicleState): string {
  const route = ROUTES.find((r) => r.id === v.routeId)!
  if (route.loop) return '순환'
  const terminus = v.dir === 1 ? route.stops[route.stops.length - 1].name : route.stops[0].name
  return `${terminus} 방면`
}

export default function MapView({
  vehicles,
  events,
  showHeat,
  highlightRouteId,
  realBuses = [],
  incidents = [],
  focusTarget = null,
  showLive = true,
  simTime = 0,
}: {
  vehicles: VehicleState[]
  events: Packet409[]
  showHeat: boolean
  highlightRouteId?: string | null
  realBuses?: RealBus[]
  incidents?: Incident[]
  focusTarget?: { lat: number; lng: number; label?: string; nonce: number } | null
  /** 지도 밖에 LIVE 배지를 따로 두는 화면은 false — HUD에서 빼고 칩 줄이 그만큼 올라간다 */
  showLive?: boolean
  /** 배경 교통을 움직이는 시뮬 시각(초). 0이면 정지한 채로 놓인다 */
  simTime?: number
}) {
  /*
   * 실데이터가 들어오는 순간 시뮬 차량과 배경 교통은 물러난다.
   * 같은 지도에 «실제 버스»와 «만들어 낸 버스»가 섞이면 어느 쪽을 보고 있는지 알 수 없다 —
   * 실차가 있으면 그것만 보여 주는 편이 정직하고, 시연에서도 «지금은 진짜입니다»가 분명해진다.
   */
  const liveReal = realBuses.length > 0
  const cells = useMemo(() => (showHeat ? heatCells(events) : []), [events, showHeat])
  /* 노선 표시 상태 — 지도가 정보로 꽉 차면 정작 «어디를 지나는가»가 안 보인다 */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // 기본 ON — «대구의 주요 버스»가 첫 화면에서 보여야 한다. 복잡하면 칩 한 번으로 끈다
  const [showExtra, setShowExtra] = useState(true)
  const [showRoads, setShowRoads] = useState(true)
  const visibleRoutes = useMemo(() => ROUTES.filter((r) => !hidden.has(r.id)), [hidden])
  const visibleExtra = useMemo(() => EXTRA_ROUTES.filter((r) => !hidden.has(r.id)), [hidden])
  const [extraOpen, setExtraOpen] = useState(false)
  /*
   * 배경 교통 — 켜 둔 레이어 위에만 달린다. 노선을 껐는데 그 위에 버스가 남아 있으면
   * 「저 버스는 무엇을 타고 있나」가 설명되지 않는다.
   */
  /* 보정 계산과 실제 렌더가 같은 알파를 봐야 대비가 맞는다 */
  const BG_ALPHA = 0.7
  const bgBuses = useMemo(() => {
    // simTime 을 안 넘기는 화면(운행 이력의 단일 회차 지도 등)에는 배경 교통을 두지 않는다 —
    // 멈춰 선 점들이 «고장난 것»처럼 보이고, 한 회차를 보는 지도에 남의 버스는 방해다
    if (simTime <= 0 || liveReal) return []
    const all = backgroundBuses(simTime)
    // 노선을 끄면 그 위 버스도 함께 꺼진다 — 선이 없는데 버스만 떠 있으면 «무엇을 타고 있나»가 설명되지 않는다
    return all.filter((b) => showExtra && !hidden.has(b.routeId))
  }, [simTime, showExtra, hidden])

  const theme = useTheme()

  return (
    <MapContainer
      center={DAEGU_CENTER}
      zoom={13}
      className="h-full w-full rounded-xl border border-gray-800"
      zoomControl={false}
    >
      <TileLayer
        key={theme}
        url={`https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />

      {/* 간선도로 — 노선보다 먼저 그린다. 나중에 그리면 도로가 노선을 덮어 «어디서 가로지르는지»가 안 보인다 */}
      {showRoads && <RoadLayer light={theme === 'light'} />}

      {/* 주요 노선 — 표시 전용. 실증 노선보다 얇고 흐리게 깔아 주인공을 가리지 않는다 */}
      {showExtra &&
        visibleExtra.map((r) => (
          <Polyline
            key={r.id}
            positions={r.points}
            pathOptions={{ color: mapColor(r.color, theme === 'light', 0.8), weight: 3, opacity: 0.8 }}
          >
            <Tooltip sticky>
              <b>{r.name}</b> {r.ends ? `· ${r.ends}` : ''} {r.lengthKm ? `· ${r.lengthKm}km` : ''}
              {r.full && r.full !== r.ends && <div className="opacity-70">전체 노선 {r.full} 중 매핑된 구간</div>}
            </Tooltip>
          </Polyline>
        ))}

      {visibleRoutes.map((r) => {
        const dim = highlightRouteId != null && highlightRouteId !== r.id
        return (
          <Polyline
            key={r.id}
            positions={r.points}
            pathOptions={{
              color: mapColor(r.color, theme === 'light', 0.75),
              weight: highlightRouteId === r.id ? 6 : 3.5,
              opacity: dim ? 0.15 : 0.75,
            }}
          >
            <Tooltip sticky>
              <b>{r.name}</b> {r.ends ? `· ${r.ends}` : ''} {r.lengthKm ? `· ${r.lengthKm}km` : ''}
              {r.stops.length >= 3 && ` · 정류장 ${r.stops.length}`}
              {r.source === 'BIS 전 구간' ? (
                <div className="opacity-70">대구 BIS 경유정류소 — 노선 전 구간</div>
              ) : (
                r.full && r.full !== r.ends && <div className="opacity-70">전체 노선 {r.full} 중 매핑된 구간</div>
              )}
            </Tooltip>
          </Polyline>
        )
      })}

      {/* 정류장 핀 */}
      <StopPins routes={visibleRoutes} dimmed={(id) => highlightRouteId != null && highlightRouteId !== id} light={theme === 'light'} />

      {/* 배경 교통 — 주요 노선·간선도로 위를 달리는 표시용 버스 (실증 집계에 들어가지 않는다) */}
      {bgBuses.map((b) => (
        <Marker key={b.id} position={b.pos} icon={bgBusIcon(mapColor(b.color, theme === 'light', BG_ALPHA))}>
          <Tooltip direction="top" offset={[0, -8]}>
            {b.on} · 표시용 — 실증 집계에 포함되지 않습니다
          </Tooltip>
        </Marker>
      ))}

      {/* 위험운전 히트맵 */}
      {cells.map((c, i) => (
        <CircleMarker
          key={i}
          center={[c.lat, c.lng]}
          radius={5 + Math.min(c.count * 2.2, 22)}
          pathOptions={{ color: 'transparent', fillColor: '#ef4444', fillOpacity: 0.28 }}
        >
          <Tooltip direction="top">위험운전 {c.count}건</Tooltip>
        </CircleMarker>
      ))}

      <FlyTo target={focusTarget} />
      <MapHud
        showHeat={showHeat}
        hidden={hidden}
        onToggle={(id) =>
          setHidden((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
        showExtra={showExtra}
        onToggleExtra={() => setShowExtra((v) => !v)}
        extraOpen={extraOpen}
        onToggleExtraOpen={() => setExtraOpen((v) => !v)}
        visibleExtraCount={visibleExtra.length}
        onBulk={(on) =>
          setHidden((prev) => {
            const next = new Set(prev)
            EXTRA_ROUTES.forEach((r) => (on ? next.delete(r.id) : next.add(r.id)))
            return next
          })
        }
        showRoads={showRoads}
        onToggleRoads={() => setShowRoads((v) => !v)}
        showLive={showLive}
        bgCount={bgBuses.length}
        drivenCount={liveReal ? 0 : vehicles.length}
        realCount={realBuses.length}
      />

      {/* 돌발정보 — 영향 반경 서클 + 배지 마커 */}
      {incidents
        .filter((i) => i.status !== '완료' && i.lat != null && i.lng != null)
        .map((i) => (
          <span key={`inc-${i.id}`}>
            {INCIDENT_RADIUS[i.kind] > 0 && (
              <Circle
                center={[i.lat!, i.lng!]}
                radius={INCIDENT_RADIUS[i.kind]}
                pathOptions={{
                  color: INCIDENT_COLOR[i.kind],
                  weight: 1.5,
                  opacity: i.status === '발생' ? 0.7 : 0.4,
                  fillColor: INCIDENT_COLOR[i.kind],
                  fillOpacity: i.status === '발생' ? 0.12 : 0.06,
                  dashArray: i.kind === '공사' ? '6 5' : undefined,
                }}
              />
            )}
            <Marker position={[i.lat!, i.lng!]} icon={incidentIcon(i)} zIndexOffset={500}>
              <Tooltip direction="top" offset={[0, -20]}>
                <div style={{ fontSize: 11 }}>
                  <b>
                    [{i.kind}·{i.status}]
                  </b>{' '}
                  {i.title}
                  <br />
                  영향 반경 약 {INCIDENT_RADIUS[i.kind] || '—'}m
                </div>
              </Tooltip>
            </Marker>
          </span>
        ))}

      {/* BIS 실데이터 버스 (TAGO 오픈API) */}
      {realBuses.map((b) => {
        const off = offOurLine(b)
        return (
        <Marker key={`real-${b.vehicleNo}`} position={[b.lat, b.lng]} icon={realBusIcon(b, off)}>
          <Tooltip direction="top" offset={[0, -10]}>
            <div style={{ fontSize: 11 }}>
              <b>{b.vehicleNo}</b> · {b.routeNo}
              {b.heading && (
                <>
                  <br />
                  <b>{b.heading} 방면</b>
                </>
              )}
              <br />
              대구 BIS 실데이터 (TAGO)
              {off && (
                <>
                  <br />
                  <span style={{ opacity: 0.75 }}>우리 지도에 그린 구간 밖 — 노선 전 구간 중 미매핑 부분</span>
                </>
              )}
            </div>
          </Tooltip>
        </Marker>
        )
      })}

      {/* 시뮬 버스 — 실데이터가 오면 물러난다 */}
      {(liveReal ? [] : vehicles).map((v) => {
        const route = ROUTES.find((r) => r.id === v.routeId)!
        const warn = !!v.lastEventWall && Date.now() - v.lastEventWall < 6000
        return (
          <Marker key={v.id} position={[v.lat, v.lng]} icon={busIcon(v, route.color, warn)}>
            <Tooltip direction="top" offset={[0, -10]}>
              <div style={{ fontSize: 11 }}>
                <b>{v.id}</b> · {route.name} · <b>{simHeading(v)}</b>
                <br />
                {v.driverName} 기사 · {Math.round(v.speedKmh)} km/h
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
