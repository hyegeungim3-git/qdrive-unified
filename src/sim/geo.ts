/** 위경도 폴리라인 위 주행 계산 유틸 */

export type LatLng = [number, number]

const R = 6371000 // 지구 반경 (m)

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const la1 = toRad(a[0])
  const la2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface PolylineIndex {
  points: LatLng[]
  /** 각 구간 시작점까지의 누적거리 (m) */
  cum: number[]
  totalM: number
}

export function indexPolyline(points: LatLng[]): PolylineIndex {
  const cum: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1], points[i]))
  }
  return { points, cum, totalM: cum[cum.length - 1] }
}

/** 폴리라인 상 거리 d(m) 지점의 좌표와 진행방향(deg) */
export function pointAt(idx: PolylineIndex, d: number): { pos: LatLng; heading: number } {
  const { points, cum, totalM } = idx
  const dd = Math.max(0, Math.min(d, totalM))
  // 이진 탐색 대신 선형 (waypoint 수가 적음)
  let i = 1
  while (i < cum.length - 1 && cum[i] < dd) i++
  const segLen = cum[i] - cum[i - 1] || 1
  const t = (dd - cum[i - 1]) / segLen
  const [lat1, lng1] = points[i - 1]
  const [lat2, lng2] = points[i]
  const pos: LatLng = [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]
  const heading = (Math.atan2(lng2 - lng1, lat2 - lat1) * 180) / Math.PI
  return { pos, heading: (heading + 360) % 360 }
}
