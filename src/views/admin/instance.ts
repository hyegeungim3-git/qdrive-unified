import { ROUTES } from '../../sim/routes'
import type { SimSnapshot } from '../../sim/types'
import { clock, coolantOf, shortId } from './catalog'

/**
 * 인스턴스 그래프 — 클래스가 아니라 **실제 레코드 사이의 연결**을 걷는다.
 * "3742호 ─수행─→ 운행#4 ─발생─→ 급감속 06:31 ─맥락─→ 폭우" 처럼
 * 노드를 누를 때마다 그 레코드를 중심으로 이웃을 다시 펼친다.
 */

export type InstNode = { id: string; cls: string; label: string; sub?: string }
export type InstEdge = { from: string; to: string; rel: string }
export type Hood = { center: InstNode; nodes: InstNode[]; edges: InstEdge[] }

const tripId = (vid: string, start: number) => `trip:${vid}:${Math.round(start)}`
const vehId = (vid: string) => `veh:${vid}`
const drvId = (name: string) => `drv:${name}`
const rtId = (id: string) => `rt:${id}`
const stopId = (rid: string, name: string) => `stop:${rid}:${name}`
const evtId = (vid: string, t: number, type: string) => `evt:${vid}:${Math.round(t)}:${type}`
const snsId = (vid: string, ch: string) => `sns:${vid}:${ch}`
const locId = (vid: string) => `loc:${vid}`
const CTX = 'ctx:weather'

/** 시작점 후보 — 실제로 쌓인 레코드에서 고른다 */
export function entryPoints(s: SimSnapshot): InstNode[] {
  const out: InstNode[] = []
  s.trips.slice(0, 4).forEach((t) =>
    out.push({ id: tripId(t.vehicleId, t.startSimTime), cls: 'trip', label: `운행 ${shortId(t.vehicleId)}`, sub: `${clock(t.startSimTime)}–${clock(t.endSimTime)} · ${t.routeName}` }),
  )
  s.vehicles.slice(0, 3).forEach((v) => out.push({ id: vehId(v.id), cls: 'vehicle', label: shortId(v.id), sub: `${v.driverName} · 안전 ${Math.round(v.score)}점` }))
  s.events.slice(0, 3).forEach((e) => out.push({ id: evtId(e.vehicleId, e.simTime, e.eventType), cls: 'event', label: e.eventType, sub: `${clock(e.simTime)} · ${shortId(e.vehicleId)}` }))
  return out
}

const nodeOfTrip = (t: { vehicleId: string; startSimTime: number; endSimTime: number; routeName: string; distanceKm: number }): InstNode => ({
  id: tripId(t.vehicleId, t.startSimTime),
  cls: 'trip',
  label: `운행 ${shortId(t.vehicleId)}`,
  sub: `${clock(t.startSimTime)}–${clock(t.endSimTime)} · ${t.distanceKm}km`,
})

export function neighborhood(s: SimSnapshot, focusId: string): Hood | null {
  const [kind, ...rest] = focusId.split(':')
  const nodes: InstNode[] = []
  const edges: InstEdge[] = []
  const push = (n: InstNode, rel: string, dir: 'out' | 'in' = 'out') => {
    if (!nodes.some((x) => x.id === n.id)) nodes.push(n)
    edges.push(dir === 'out' ? { from: focusId, to: n.id, rel } : { from: n.id, to: focusId, rel })
  }
  const vOf = (id: string) => s.vehicles.find((v) => v.id === id)
  const routeOf = (rid: string) => ROUTES.find((r) => r.id === rid)

  /* ── 운행(Trip) 중심 — 온톨로지의 축 ── */
  if (kind === 'trip') {
    const vid = rest[0]
    const start = Number(rest[1])
    const t = s.trips.find((x) => x.vehicleId === vid && Math.round(x.startSimTime) === start)
    if (!t) return null
    const v = vOf(vid)
    const route = ROUTES.find((r) => r.name === t.routeName)
    const center: InstNode = { ...nodeOfTrip(t), sub: `${clock(t.startSimTime)}–${clock(t.endSimTime)} · ${t.routeName} · ${t.distanceKm}km` }
    if (v) push({ id: vehId(v.id), cls: 'vehicle', label: shortId(v.id), sub: `누적 ${v.distanceKm.toFixed(1)}km` }, '수행차량')
    if (v) push({ id: drvId(v.driverName), cls: 'driver', label: v.driverName, sub: `안전 ${Math.round(v.score)}점` }, '운전자')
    if (route) push({ id: rtId(route.id), cls: 'route', label: route.name, sub: `정류장 ${route.stops.length}` }, '운행노선')
    s.events
      .filter((e) => e.vehicleId === vid && e.simTime >= t.startSimTime && e.simTime <= t.endSimTime)
      .slice(0, 3)
      .forEach((e) => push({ id: evtId(e.vehicleId, e.simTime, e.eventType), cls: 'event', label: e.eventType, sub: `${clock(e.simTime)} · ${Math.round(e.speedKmh)}km/h` }, '발생사건'))
    if (v)
      push({ id: snsId(v.id, 'coolantTemp'), cls: 'sensor', label: 'coolantTemp', sub: `${coolantOf(s, v.id, v.rpm)}℃` }, '측정치')
    if (v) push({ id: locId(v.id), cls: 'loc', label: '궤적', sub: `${v.lat.toFixed(4)}, ${v.lng.toFixed(4)}` }, '궤적')
    push({ id: CTX, cls: 'ctx', label: s.weather.condition, sub: `${s.weather.tempC}℃ · 강수 ${s.weather.rainMm}mm` }, '운행맥락')
    return { center, nodes, edges }
  }

  /* ── 차량 ── */
  if (kind === 'vehicle' || kind === 'veh') {
    const vid = rest.join(':')
    const v = vOf(vid)
    if (!v) return null
    const route = routeOf(v.routeId)
    const center: InstNode = { id: vehId(vid), cls: 'vehicle', label: shortId(vid), sub: `${v.driverName} · ${route?.name ?? ''} · 안전 ${Math.round(v.score)}점` }
    push({ id: drvId(v.driverName), cls: 'driver', label: v.driverName, sub: `경제운전 ${Math.round(v.ecoScore)}점` }, '배정 기사')
    if (route) push({ id: rtId(route.id), cls: 'route', label: route.name, sub: `정류장 ${route.stops.length}` }, '운행노선')
    s.trips.filter((t) => t.vehicleId === vid).slice(0, 3).forEach((t) => push(nodeOfTrip(t), '수행 운행', 'in'))
    push({ id: snsId(vid, 'coolantTemp'), cls: 'sensor', label: 'coolantTemp', sub: `${coolantOf(s, vid, v.rpm)}℃` }, '탑재 센서')
    push({ id: locId(vid), cls: 'loc', label: '현재 위치', sub: v.nextStopName }, '위치 관측')
    s.workOrders.filter((w) => w.vehicleId === vid).slice(0, 2).forEach((w) => push({ id: `wo:${w.id}`, cls: 'work', label: w.kind, sub: w.status }, '정비이력'))
    return { center, nodes, edges }
  }

  /* ── 기사 ── */
  if (kind === 'drv') {
    const name = rest.join(':')
    const v = s.vehicles.find((x) => x.driverName === name)
    if (!v) return null
    const center: InstNode = { id: focusId, cls: 'driver', label: name, sub: `안전 ${Math.round(v.score)}점 · 경제운전 ${Math.round(v.ecoScore)}점` }
    push({ id: vehId(v.id), cls: 'vehicle', label: shortId(v.id), sub: `누적 ${v.distanceKm.toFixed(1)}km` }, '담당 차량')
    s.trips.filter((t) => t.vehicleId === v.id).slice(0, 3).forEach((t) => push(nodeOfTrip(t), '운전한 운행'))
    s.pleas.filter((p) => p.driverName === name).slice(0, 2).forEach((p) => push({ id: `plea:${p.id}`, cls: 'plea', label: p.eventType, sub: `${p.method} · ${p.status}` }, '상황 설명'))
    s.events.filter((e) => e.vehicleId === v.id).slice(0, 2).forEach((e) => push({ id: evtId(e.vehicleId, e.simTime, e.eventType), cls: 'event', label: e.eventType, sub: clock(e.simTime) }, '판정 대상'))
    return { center, nodes, edges }
  }

  /* ── 노선 ── */
  if (kind === 'rt') {
    const r = routeOf(rest.join(':'))
    if (!r) return null
    const center: InstNode = { id: focusId, cls: 'route', label: r.name, sub: `${r.loop ? '순환' : '왕복'} · 정류장 ${r.stops.length}` }
    r.stops.slice(0, 4).forEach((st) => push({ id: stopId(r.id, st.name), cls: 'stop', label: st.name, sub: `노선상 ${Math.round(st.at * 100)}%` }, '경유정류장'))
    s.vehicles.filter((v) => v.routeId === r.id).slice(0, 3).forEach((v) => push({ id: vehId(v.id), cls: 'vehicle', label: shortId(v.id), sub: `${v.driverName}` }, '배차 차량', 'in'))
    s.trips.filter((t) => t.routeName === r.name).slice(0, 2).forEach((t) => push(nodeOfTrip(t), '운행 실적', 'in'))
    return { center, nodes, edges }
  }

  /* ── 정류장 ── */
  if (kind === 'stop') {
    const [rid, ...nm] = rest
    const r = routeOf(rid)
    const name = nm.join(':')
    if (!r) return null
    const center: InstNode = { id: focusId, cls: 'stop', label: name, sub: `${r.name} 경유` }
    push({ id: rtId(r.id), cls: 'route', label: r.name, sub: `정류장 ${r.stops.length}` }, '소속 노선', 'in')
    s.vehicles.filter((v) => v.nextStopName === name).slice(0, 3).forEach((v) => push({ id: vehId(v.id), cls: 'vehicle', label: shortId(v.id), sub: `${Math.round(v.nextStopDistM)}m 앞` }, '접근 중', 'in'))
    return { center, nodes, edges }
  }

  /* ── 위험운전 이벤트 ── */
  if (kind === 'evt') {
    const [vid, tRaw, type] = rest
    const t = Number(tRaw)
    const e = s.events.find((x) => x.vehicleId === vid && Math.round(x.simTime) === t && x.eventType === type)
    if (!e) return null
    const v = vOf(vid)
    const center: InstNode = { id: focusId, cls: 'event', label: type, sub: `${clock(e.simTime)} · ${Math.round(e.speedKmh)}km/h · ${e.justified ? '정당 인정' : '감점'}` }
    if (v) push({ id: vehId(v.id), cls: 'vehicle', label: shortId(v.id), sub: v.driverName }, '발생 차량', 'in')
    const trip = s.trips.find((x) => x.vehicleId === vid && e.simTime >= x.startSimTime && e.simTime <= x.endSimTime)
    if (trip) push(nodeOfTrip(trip), '소속 운행', 'in')
    push({ id: `loc:evt:${vid}:${t}`, cls: 'loc', label: '발생 지점', sub: `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}` }, '발생 지점')
    push({ id: CTX, cls: 'ctx', label: s.weather.condition, sub: `${s.weather.tempC}℃` }, '판정 맥락')
    const plea = s.pleas.find((p) => p.vehicleId === vid && p.eventType === type)
    if (plea) push({ id: `plea:${plea.id}`, cls: 'plea', label: '상황 설명', sub: `${plea.method} · ${plea.status}` }, '설명')
    return { center, nodes, edges }
  }

  /* ── 센서 측정 ── */
  if (kind === 'sns') {
    const [vid, ch] = rest
    const v = vOf(vid)
    if (!v) return null
    const center: InstNode = { id: focusId, cls: 'sensor', label: ch, sub: `${shortId(vid)} · ${coolantOf(s, vid, v.rpm)}℃` }
    push({ id: vehId(vid), cls: 'vehicle', label: shortId(vid), sub: `RPM ${Math.round(v.rpm)}` }, '측정 대상', 'in')
    const trip = s.trips.find((t) => t.vehicleId === vid)
    if (trip) push(nodeOfTrip(trip), '측정 구간', 'in')
    s.workOrders.filter((w) => w.vehicleId === vid).slice(0, 2).forEach((w) => push({ id: `wo:${w.id}`, cls: 'work', label: w.kind, sub: w.status }, '고장 라벨'))
    return { center, nodes, edges }
  }

  /* ── 위치 관측 ── */
  if (kind === 'loc') {
    const vid = rest[0] === 'evt' ? rest[1] : rest[0]
    const v = vOf(vid)
    if (!v) return null
    const center: InstNode = { id: focusId, cls: 'loc', label: '위치 관측', sub: `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} · RTK Fixed` }
    push({ id: vehId(vid), cls: 'vehicle', label: shortId(vid), sub: `${Math.round(v.speedKmh)}km/h` }, '관측 대상', 'in')
    const r = routeOf(v.routeId)
    if (r) push({ id: rtId(r.id), cls: 'route', label: r.name, sub: '인가노선 대조' }, '노선 대조')
    if (r) push({ id: stopId(r.id, v.nextStopName), cls: 'stop', label: v.nextStopName, sub: `${Math.round(v.nextStopDistM)}m` }, '다음 정류장')
    return { center, nodes, edges }
  }

  /* ── 맥락(날씨) ── */
  if (kind === 'ctx') {
    const center: InstNode = { id: CTX, cls: 'ctx', label: s.weather.condition, sub: `${s.weather.tempC}℃ · 지연예보 +${s.weather.delayForecastMin}분` }
    s.trips.slice(0, 3).forEach((t) => push(nodeOfTrip(t), '적용 운행'))
    s.incidents.slice(0, 2).forEach((i) => push({ id: `inc:${i.id}`, cls: 'ctx', label: i.kind, sub: i.title.slice(0, 14) }, '돌발'))
    s.events.slice(0, 2).forEach((e) => push({ id: evtId(e.vehicleId, e.simTime, e.eventType), cls: 'event', label: e.eventType, sub: clock(e.simTime) }, '판정 보정'))
    return { center, nodes, edges }
  }

  /* ── 정비 작업지시 ── */
  if (kind === 'wo') {
    const w = s.workOrders.find((x) => String(x.id) === rest[0])
    if (!w) return null
    const center: InstNode = { id: focusId, cls: 'work', label: w.kind, sub: `${shortId(w.vehicleId)} · ${w.status} · ${w.estHours}h` }
    push({ id: vehId(w.vehicleId), cls: 'vehicle', label: shortId(w.vehicleId), sub: '정비 대상' }, '대상 차량', 'in')
    push({ id: snsId(w.vehicleId, 'coolantTemp'), cls: 'sensor', label: 'coolantTemp', sub: '이상 징후' }, '근거 센서', 'in')
    return { center, nodes, edges }
  }

  /* ── 상황 설명 ── */
  if (kind === 'plea') {
    const p = s.pleas.find((x) => String(x.id) === rest[0])
    if (!p) return null
    const center: InstNode = { id: focusId, cls: 'plea', label: '상황 설명', sub: `${p.driverName} · ${p.method} · ${p.status}` }
    push({ id: drvId(p.driverName), cls: 'driver', label: p.driverName, sub: '설명 주체' }, '작성 기사', 'in')
    const e = s.events.find((x) => x.vehicleId === p.vehicleId && x.eventType === p.eventType)
    if (e) push({ id: evtId(e.vehicleId, e.simTime, e.eventType), cls: 'event', label: e.eventType, sub: clock(e.simTime) }, '설명 대상', 'in')
    push({ id: vehId(p.vehicleId), cls: 'vehicle', label: shortId(p.vehicleId), sub: '해당 차량' }, '차량')
    return { center, nodes, edges }
  }

  /* ── 돌발 ── */
  if (kind === 'inc') {
    const i = s.incidents.find((x) => String(x.id) === rest[0])
    if (!i) return null
    const center: InstNode = { id: focusId, cls: 'ctx', label: i.kind, sub: `${i.title} · ${i.status}` }
    push({ id: CTX, cls: 'ctx', label: s.weather.condition, sub: `${s.weather.tempC}℃` }, '기상 맥락', 'in')
    s.trips.slice(0, 2).forEach((t) => push(nodeOfTrip(t), '영향 운행'))
    return { center, nodes, edges }
  }

  return null
}
