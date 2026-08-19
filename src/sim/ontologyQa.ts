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

const src = (s: (typeof SRC)[keyof typeof SRC], role: string, live = true): QaSource => ({ ...s, role, live })

export type Evidence = {
  k: string
  v: string
  /** 이 값을 댄 원천 코드 — 화면에서 각주로 붙는다 */
  src?: string
}

export type QaResult = {
  id: string
  /** 질문 원문 */
  q: string
  /** 근거 사슬 — 순회한 클래스·관계 */
  path: string[]
  /** 이 답이 쓴 데이터 원천 */
  sources: QaSource[]
  /** 한 줄 답 */
  headline: string
  /** 풀어 쓴 답 */
  detail: string
  evidence: Evidence[]
  /** 예시 데이터·모델 한계 고지 */
  caveat?: string
  /** 아직 계산할 데이터가 없다 */
  empty?: boolean
}

export type QaTopic = {
  id: string
  /** 화면에 띄우는 대표 질문 (제안서 문구 그대로) */
  q: string
  /** 짧은 꼬리표 */
  tag: string
  /** 자유 입력 라우팅용 키워드 */
  keywords: string[]
  run: (s: SimSnapshot) => QaResult
}

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const short = (id: string) => id.slice(-4) + '호'
const km = (n: number) => `${n.toFixed(1)}km`

/** 영업·공차를 한 줄로 요약 — 여러 질문이 같은 형식을 쓴다 */
const tripLine = (t: Packet521) =>
  `${short(t.vehicleId)} ${mmss(t.startSimTime)}~${mmss(t.endSimTime)} ${t.routeName} ${t.direction} ${t.seq}회차`

/* ═══════════ ① 이 주행은 영업인가 공차인가 ═══════════ */

const runTripKind = (s: SimSnapshot): QaResult => {
  const id = 'tripKind'
  const q = '이 주행은 영업인가 공차인가'
  const path = ['운행(Trip)', '─운행유형→ 영업/공차', '─소속차고지→ 차고지(Depot)', '─운행노선→ 노선(Route)']
  const sources = [
    src(SRC.dtg521, '회차 구간의 거리·연료·시각'),
    src(SRC.depot, '운행유형(영업/공차)·소속 차고지', false),
    src(SRC.route, '인가노선·방향'),
  ]
  const latest = s.trips[0]
  const dh = s.deadheads
  if (!latest) {
    return {
      id, q, path, sources, empty: true,
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
  return {
    id, q, path, sources,
    headline: `${tripLine(latest)} — 영업`,
    detail:
      `이 기록은 인가노선 ${latest.routeName} ${latest.direction} 주행이므로 **영업**입니다. ` +
      `같은 차량은 ${latest.depot}(${latest.company}) 소속이고, 오늘 회송(공차) ${sameVehDh.length}건이 따로 기록돼 있습니다. ` +
      `거리·연료만 보면 둘은 구분되지 않습니다 — 운행유형을 운행 단위에 붙여 둬야 나오는 답입니다.`,
    evidence: [
      { k: '판정', v: `영업 (${latest.routeName} ${latest.direction})`, src: '차고지 출입고' },
      { k: '운행 순번', v: `${latest.seq}회차`, src: 'DTG 521' },
      { k: '소속', v: `${latest.depot} · ${latest.company}`, src: '차고지 출입고' },
      { k: '이 회차 실적', v: `${km(latest.distanceKm)} · ${latest.fuelM3.toFixed(2)}m³ · CO₂ ${latest.co2Kg.toFixed(1)}kg`, src: 'DTG 521' },
      { k: '오늘 전체', v: `영업 ${s.trips.length}회 ${km(revKm)} / 공차 ${dh.length}회 ${km(dhKm)}`, src: 'DTG 521' },
      { k: '공차 비율', v: `${dhPct.toFixed(1)}% (거리 기준)`, src: '차고지 출입고' },
    ],
  }
}

/* ═══════════ ② 이 급감속은 어떤 노선·날씨에서 났나 ═══════════ */

const runEventContext = (s: SimSnapshot): QaResult => {
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
    src(SRC.weather, '발생 시점 기상 맥락'),
    src(SRC.plea, '기사 상황 설명(있을 때)'),
  ]
  const decel = s.events.find((e) => e.eventType === '급감속' || e.eventType === '급정지') ?? s.events[0]
  if (!decel) {
    return {
      id, q, path, sources, empty: true,
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
    headline: `${mmss(decel.simTime)} ${short(decel.vehicleId)} ${decel.eventType} — ${decel.routeName} · ${decel.weather}`,
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
      { k: '발생 지점', v: `${decel.lat.toFixed(4)}, ${decel.lng.toFixed(4)}`, src: 'RTK' },
      { k: '판정', v: decel.justified ? `정당 — ${decel.justifyReason}` : '감점', src: '날씨·돌발' },
      { k: '상황 설명', v: plea ? `${plea.method} 접수 (${plea.status})` : '없음', src: '기사 소명' },
      { k: '같은 노선·같은 날씨', v: `${sameCtx}건 누적`, src: 'DTG 409' },
    ],
  }
}

/* ═══════════ ③ 이 차고지가 만든 공차는 얼마인가 ═══════════ */

const runDepotDeadhead = (s: SimSnapshot): QaResult => {
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
  const top = rows[0]
  if (!top || top.n === 0) {
    return {
      id, q, path, sources, empty: true,
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
    headline: `${top.depot} — 공차 ${km(top.km)} (${top.n}회, 연료 ${top.fuel.toFixed(1)}m³)`,
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

const runAttribution = (s: SimSnapshot): QaResult => {
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
  const base = s.vehicles.reduce((a, v) => a + v.baselineFuelM3, 0)
  const act = s.vehicles.reduce((a, v) => a + v.fuelM3, 0)
  if (base <= 0) {
    return {
      id, q, path, sources, empty: true,
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
    headline: `코칭 귀속 −${pct.toFixed(2)}% — 유가 효과 아님 (연료 «양»이 줄었음)`,
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
    tag: '운행유형',
    keywords: ['영업', '공차', '운행유형', '회송'],
    run: runTripKind,
  },
  {
    id: 'eventContext',
    q: '이 급감속은 어떤 노선·날씨에서 났나',
    tag: '맥락',
    keywords: ['급감속', '급정지', '위험운전', '날씨', '폭우', '맥락'],
    run: runEventContext,
  },
  {
    id: 'depotDeadhead',
    q: '이 차고지가 만든 공차는 얼마인가',
    tag: '차고지',
    keywords: ['차고지', '공차', '회송', '출고', '입고'],
    run: runDepotDeadhead,
  },
  {
    id: 'attribution',
    q: '이 감축은 코칭 때문인가 유가 때문인가',
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
export function answerQuestion(s: SimSnapshot, text: string): QaResult | null {
  const topic = routeQuestion(text)
  return topic ? topic.run(s) : null
}

/** 답할 수 없는 질문에 붙일 안내 — 무엇이 있으면 답할 수 있는지까지 말한다 */
export const UNANSWERABLE = {
  headline: '이 질문은 지금 데이터로 답할 수 없습니다',
  detail:
    '지어내는 대신 무엇이 필요한지 말씀드립니다. 아래 네 질문은 지금 연결된 1차 데이터(DTG·OBD·RTK·BIS + 차고지 축)만으로 실제 계산해 답합니다. ' +
    '그 밖의 축(교통카드 정산 AFC·승객계수 APC·신호 ITS 등)은 연결 대기 상태이며, 붙는 즉시 같은 방식으로 답할 수 있습니다.',
}
