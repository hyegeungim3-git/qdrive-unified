import { useEffect, useMemo } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from '../theme'
import { DAEGU_CENTER, ROUTES } from '../sim/routes'
import { indexPolyline, pointAt } from '../sim/geo'
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

const ROUTE_IDX = new Map(ROUTES.map((r) => [r.id, indexPolyline(r.points)]))

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

function realBusIcon(b: RealBus): L.DivIcon {
  const dir = b.heading ? ` ▸${b.heading.slice(0, 5)}` : ''
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker real">
      <span class="bus-body">${busSvg('#38bdf8', true)}</span>
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
}: {
  vehicles: VehicleState[]
  events: Packet409[]
  showHeat: boolean
  highlightRouteId?: string | null
  realBuses?: RealBus[]
  incidents?: Incident[]
  focusTarget?: { lat: number; lng: number; label?: string; nonce: number } | null
}) {
  const cells = useMemo(() => (showHeat ? heatCells(events) : []), [events, showHeat])
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

      {ROUTES.map((r) => {
        const dim = highlightRouteId != null && highlightRouteId !== r.id
        return (
          <Polyline
            key={r.id}
            positions={r.points}
            pathOptions={{
              color: r.color,
              weight: highlightRouteId === r.id ? 6 : 3.5,
              opacity: dim ? 0.15 : 0.75,
            }}
          />
        )
      })}

      {/* 정류장 */}
      {ROUTES.flatMap((r) => {
        const idx = ROUTE_IDX.get(r.id)!
        return r.stops.map((s) => {
          const { pos } = pointAt(idx, s.at * idx.totalM)
          return (
            <CircleMarker
              key={`${r.id}-${s.name}`}
              center={pos}
              radius={3}
              pathOptions={{ color: '#6b7280', fillColor: '#111827', fillOpacity: 1, weight: 1.5 }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                {s.name}
              </Tooltip>
            </CircleMarker>
          )
        })
      })}

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
      {realBuses.map((b) => (
        <Marker key={`real-${b.vehicleNo}`} position={[b.lat, b.lng]} icon={realBusIcon(b)}>
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
            </div>
          </Tooltip>
        </Marker>
      ))}

      {/* 버스 */}
      {vehicles.map((v) => {
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
