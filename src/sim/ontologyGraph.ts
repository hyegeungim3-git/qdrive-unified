/**
 * 인스턴스 그래프 순회 — 「근거 사슬」을 **적는 대신 걷는다.**
 *
 * 지금까지 답에 붙던 근거 사슬은 손으로 적은 클래스 이름 나열이었다. 그건 «이렇게 연결돼
 * 있습니다»라는 주장이지 연결의 증거가 아니다. 여기서는 스냅샷의 **실제 레코드 사이를
 * 관계를 따라 걸어서** 사슬을 만든다 — 걸을 수 없으면 사슬이 짧아지고, 그 사실이 답에 드러난다.
 *
 * id 규약: `<클래스>:<식별자>` — 화면·답 어디서든 같은 레코드를 같은 id로 가리킨다.
 *  veh:대구70자3742 · drv:김성호 · rt:급행1 · trip:대구70자3742:120 · evt:대구70자3742:1301
 *  dep:북부차고지 · co:경북교통(주) · ctx:폭우 · plea:12 · vd:대구70자3742:1301
 *
 * 이 파일은 두 저장소(qdrive-unified · qdrive-ontology)가 공유한다.
 */
import type { SimSnapshot } from './types'

export type GNode = { id: string; cls: string; label: string }
export type GLink = { from: string; rel: string; to: string }
export type Walk = {
  /** 순회한 레코드 */
  nodes: GNode[]
  /** 실제로 걸은 관계 */
  links: GLink[]
  /** 사람이 읽는 사슬 — «A ─관계→ B ─관계→ C» */
  trail: string[]
}

const cls = (id: string) => id.split(':')[0]
const CLS_KO: Record<string, string> = {
  veh: '차량',
  drv: '기사',
  rt: '노선',
  trip: '운행',
  evt: '위험운전',
  vd: '판정',
  ctx: '기상',
  dep: '차고지',
  co: '운수사',
  plea: '상황 설명',
}
export const clsKo = (id: string) => CLS_KO[cls(id)] ?? cls(id)

/**
 * 스냅샷 전체를 노드·링크로 편다.
 * 관계 이름은 온톨로지 어휘를 그대로 쓴다 — 화면에 나오는 말과 코드의 말이 같아야
 * «그 관계를 따라갔다»가 검증 가능해진다.
 */
export function buildGraph(s: SimSnapshot): { nodes: Map<string, GNode>; out: Map<string, GLink[]>; inc: Map<string, GLink[]> } {
  const nodes = new Map<string, GNode>()
  const out = new Map<string, GLink[]>()
  const inc = new Map<string, GLink[]>()
  const N = (id: string, label: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, cls: clsKo(id), label })
    return id
  }
  const L = (from: string, rel: string, to: string) => {
    const l = { from, rel, to }
    if (!out.has(from)) out.set(from, [])
    if (!inc.has(to)) inc.set(to, [])
    out.get(from)!.push(l)
    inc.get(to)!.push(l)
  }

  const ctx = N(`ctx:${s.weather.condition}`, s.weather.condition)

  for (const v of s.vehicles) {
    const vid = N(`veh:${v.id}`, v.id)
    const did = N(`drv:${v.driverName}`, `${v.driverName} 기사`)
    L(vid, '운전자', did)
    const rt = s.trips.find((t) => t.vehicleId === v.id)?.routeName ?? v.routeId
    L(vid, '운행노선', N(`rt:${rt}`, rt))
  }

  for (const t of [...s.trips, ...s.deadheads]) {
    const tid = N(`trip:${t.vehicleId}:${Math.round(t.startSimTime)}`, `${t.routeName} ${t.seq}회차`)
    L(tid, '수행차량', N(`veh:${t.vehicleId}`, t.vehicleId))
    L(tid, '운행노선', N(`rt:${t.routeName}`, t.routeName))
    const dep = N(`dep:${t.depot}`, t.depot)
    L(tid, '소속차고지', dep)
    L(dep, '운영주체', N(`co:${t.company}`, t.company))
  }

  for (const e of s.events) {
    const eid = N(`evt:${e.vehicleId}:${Math.round(e.simTime)}`, `${e.eventType} ${mmss(e.simTime)}`)
    L(eid, '발생차량', N(`veh:${e.vehicleId}`, e.vehicleId))
    L(eid, '운행노선', N(`rt:${e.routeName}`, e.routeName))
    L(eid, '운행맥락', N(`ctx:${e.weather}`, e.weather))
    const vd = N(`vd:${e.vehicleId}:${Math.round(e.simTime)}`, e.justified ? '정당 인정' : '감점')
    L(eid, '뒷받침한다', vd)
    // 이벤트가 속한 회차를 시각으로 귀속 — 운행 단위가 중심축이라는 것이 여기서 실제로 쓰인다
    const tr = s.trips.find((t) => t.vehicleId === e.vehicleId && e.simTime >= t.startSimTime && e.simTime <= t.endSimTime)
    if (tr) L(`trip:${tr.vehicleId}:${Math.round(tr.startSimTime)}`, '발생사건', eid)
  }

  for (const p of s.pleas) {
    const pid = N(`plea:${p.id}`, `${p.method} 상황 설명`)
    L(pid, '설명대상', N(`veh:${p.vehicleId}`, p.vehicleId))
  }

  void ctx
  return { nodes, out, inc }
}

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/**
 * 시작 레코드에서 관계를 따라 걷는다(기본 2홉). 방향은 양쪽 다 본다 —
 * 「이 회차에서 무엇이 났나」(정방향)와 「이 이벤트는 어느 회차에 속하나」(역방향)가
 * 둘 다 답의 근거가 되기 때문이다.
 */
export function walkFrom(s: SimSnapshot, startId: string, depth = 2): Walk {
  const g = buildGraph(s)
  if (!g.nodes.has(startId)) return { nodes: [], links: [], trail: [] }

  const seen = new Set<string>([startId])
  const links: GLink[] = []
  let frontier = [startId]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const l of [...(g.out.get(id) ?? []), ...(g.inc.get(id) ?? [])]) {
        const other = l.from === id ? l.to : l.from
        if (links.length < 40) links.push(l)
        if (!seen.has(other)) {
          seen.add(other)
          next.push(other)
        }
      }
    }
    frontier = next
  }

  const nodes = [...seen].map((id) => g.nodes.get(id)!).filter(Boolean)
  // 사람이 읽는 사슬 — 시작점에서 나가는 관계를 한 줄씩
  const trail = (g.out.get(startId) ?? [])
    .concat(g.inc.get(startId) ?? [])
    .slice(0, 6)
    .map((l) => {
      const isOut = l.from === startId
      const a = g.nodes.get(startId)!
      const b = g.nodes.get(isOut ? l.to : l.from)!
      return isOut
        ? `${a.label} ─${l.rel}→ ${b.label} (${b.cls})`
        : `${b.label} (${b.cls}) ─${l.rel}→ ${a.label}`
    })

  return { nodes, links, trail }
}

/** 순회 결과를 클래스별로 센다 — 「무엇들이 걸렸나」를 한 줄로 보여 주기 위해 */
export function countByClass(w: Walk): string[] {
  const m = new Map<string, number>()
  for (const n of w.nodes) m.set(n.cls, (m.get(n.cls) ?? 0) + 1)
  return [...m.entries()].map(([k, v]) => `${k} ${v}`)
}
