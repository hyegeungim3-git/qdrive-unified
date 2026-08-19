/**
 * 온톨로지 질의 엔진 — 제안서 「맥락이 붙으면 비로소 답할 수 있는 질문」 4종에 **실제로** 답한다.
 *
 * 설계 원칙
 *  - 답은 전부 **스냅샷에서 계산**한다. 문장 생성은 하되 숫자는 지어내지 않는다.
 *  - 답과 함께 **어떤 클래스를 어떤 관계로 걸어서 나왔는지**(path)를 돌려준다.
 *    표 조회로는 못 하고 온톨로지라야 되는 이유가 여기서 눈에 보여야 한다.
 *  - 근거가 예시 상수면 `caveat`으로 밝힌다. 모르는 것을 아는 척하지 않는다.
 *  - 데이터가 아직 안 쌓였으면 `empty`로 답한다 — 빈 값을 그럴듯한 문장으로 덮지 않는다.
 *
 * 이 파일은 두 저장소(qdrive-unified · qdrive-ontology)가 공유한다. 한쪽을 고치면 양쪽에 반영할 것.
 */
import { DEPOTS } from './depots'
import { countByClass, walkFrom, type Walk } from './ontologyGraph'
import type { Packet521, SimSnapshot } from './types'

/**
 * 데이터 원천 — 「이 숫자가 어디서 왔나」.
 * 코드는 데이터 관리자 ①수집 화면의 원천 코드와 **같은 문자열**을 쓴다. 답에서 본 출처를
 * 그 화면에서 그대로 찾을 수 있어야 근거가 근거로 기능한다.
 */
export type QaSource = {
  code: string
  name: string
  /** 보유 주체 — 협약 없이 지금 쓸 수 있는 데이터인지가 여기서 갈린다 */
  owner: string
  /** 이 답에서 무엇을 댔나 */
  role: string
  /** 지금 엔진이 실제로 내는 값인가 (false = 예시 상수·설계상 정의) */
  live: boolean
  /** 원본을 눈으로 확인할 수 있는 화면 — 답을 믿으라고 하지 않고 «가서 보라»고 한다 */
  see?: { tab: string; sub?: string; label: string }
}

const SRC = {
  dtg409: { code: 'DTG 409', name: '운행기록계 실시간 패킷', owner: '오큐브 자체 자산' },
  dtg521: { code: 'DTG 521', name: '운행기록계 운행기록', owner: '오큐브 자체 자산' },
  obd: { code: 'OBD/CAN', name: '차량 자가진단 센서', owner: '오큐브 자체 자산' },
  rtk: { code: 'RTK', name: '정밀 위치 보정', owner: '단말 + 국가 무료 인프라' },
  weather: { code: '날씨·돌발', name: '기상·돌발 정보', owner: '공개 데이터' },
  plea: { code: '기사 소명', name: '기사 앱 상황 설명', owner: '오큐브 자체 자산' },
  depot: { code: '차고지 출입고', name: '출입고·교대 기록', owner: '운수사' },
  route: { code: '노선 기준정보', name: '인가노선·방향 정의', owner: '대구시 공개' },
} as const

/** 원천별 «원본을 볼 수 있는 화면» — 데이터 관리자 ①수집의 최근 데이터 탭이 기본 확인처다 */
const SEE: Record<string, { tab: string; sub?: string; label: string }> = {
  'DTG 409': { tab: 'admin', label: '데이터 관리자 ①수집 → 최근 데이터' },
  'DTG 521': { tab: 'operator', sub: 'trips', label: '운수사 관제 → 운행 이력' },
  'OBD/CAN': { tab: 'operator', sub: 'scanner', label: '운수사 관제 → 진단 스캐너' },
  RTK: { tab: 'admin', label: '데이터 관리자 ①수집 → 최근 데이터' },
  '날씨·돌발': { tab: 'city', label: '시티 대시보드 → 기상·돌발' },
  '기사 소명': { tab: 'driver', label: '기사 앱 → 상황 설명' },
  '차고지 출입고': { tab: 'operator', sub: 'depot', label: '운수사 관제 → 차고지·충전' },
  '노선 기준정보': { tab: 'operator', sub: 'routes', label: '운수사 관제 → 노선 관리' },
}

const src = (s: (typeof SRC)[keyof typeof SRC], role: string, live = true): QaSource => ({ ...s, role, live, see: SEE[s.code] })

export type Evidence = {
  k: string
  v: string
  /** 이 값을 댄 원천 코드 — 화면에서 각주로 붙는다 */
  src?: string
}

/** 개조식 한 절 — 「무엇을」 다음에 「왜 그런가」가 오도록 제목을 붙인다 */
export type QaSection = {
  h: string
  items: string[]
  /** 이 절이 기댄 원천 코드 — 화면에서 절 제목 옆 각주가 되고, 누르면 그 출처가 펼쳐진다 */
  src?: string[]
}

/** 이어서 물을 질문 — 대화가 한 번에 끝나지 않게 다음 수를 놓아 준다 */
export type QaFollow = { q: string; topic: string; target?: string }

export type QaResult = {
  id: string
  /** 질문 원문 */
  q: string
  /** 문법상 사슬 — 어떤 클래스를 어떤 관계로 걸을 수 있는가 (정의) */
  path: string[]
  /** 실제로 걸은 사슬 — 레코드 사이를 순회한 결과 (증거) */
  walk?: { trail: string[]; nodes: number; classes: string[]; startLabel: string }
  /** 이 답이 쓴 데이터 원천 */
  sources: QaSource[]
  /** 한 줄 답 */
  headline: string
  /** 한 줄 요약 — 결론 바로 밑에 붙는 짧은 문장 */
  detail: string
  /** 개조식 본문 */
  sections: QaSection[]
  /** 이어서 물을 질문 */
  follow: QaFollow[]
  evidence: Evidence[]
  /** 이 답이 가리키는 대상 (지칭 대상을 답에도 그대로 적는다) */
  subject?: string
  /** 원본 레코드 — 답의 근거가 된 패킷/기록 그 자체. 화면에서 펼쳐 대조한다 */
  record?: { title: string; fields: { k: string; v: string }[] }
  /** 예시 데이터·모델 한계 고지 */
  caveat?: string
  /** 아직 계산할 데이터가 없다 */
  empty?: boolean
}

/** 질문이 가리킬 대상 — «이 주행»이 아니라 «6690호 3회차»를 묻게 만드는 축 */
export type QaTarget = { id: string; label: string; sub?: string }

export type QaTopic = {
  id: string
  /** 대상이 없을 때의 대표 질문 (제안서 문구) */
  q: string
  /** 대상을 고른 뒤의 구체 질문 */
  qOf?: (t: QaTarget) => string
  /** 지금 고를 수 있는 대상들 — 스냅샷에서 뽑는다 */
  targets?: (s: SimSnapshot) => QaTarget[]
  /** 짧은 꼬리표 */
  tag: string
  /** 자유 입력 라우팅용 키워드 */
  keywords: string[]
  run: (s: SimSnapshot, targetId?: string) => QaResult
}

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const short = (id: string) => id.slice(-4) + '호'
const km = (n: number) => `${n.toFixed(1)}km`

/** 순회 결과를 답에 담을 형태로 — 걸을 수 없으면 undefined라서 화면이 «못 걸었다»를 말할 수 있다 */
const walkOf = (s: SimSnapshot, startId: string, startLabel: string) => {
  const w: Walk = walkFrom(s, startId)
  return w.nodes.length ? { trail: w.trail, nodes: w.nodes.length, classes: countByClass(w), startLabel } : undefined
}

/** 영업·공차를 한 줄로 요약 — 여러 질문이 같은 형식을 쓴다 */
const tripLine = (t: Packet521) =>
  `${short(t.vehicleId)} ${mmss(t.startSimTime)}~${mmss(t.endSimTime)} ${t.routeName} ${t.direction} ${t.seq}회차`

/* ═══════════ ① 이 주행은 영업인가 공차인가 ═══════════ */

export const tripTargets = (s: SimSnapshot): QaTarget[] =>
  [...s.trips.slice(0, 5).map((t) => ({ id: `t:${t.vehicleId}:${Math.round(t.startSimTime)}`, label: `${short(t.vehicleId)} ${t.seq}회차`, sub: `${mmss(t.startSimTime)}~${mmss(t.endSimTime)} ${t.routeName}` })),
   ...s.deadheads.slice(0, 3).map((t) => ({ id: `d:${t.vehicleId}:${Math.round(t.endSimTime)}`, label: `${short(t.vehicleId)} ${t.routeName}`, sub: `회송 ${t.distanceKm}km` }))]

const runTripKind = (s: SimSnapshot, targetId?: string): QaResult => {
  const id = 'tripKind'
  const q = '이 주행은 영업인가 공차인가'
  const path = ['운행(Trip)', '─운행유형→ 영업/공차', '─소속차고지→ 차고지(Depot)', '─운행노선→ 노선(Route)']
  const sources = [
    src(SRC.dtg521, '회차 구간의 거리·연료·시각'),
    src(SRC.depot, '운행유형(영업/공차)·소속 차고지', false),
    src(SRC.route, '인가노선·방향'),
  ]
  const dh = s.deadheads
  /** 지목한 회차가 있으면 그것을, 없으면 최근 회차를 본다 */
  const pickTrip = () => {
    if (!targetId) return s.trips[0]
    const [kind, vid, t0] = targetId.split(':')
    const pool = kind === 'd' ? dh : s.trips
    const key = kind === 'd' ? (x: Packet521) => Math.round(x.endSimTime) : (x: Packet521) => Math.round(x.startSimTime)
    return pool.find((x) => x.vehicleId === vid && String(key(x)) === t0) ?? s.trips[0]
  }
  const latest = pickTrip()
  if (!latest) {
    return {
      id, q, path, sources, sections: [], follow: [], empty: true,
      headline: '아직 완료된 영업 운행이 없습니다',
      detail: `지금까지 기록된 것은 차고지 출고 공차 ${dh.length}건뿐입니다. 배속을 올려 첫 회차가 끝나면 영업 운행이 쌓입니다.`,
      evidence: [{ k: '공차 기록', v: `${dh.length}건` }],
    }
  }
  const revKm = s.trips.reduce((n, t) => n + t.distanceKm, 0)
  const dhKm = dh.reduce((n, t) => n + t.distanceKm, 0)
  const total = revKm + dhKm
  const dhPct = total > 0 ? (dhKm / total) * 100 : 0
  const sameVehDh = dh.filter((t) => t.vehicleId === latest.vehicleId)
  const isRev = latest.kind === '영업'
  return {
    id, q, path, sources,
    walk: walkOf(s, `trip:${latest.vehicleId}:${Math.round(latest.startSimTime)}`, `${latest.routeName} ${latest.seq}회차`),
    subject: `${latest.vehicleId} · ${latest.seq}회차 (${mmss(latest.startSimTime)}~${mmss(latest.endSimTime)})`,
    record: {
      title: `DTG 521 운행기록 — ${latest.vehicleId}`,
      fields: [
        { k: 'packetType', v: '521' },
        { k: 'vehicleId', v: latest.vehicleId },
        { k: 'routeName', v: latest.routeName },
        { k: 'direction / seq', v: `${latest.direction} / ${latest.seq}` },
        { k: 'kind (운행유형)', v: latest.kind },
        { k: 'depot / company', v: `${latest.depot} / ${latest.company}` },
        { k: 'start~end', v: `${mmss(latest.startSimTime)}~${mmss(latest.endSimTime)}` },
        { k: 'distanceKm / fuelM3 / co2Kg', v: `${latest.distanceKm} / ${latest.fuelM3} / ${latest.co2Kg}` },
      ],
    },
    headline: `${tripLine(latest)} — ${latest.kind}`,
    sections: [
      {
        h: '판정 근거',
        src: ['차고지 출입고', 'DTG 521', '노선 기준정보'],
        items: [
          `운행유형 필드가 «${latest.kind}»로 기록됨 — 거리·연료만으로는 구분되지 않는 값`,
          `노선 ${latest.routeName} ${latest.direction} · 그날 ${latest.seq}번째 운행`,
          `소속 ${latest.depot}(${latest.company}) — 차고지 축이 붙어야 나오는 답`,
        ],
      },
      {
        h: '이 회차 실적',
        src: ['DTG 521'],
        items: [
          `주행 ${km(latest.distanceKm)} · 연료 ${latest.fuelM3.toFixed(2)}m³ · CO₂ ${latest.co2Kg.toFixed(1)}kg`,
          `구간 ${mmss(latest.startSimTime)}~${mmss(latest.endSimTime)}`,
        ],
      },
      {
        h: '오늘 전체에서 차지하는 몫',
        src: ['DTG 521', '차고지 출입고'],
        items: [
          `영업 ${s.trips.length}회 ${km(revKm)} / 공차 ${dh.length}회 ${km(dhKm)}`,
          `공차 비율 ${dhPct.toFixed(1)}% (거리 기준) — 수입 없이 달린 몫`,
          `이 차량의 회송만 ${sameVehDh.length}건`,
        ],
      },
    ],
    follow: [
      { q: `${latest.depot}가 만든 공차는 얼마인가`, topic: 'depotDeadhead', target: latest.depot },
      { q: `${short(latest.vehicleId)}의 감축은 코칭 때문인가 유가 때문인가`, topic: 'attribution', target: latest.vehicleId },
    ],
    detail:
      (isRev
        ? `이 기록은 인가노선 ${latest.routeName} ${latest.direction} 주행이므로 **영업**입니다. `
        : `이 기록은 ${latest.routeName} 구간이라 승객을 태우지 않는 **공차**입니다. `) +
      `같은 차량은 ${latest.depot}(${latest.company}) 소속이고, 오늘 회송(공차) ${sameVehDh.length}건이 따로 기록돼 있습니다. ` +
      `거리·연료만 보면 둘은 구분되지 않습니다 — 운행유형을 운행 단위에 붙여 둬야 나오는 답입니다.`,
    evidence: [
      { k: '판정', v: `${latest.kind} (${latest.routeName} ${latest.direction})`, src: '차고지 출입고' },
      { k: '운행 순번', v: `${latest.seq}회차`, src: 'DTG 521' },
      { k: '소속', v: `${latest.depot} · ${latest.company}`, src: '차고지 출입고' },
      { k: '이 회차 실적', v: `${km(latest.distanceKm)} · ${latest.fuelM3.toFixed(2)}m³ · CO₂ ${latest.co2Kg.toFixed(1)}kg`, src: 'DTG 521' },
      { k: '오늘 전체', v: `영업 ${s.trips.length}회 ${km(revKm)} / 공차 ${dh.length}회 ${km(dhKm)}`, src: 'DTG 521' },
      { k: '공차 비율', v: `${dhPct.toFixed(1)}% (거리 기준)`, src: '차고지 출입고' },
    ],
  }
}

/* ═══════════ ② 이 급감속은 어떤 노선·날씨에서 났나 ═══════════ */

export const eventTargets = (s: SimSnapshot): QaTarget[] =>
  s.events.slice(0, 6).map((e) => ({ id: `${e.vehicleId}:${Math.round(e.simTime)}`, label: `${short(e.vehicleId)} ${e.eventType}`, sub: `${mmss(e.simTime)} · ${e.routeName} · ${e.weather}` }))

const runEventContext = (s: SimSnapshot, targetId?: string): QaResult => {
  const id = 'eventContext'
  const q = '이 급감속은 어떤 노선·날씨에서 났나'
  const path = [
    '위험운전(RiskEvent)',
    '─발생차량→ 차량(Vehicle) ─운행노선→ 노선(Route)',
    '─운행맥락→ 기상(Context)',
    '─판정→ 정당/감점',
  ]
  const sources = [
    src(SRC.dtg409, '이벤트 종류·발생 시각·속도·RPM'),
    src(SRC.rtk, '발생 지점 정밀 위치'),
    src(SRC.dtg521, '이벤트가 속한 회차·노선 방향'),
    src(SRC.route, '정류장 구간·도로명'),
    src(SRC.weather, '발생 시점 기상 맥락'),
    src(SRC.plea, '기사 상황 설명(있을 때)'),
  ]
  const byId = targetId ? s.events.find((e) => `${e.vehicleId}:${Math.round(e.simTime)}` === targetId) : null
  const decel = byId ?? s.events.find((e) => e.eventType === '급감속' || e.eventType === '급정지') ?? s.events[0]
  if (!decel) {
    return {
      id, q, path, sources, sections: [], follow: [], empty: true,
      headline: '아직 기록된 위험운전이 없습니다',
      detail: '위험운전이 발생하면 그 시점의 노선·날씨가 함께 기록됩니다.',
      evidence: [{ k: '누적 이벤트', v: `${s.kpi.totalEvents}건` }],
    }
  }
  const v = s.vehicles.find((x) => x.id === decel.vehicleId)
  const trip = s.trips.find((t) => t.vehicleId === decel.vehicleId && decel.simTime >= t.startSimTime && decel.simTime <= t.endSimTime)
  const sameCtx = s.events.filter((e) => e.routeName === decel.routeName && e.weather === decel.weather).length
  const plea = s.pleas.find((p) => p.vehicleId === decel.vehicleId && p.eventType === decel.eventType)
  return {
    id, q, path, sources,
    walk: walkOf(s, `evt:${decel.vehicleId}:${Math.round(decel.simTime)}`, `${decel.eventType} ${mmss(decel.simTime)}`),
    subject: `${decel.vehicleId} · ${decel.eventType} @ ${mmss(decel.simTime)}`,
    record: {
      title: `DTG 409 위험운전 패킷 — ${decel.vehicleId}`,
      fields: [
        { k: 'packetType', v: '409' },
        { k: 'vehicleId', v: decel.vehicleId },
        { k: 'eventType', v: decel.eventType },
        { k: 'simTime', v: `${mmss(decel.simTime)} (${Math.round(decel.simTime)}s)` },
        { k: 'speedKmh / rpm', v: `${decel.speedKmh} / ${decel.rpm}` },
        { k: 'lat / lng', v: `${decel.lat.toFixed(5)} / ${decel.lng.toFixed(5)}` },
        { k: 'routeName', v: decel.routeName },
        { k: 'weather', v: decel.weather },
        { k: 'justified', v: String(!!decel.justified) + (decel.justifyReason ? ` (${decel.justifyReason})` : '') },
      ],
    },
    headline: `${mmss(decel.simTime)} ${short(decel.vehicleId)} ${decel.eventType} — ${decel.routeName} · ${decel.weather}`,
    sections: [
      {
        h: '언제·어디서·누가',
        src: ['DTG 409', 'RTK', 'DTG 521'],
        items: [
          `${mmss(decel.simTime)} · ${decel.routeName}${trip ? ` ${trip.direction} ${trip.seq}회차` : ''}`,
          `${v?.driverName ?? '기사'} 기사 · ${decel.vehicleId}`,
          `발생 지점 ${decel.segment}${decel.road ? ` · ${decel.road}` : ''}`,
          `RTK 정밀 좌표 ${decel.lat.toFixed(5)}, ${decel.lng.toFixed(5)}`,
        ],
      },
      {
        h: '어떤 상황이었나',
        src: ['DTG 409', '날씨·돌발'],
        items: [
          `속도 ${decel.speedKmh}km/h · RPM ${decel.rpm}`,
          `발생 시점 날씨 «${decel.weather}» — 현재 날씨는 «${s.weather.condition}»`,
          `날씨는 이벤트에 새겨 둔 값이라 시간이 지나도 이 답은 바뀌지 않음`,
        ],
      },
      {
        h: '판정',
        src: ['날씨·돌발', '기사 소명'],
        items: decel.justified
          ? [`정당 인정 — 사유: ${decel.justifyReason}`, '감점되지 않음 (맥락이 붙어야 가능한 판정)']
          : ['현재 감점 처리', plea ? `기사 상황 설명 ${plea.method} 접수 (${plea.status})` : '이 이벤트에 대한 기사 상황 설명 없음 — 인정되면 복원됨'],
      },
      {
        h: '기사 상황 설명 (소명)',
        src: ['기사 소명'],
        items: s.pleas.length
          ? s.pleas
              .slice(0, 4)
              .map((p) => `${p.driverName} 기사 · ${p.eventType} — “${p.note}” (${p.method} · ${p.status})`)
          : ['접수된 상황 설명이 없습니다'],
      },
      { h: '같은 맥락 누적', src: ['DTG 409'], items: [`${decel.routeName} · ${decel.weather} 조건에서 ${sameCtx}건`] },
    ],
    follow: [
      { q: `${short(decel.vehicleId)}의 감축은 코칭 때문인가 유가 때문인가`, topic: 'attribution', target: decel.vehicleId },
      { q: '이 주행은 영업인가 공차인가', topic: 'tripKind' },
    ],
    detail:
      `${v?.driverName ?? '기사'} 기사, ${decel.speedKmh}km/h에서 발생했습니다. 발생 시점 날씨는 **${decel.weather}**이고 노선은 **${decel.routeName}**입니다. ` +
      (decel.justified
        ? `맥락 판정 결과 **정당**으로 인정돼 감점되지 않았습니다 — 사유: ${decel.justifyReason}.`
        : `현재 감점 처리 상태이며, 기사 상황 설명이 인정되면 복원됩니다.`) +
      ` 날씨는 스냅샷의 현재값이 아니라 **이벤트에 새겨 둔 발생 당시 값**이라, 시간이 지나 날씨가 바뀌어도 이 답은 흔들리지 않습니다.`,
    evidence: [
      { k: '노선', v: `${decel.routeName}${trip ? ` ${trip.direction} ${trip.seq}회차` : ''}`, src: 'DTG 521' },
      { k: '발생 시점 날씨', v: `${decel.weather} (현재 ${s.weather.condition})`, src: '날씨·돌발' },
      { k: '속도 · RPM', v: `${decel.speedKmh}km/h · ${decel.rpm}`, src: 'DTG 409' },
      { k: '발생 지점', v: `${decel.segment}${decel.road ? ` · ${decel.road}` : ''}`, src: '노선 기준정보' },
      { k: 'RTK 좌표', v: `${decel.lat.toFixed(5)}, ${decel.lng.toFixed(5)}`, src: 'RTK' },
      { k: '판정', v: decel.justified ? `정당 — ${decel.justifyReason}` : '감점', src: '날씨·돌발' },
      { k: '상황 설명', v: plea ? `${plea.method} 접수 (${plea.status})` : '없음', src: '기사 소명' },
      { k: '같은 노선·같은 날씨', v: `${sameCtx}건 누적`, src: 'DTG 409' },
    ],
  }
}

/* ═══════════ ③ 이 차고지가 만든 공차는 얼마인가 ═══════════ */

export const depotTargets = (): QaTarget[] => DEPOTS.map((d) => ({ id: d.name, label: d.name, sub: `${d.company} · 편도 ${d.deadheadKm}km` }))

const runDepotDeadhead = (s: SimSnapshot, targetId?: string): QaResult => {
  const id = 'depotDeadhead'
  const q = '이 차고지가 만든 공차는 얼마인가'
  const path = ['차고지(Depot)', '←소속차고지─ 운행(Trip, 유형=공차)', '─집계→ 거리·연료·CO₂']
  const sources = [
    src(SRC.depot, '출·입고 시각과 편도 회송거리', false),
    src(SRC.dtg521, '회송 구간의 연료·CO₂ 환산 기준'),
  ]
  const rows = DEPOTS.map((d) => {
    const ts = s.deadheads.filter((t) => t.depot === d.name)
    return {
      depot: d.name,
      company: d.company,
      n: ts.length,
      km: ts.reduce((a, t) => a + t.distanceKm, 0),
      fuel: ts.reduce((a, t) => a + t.fuelM3, 0),
      co2: ts.reduce((a, t) => a + t.co2Kg, 0),
      oneWay: d.deadheadKm,
    }
  }).sort((a, b) => b.km - a.km)
  const top = (targetId ? rows.find((r) => r.depot === targetId) : null) ?? rows[0]
  if (!top || top.n === 0) {
    return {
      id, q, path, sources, sections: [], follow: [], empty: true,
      headline: '아직 공차 기록이 없습니다',
      detail: '차고지 출고·입고가 기록되면 차고지별로 집계됩니다.',
      evidence: [],
    }
  }
  const totKm = rows.reduce((a, r) => a + r.km, 0)
  const totFuel = rows.reduce((a, r) => a + r.fuel, 0)
  const revKm = s.trips.reduce((n, t) => n + t.distanceKm, 0)
  return {
    id, q, path, sources,
    walk: walkOf(s, `dep:${top.depot}`, top.depot),
    subject: `${top.depot} (${top.company})`,
    record: {
      title: `차고지 출입고 기록 — ${top.depot}`,
      fields: [
        { k: 'depot', v: top.depot },
        { k: 'company', v: top.company },
        { k: '편도 회송거리(예시 상수)', v: `${top.oneWay}km` },
        { k: '공차 기록 수', v: `${top.n}건` },
        { k: '합계 거리 / 연료 / CO₂', v: `${top.km.toFixed(1)}km / ${top.fuel.toFixed(1)}m³ / ${top.co2.toFixed(1)}kg` },
      ],
    },
    headline: `${top.depot} — 공차 ${km(top.km)} (${top.n}회, 연료 ${top.fuel.toFixed(1)}m³)`,
    sections: [
      {
        h: '이 차고지가 만든 공차',
        src: ['차고지 출입고', 'DTG 521'],
        items: [
          `${top.n}회 · ${km(top.km)} · 연료 ${top.fuel.toFixed(1)}m³ · CO₂ ${top.co2.toFixed(1)}kg`,
          `편도 회송거리 ${km(top.oneWay)}가 출·입고마다 반복됨`,
          `운영 주체 ${top.company}`,
        ],
      },
      { h: '차고지별 비교', src: ['차고지 출입고'], items: rows.map((r) => `${r.depot} — ${r.n}회 · ${km(r.km)} · ${r.fuel.toFixed(1)}m³`) },
      {
        h: '무엇을 뜻하나',
        src: ['차고지 출입고', 'DTG 521'],
        items: [
          `3개 차고지 합계 ${km(totKm)} · ${totFuel.toFixed(1)}m³ — 같은 시간 영업거리는 ${km(revKm)}`,
          '공차는 수입이 없는 주행 — 차고지 배치와 교대 주기를 바꾸면 그대로 줄어드는 비용',
        ],
      },
    ],
    follow: [
      { q: '이 주행은 영업인가 공차인가', topic: 'tripKind' },
      { q: '실증 9대 전체의 감축은 코칭 때문인가 유가 때문인가', topic: 'attribution', target: 'all' },
    ],
    detail:
      `${top.company} 소속 ${top.depot}가 오늘 만든 공차가 가장 많습니다. 편도 회송거리 ${km(top.oneWay)}가 출·입고마다 반복되기 때문입니다. ` +
      `3개 차고지 합계는 ${km(totKm)}·${totFuel.toFixed(1)}m³이고, 같은 시간 영업거리는 ${km(revKm)}입니다. ` +
      `공차는 수입이 없는 주행이라 **차고지 배치와 교대 주기를 바꾸면 그대로 줄어드는 비용**입니다.`,
    evidence: rows.map((r) => ({
      k: `${r.depot} (${r.company})`,
      v: `${r.n}회 · ${km(r.km)} · ${r.fuel.toFixed(1)}m³ · CO₂ ${r.co2.toFixed(1)}kg`,
    })).concat([{ k: '합계', v: `${km(totKm)} · ${totFuel.toFixed(1)}m³` }]),
    caveat: '편도 회송거리는 예시 상수(차고지↔기점)입니다. 실증 단계에서 차고지 출입고 기록의 실측 거리로 교체되며, 집계 구조와 이 질의는 그대로 동작합니다.',
  }
}

/* ═══════════ ④ 이 감축은 코칭 때문인가 유가 때문인가 ═══════════ */

const PERSONA_LABEL: Record<string, string> = { A: '모범 운전군', B: '평균 운전군', C: '코칭 대상군' }

export const vehicleTargets = (s: SimSnapshot): QaTarget[] =>
  [{ id: 'all', label: '실증 9대 전체', sub: '기사군 A/B/C 대조' },
   ...s.vehicles.map((v) => ({ id: v.id, label: short(v.id), sub: `${v.driverName} · ${PERSONA_LABEL[v.persona]}` }))]

const runAttribution = (s: SimSnapshot, targetId?: string): QaResult => {
  const id = 'attribution'
  const q = '이 감축은 코칭 때문인가 유가 때문인가'
  const path = [
    '운행(Trip) ─측정치→ 연료(실측)',
    '운행(Trip) ─반사실→ 기준선 연료(코칭 미적용 가정)',
    '─귀속→ 성과(Attribution) ─대조→ 기사군(A/B/C)',
  ]
  const sources = [
    src(SRC.obd, '연료 실측(분사량) — 실측과 기준선의 비교 대상'),
    src(SRC.dtg521, '회차별 주행거리·연료 — 기준선 산출의 축'),
    src(SRC.dtg409, '급조작 낭비 분해'),
  ]
  const one = targetId && targetId !== 'all' ? s.vehicles.find((v) => v.id === targetId) : null
  const scope = one ? [one] : s.vehicles
  const base = scope.reduce((a, v) => a + v.baselineFuelM3, 0)
  const act = scope.reduce((a, v) => a + v.fuelM3, 0)
  if (base <= 0) {
    return {
      id, q, path, sources, sections: [], follow: [], empty: true,
      headline: '아직 주행이 쌓이지 않아 귀속을 계산할 수 없습니다',
      detail: '배속을 올려 주행이 누적되면 반사실(코칭 미적용 가정) 대비 순효과가 계산됩니다.',
      evidence: [],
    }
  }
  const saved = Math.max(0, base - act)
  const pct = (saved / base) * 100
  const byPersona = (['A', 'B', 'C'] as const).map((p) => {
    const vs = s.vehicles.filter((v) => v.persona === p)
    const b = vs.reduce((a, v) => a + v.baselineFuelM3, 0)
    const a2 = vs.reduce((a, v) => a + v.fuelM3, 0)
    return { p, label: PERSONA_LABEL[p], pct: b > 0 ? ((b - a2) / b) * 100 : 0, n: vs.length }
  })
  const ordered = byPersona[0].pct < byPersona[1].pct && byPersona[1].pct < byPersona[2].pct
  const waste = s.vehicles.reduce(
    (a, v) => ({ idle: a.idle + v.fuelWaste.idle, harsh: a.harsh + v.fuelWaste.harsh, habit: a.habit + v.fuelWaste.habit, ac: a.ac + v.fuelWaste.ac }),
    { idle: 0, harsh: 0, habit: 0, ac: 0 },
  )
  return {
    id, q, path, sources,
    walk: one ? walkOf(s, `veh:${one.id}`, one.id) : walkOf(s, `veh:${s.vehicles[0]?.id ?? ''}`, s.vehicles[0]?.id ?? ''),
    subject: one ? `${one.id} (${one.driverName} 기사 · ${PERSONA_LABEL[one.persona]})` : '실증 9대 전체',
    record: one
      ? {
          title: `연료 실측 vs 기준선 — ${one.id}`,
          fields: [
            { k: 'vehicleId / driver', v: `${one.id} / ${one.driverName}` },
            { k: 'persona (기사군)', v: `${one.persona} · ${PERSONA_LABEL[one.persona]}` },
            { k: 'distanceKm', v: one.distanceKm.toFixed(2) },
            { k: 'fuelM3 (실측)', v: one.fuelM3.toFixed(3) },
            { k: 'baselineFuelM3 (반사실)', v: one.baselineFuelM3.toFixed(3) },
            { k: 'fuelWaste 분해', v: `습관 ${one.fuelWaste.habit.toFixed(3)} · 급조작 ${one.fuelWaste.harsh.toFixed(3)} · 공회전 ${one.fuelWaste.idle.toFixed(3)} · 냉방 ${one.fuelWaste.ac.toFixed(3)}` },
          ],
        }
      : undefined,
    headline: `코칭 귀속 −${pct.toFixed(2)}% — 유가 효과 아님 (연료 «양»이 줄었음)`,
    sections: [
      {
        h: '무엇과 무엇을 비교했나',
        src: ['OBD/CAN', 'DTG 521'],
        items: [
          `기준선(코칭을 안 했다고 가정) ${base.toFixed(1)}m³`,
          `실측 ${act.toFixed(1)}m³ — 차이 ${saved.toFixed(1)}m³ (−${pct.toFixed(2)}%)`,
          '비교 대상은 금액이 아니라 연료 «양»',
        ],
      },
      {
        h: '왜 유가 때문이 아닌가',
        src: ['OBD/CAN'],
        items: [
          '유가는 같은 양의 연료 «가격»만 바꾸므로 이 차이를 만들 수 없음',
          '날씨(폭염 냉방부하)는 기준선과 실측에 똑같이 적용돼 상쇄됨',
        ],
      },
      {
        h: ordered ? '코칭이 원인이라는 지문' : '기사군별 차등 (누적 부족)',
        src: ['OBD/CAN'],
        items: byPersona.map((g) => `${g.label} ${g.n}대 — −${g.pct.toFixed(2)}%`).concat(
          ordered ? ['개선 여지가 큰 군에서 효과가 크다 = 외부 요인이 아니라 코칭이 원인'] : ['주행이 더 쌓이면 A<B<C 순서가 드러남'],
        ),
      },
      {
        h: '낭비 요인 분해',
        src: ['DTG 409'],
        items: [
          `운전 습관 ${waste.habit.toFixed(2)}m³ · 급조작 ${waste.harsh.toFixed(2)}m³`,
          `공회전 ${waste.idle.toFixed(2)}m³ · 냉방 ${waste.ac.toFixed(2)}m³`,
        ],
      },
    ],
    follow: [
      { q: '이 급감속은 어떤 노선·날씨에서 났나', topic: 'eventContext' },
      { q: '이 차고지가 만든 공차는 얼마인가', topic: 'depotDeadhead' },
    ],
    detail:
      `비교 대상은 금액이 아니라 **연료량**입니다. 코칭을 하지 않았다고 가정한 기준선 ${base.toFixed(1)}m³ 대비 실측 ${act.toFixed(1)}m³로 ` +
      `${saved.toFixed(1)}m³ 적게 썼습니다. 유가는 같은 양의 연료 «가격»만 바꾸므로 이 차이를 만들 수 없습니다. ` +
      `날씨(폭염 냉방부하)는 기준선과 실측에 **똑같이** 적용돼 상쇄됩니다. ` +
      (ordered
        ? `결정적인 것은 기사군별 차등입니다 — ${byPersona.map((g) => `${g.label} ${g.pct.toFixed(2)}%`).join(' < ')}. ` +
          `개선 여지가 큰 군에서 효과가 크다는 것은 외부 요인이 아니라 **코칭이 원인**이라는 지문입니다.`
        : `기사군별 차등은 아직 뚜렷하지 않습니다(주행 누적 부족)<B<C 순서가 드러납니다.`),
    evidence: [
      { k: '기준선 (코칭 미적용 가정)', v: `${base.toFixed(1)}m³`, src: 'DTG 521' },
      { k: '실측', v: `${act.toFixed(1)}m³`, src: 'OBD/CAN' },
      { k: '순효과 (코칭 귀속)', v: `−${saved.toFixed(1)}m³ · −${pct.toFixed(2)}%`, src: 'OBD/CAN' },
      ...byPersona.map((g) => ({ k: `${g.label} (${g.n}대)`, v: `−${g.pct.toFixed(2)}%`, src: 'OBD/CAN' })),
      { k: '낭비 분해', v: `습관 ${waste.habit.toFixed(2)} · 급조작 ${waste.harsh.toFixed(2)} · 공회전 ${waste.idle.toFixed(2)} · 냉방 ${waste.ac.toFixed(2)} m³`, src: 'DTG 409' },
    ],
    caveat: '유가는 이 데모의 엔진 변수가 아닙니다. 반사실 비교가 연료 «양»을 대상으로 하므로, 유가가 어떻게 변하든 이 귀속 결과는 바뀌지 않습니다.',
  }
}

/* ═══════════ 토픽 목록 · 라우팅 ═══════════ */

export const QA_TOPICS: QaTopic[] = [
  {
    id: 'tripKind',
    q: '이 주행은 영업인가 공차인가',
    qOf: (t) => `${t.label} 주행(${t.sub ?? ''})은 영업인가 공차인가`,
    targets: tripTargets,
    tag: '운행유형',
    keywords: ['영업', '공차', '운행유형', '회송'],
    run: runTripKind,
  },
  {
    id: 'eventContext',
    q: '이 급감속은 어떤 노선·날씨에서 났나',
    qOf: (t) => `${t.label}(${t.sub ?? ''})은 어떤 노선·날씨에서 났나`,
    targets: eventTargets,
    tag: '맥락',
    keywords: ['급감속', '급정지', '위험운전', '날씨', '폭우', '맥락'],
    run: runEventContext,
  },
  {
    id: 'depotDeadhead',
    q: '이 차고지가 만든 공차는 얼마인가',
    qOf: (t) => `${t.label}가 만든 공차는 얼마인가`,
    targets: () => depotTargets(),
    tag: '차고지',
    keywords: ['차고지', '공차', '회송', '출고', '입고'],
    run: runDepotDeadhead,
  },
  {
    id: 'attribution',
    q: '이 감축은 코칭 때문인가 유가 때문인가',
    qOf: (t) => `${t.label}의 감축은 코칭 때문인가 유가 때문인가`,
    targets: vehicleTargets,
    tag: '성과 귀속',
    keywords: ['감축', '코칭', '유가', '절감', '귀속', '기준선', '반사실'],
    run: runAttribution,
  },
]

/**
 * 자유 입력 라우팅 — 키워드 점수로 토픽을 고른다.
 * LLM 없이도 동작하는 결정적 경로다. 시연 중 네트워크가 죽어도 답이 나와야 하기 때문이다.
 */
export function routeQuestion(text: string): QaTopic | null {
  const t = text.trim()
  if (!t) return null
  let best: { topic: QaTopic; score: number } | null = null
  for (const topic of QA_TOPICS) {
    let score = 0
    for (const k of topic.keywords) if (t.includes(k)) score += k.length
    if (t.includes(topic.q.slice(0, 8))) score += 20
    if (score > 0 && (!best || score > best.score)) best = { topic, score }
  }
  return best?.topic ?? null
}

/** 라우팅 + 실행. 못 알아들으면 null — 지어내지 않고 «답할 수 없다»로 넘긴다 */
export function answerQuestion(s: SimSnapshot, text: string, targetId?: string): QaResult | null {
  const topic = routeQuestion(text)
  return topic ? topic.run(s, targetId) : null
}

/** 후속 질문처럼 «어느 토픽인지 이미 아는» 경우 — 키워드 라우팅을 거치지 않는다 */
export function runTopic(s: SimSnapshot, topicId: string, targetId?: string): QaResult | null {
  const t = QA_TOPICS.find((x) => x.id === topicId)
  return t ? t.run(s, targetId) : null
}

/** 답할 수 없는 질문에 붙일 안내 — 무엇이 있으면 답할 수 있는지까지 말한다 */
export const UNANSWERABLE = {
  headline: '이 질문은 지금 데이터로 답할 수 없습니다',
  detail:
    '지어내는 대신 무엇이 필요한지 말씀드립니다. 아래 네 질문은 지금 연결된 1차 데이터(DTG·OBD·RTK·BIS + 차고지 축)만으로 실제 계산해 답합니다. ' +
    '그 밖의 축(교통카드 정산 AFC·승객계수 APC·신호 ITS 등)은 연결 대기 상태이며, 붙는 즉시 같은 방식으로 답할 수 있습니다.',
}
