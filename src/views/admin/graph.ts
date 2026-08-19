/**
 * 온톨로지 그래프 레이아웃 — 좌표·관계를 한 곳에 모아 둔다.
 * 그리기 순서(엣지 → 라벨 → 노드)는 화면에서 강제하고, 엣지는 원 경계에서 끊는다.
 */

export type NodePos = { key: string; x: number; y: number; r: number }

/** 노드 배치 — Trip을 중심에 두고 주체(좌)·관측(우)로 갈라 배치 */
export const NODES: NodePos[] = [
  { key: 'trip', x: 380, y: 180, r: 46 },
  { key: 'vehicle', x: 254, y: 118, r: 30 },
  { key: 'driver', x: 380, y: 58, r: 30 },
  { key: 'route', x: 506, y: 118, r: 30 },
  { key: 'event', x: 506, y: 242, r: 30 },
  { key: 'sensor', x: 380, y: 302, r: 30 },
  { key: 'loc', x: 254, y: 242, r: 30 },
  { key: 'stop', x: 656, y: 180, r: 26 },
  { key: 'ctx', x: 104, y: 180, r: 26 },
  { key: 'work', x: 108, y: 62, r: 24 },
  { key: 'plea', x: 652, y: 302, r: 24 },
  { key: 'depot', x: 240, y: 330, r: 26 },
  { key: 'operator', x: 104, y: 300, r: 24 },
]

/** at = 라벨을 놓을 위치(0=시작 노드 쪽, 1=끝 노드 쪽) — 겹침 회피용 */
export type Edge = { from: string; to: string; label: string; kind: 'core' | 'derived'; at?: number }

/** core = Trip 중심축 직접 관계 · derived = 클래스 사이의 파생 관계 */
export const EDGES: Edge[] = [
  { from: 'trip', to: 'vehicle', label: '수행차량', kind: 'core' },
  { from: 'trip', to: 'driver', label: '운전자', kind: 'core' },
  { from: 'trip', to: 'route', label: '운행노선', kind: 'core' },
  { from: 'trip', to: 'event', label: '발생사건', kind: 'core' },
  { from: 'trip', to: 'sensor', label: '측정치', kind: 'core' },
  { from: 'trip', to: 'loc', label: '궤적', kind: 'core' },
  { from: 'trip', to: 'ctx', label: '운행맥락', kind: 'core' },
  { from: 'route', to: 'stop', label: '경유정류장', kind: 'core' },
  { from: 'vehicle', to: 'work', label: '정비이력', kind: 'core' },
  { from: 'event', to: 'plea', label: '상황 설명', kind: 'core' },
  { from: 'vehicle', to: 'driver', label: '배정', kind: 'derived' },
  { from: 'event', to: 'loc', label: '발생 지점', kind: 'derived', at: 0.25 },
  { from: 'sensor', to: 'work', label: '고장 라벨', kind: 'derived', at: 0.16 },
  { from: 'trip', to: 'depot', label: '소속차고지', kind: 'core', at: 0.72 },
  { from: 'depot', to: 'operator', label: '운영주체', kind: 'core' },
  { from: 'vehicle', to: 'operator', label: '보유차량', kind: 'derived', at: 0.7 },
]

/** 엣지를 두 원의 경계에서 끊어 선이 원 안으로 들어가지 않게 한다 */
export function trim(a: NodePos, b: NodePos, gap = 3) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return {
    x1: a.x + ux * (a.r + gap),
    y1: a.y + uy * (a.r + gap),
    x2: b.x - ux * (b.r + gap),
    y2: b.y - uy * (b.r + gap),
  }
}
