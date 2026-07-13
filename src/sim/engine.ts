import { haversine, indexPolyline, pointAt, type PolylineIndex } from './geo'
import { ROUTES, type BusRoute } from './routes'
import {
  RISK_EVENT_TYPES,
  type AlightReservation,
  type Complaint,
  type DispatchRecommendation,
  type Incident,
  type DriverPersona,
  type DriverPersonaId,
  type Packet409,
  type Packet521,
  type Plea,
  type RiskEventType,
  type SimSnapshot,
  type Headway,
  type VehicleFault,
  type VehicleState,
  type WeatherCondition,
  type WeatherState,
  type WorkOrder,
} from './types'

/* ── 상수: CNG 시내버스 근사 모델 ───────────────────────────── */
const FUEL_PER_KM = 0.52 // m³/km (이상 주행)
const CO2_PER_M3 = 2.2 // kg CO₂ / m³ CNG
const IDLE_FUEL_PER_S = 0.9 / 3600 // 공회전 m³/s
const DWELL_SEC = 18 // 정류장 정차
const STOP_APPROACH_M = 130

/** 코칭 미적용(기준선) 시 페르소나별 연료 페널티 — 절감률 산출용 */
const BASELINE_PENALTY: Record<DriverPersonaId, number> = { A: 0.05, B: 0.13, C: 0.24 }

export const PERSONAS: Record<DriverPersonaId, DriverPersona> = {
  A: { id: 'A', label: '모범', eventRatePerMin: 0.06, fuelPenalty: 0.02, cruiseKmh: 42 },
  B: { id: 'B', label: '평균', eventRatePerMin: 0.28, fuelPenalty: 0.07, cruiseKmh: 46 },
  C: { id: 'C', label: '개선필요', eventRatePerMin: 0.95, fuelPenalty: 0.16, cruiseKmh: 52 },
}

const EVENT_SCORE: Record<RiskEventType, number> = {
  급가속: 1.5,
  급출발: 1.5,
  급감속: 2.0,
  급정지: 2.2,
  급진로변경: 1.8,
  급앞지르기: 2.4,
  급좌우회전: 1.2,
  급유턴: 2.6,
}

/** 도심(순환2 구간) 이벤트 유형 가중 — 급감속·급정지가 몰리게 */
const EVENT_WEIGHTS: [RiskEventType, number][] = [
  ['급가속', 22],
  ['급출발', 14],
  ['급감속', 26],
  ['급정지', 14],
  ['급진로변경', 10],
  ['급앞지르기', 4],
  ['급좌우회전', 8],
  ['급유턴', 2],
]

interface FleetSeed {
  id: string
  routeId: string
  driverName: string
  persona: DriverPersonaId
  offsetFrac: number // 노선 상 초기 위치
}

const FLEET: FleetSeed[] = [
  { id: '대구70자3742', routeId: 'R1', driverName: '김성호', persona: 'C', offsetFrac: 0.1 },
  { id: '대구70자1205', routeId: 'R1', driverName: '이재만', persona: 'B', offsetFrac: 0.45 },
  { id: '대구70자2318', routeId: 'R1', driverName: '박정우', persona: 'A', offsetFrac: 0.8 },
  { id: '대구70자4451', routeId: 'R2', driverName: '최동혁', persona: 'B', offsetFrac: 0.05 },
  { id: '대구70자0917', routeId: 'R2', driverName: '정수만', persona: 'A', offsetFrac: 0.38 },
  { id: '대구70자5563', routeId: 'R2', driverName: '강민재', persona: 'C', offsetFrac: 0.7 },
  { id: '대구70자3108', routeId: 'R3', driverName: '오세영', persona: 'B', offsetFrac: 0.15 },
  { id: '대구70자7724', routeId: 'R3', driverName: '한지훈', persona: 'A', offsetFrac: 0.5 },
  { id: '대구70자6690', routeId: 'R3', driverName: '문병철', persona: 'B', offsetFrac: 0.85 },
]

/** 데모 주인공 차량 (기사 앱 · 고장 시나리오 대상) */
export const DEMO_VEHICLE_ID = '대구70자3742'

interface VehicleInternal extends VehicleState {
  targetSpeed: number
  nextStopM: number
  tripStartTime: number
  tripStartDist: number
  eventCooldown: number
  /** 승인된 배차 권고로 다음 정류장에서 추가 대기할 시간 (s) */
  pendingHoldSec: number
}

type Listener = () => void

export class SimEngine {
  private routes = new Map<string, { route: BusRoute; idx: PolylineIndex; stopDists: number[] }>()
  private vehicles: VehicleInternal[] = []
  private events: Packet409[] = []
  private trips: Packet521[] = []
  private complaints: Complaint[] = []
  private fault: VehicleFault | null = null
  private complaintSeq = 1
  private recommendations: DispatchRecommendation[] = []
  private workOrders: WorkOrder[] = []
  private recoSeq = 1
  private woSeq = 1
  private bunchingTimer = 0
  private weather: WeatherState = { condition: '맑음', tempC: 24, rainMm: 0, delayForecastMin: 0, demandDeltaPct: 0 }
  private reservation: AlightReservation | null = null
  private totalBoardings = 0
  private occHistory: { t: number; pct: number }[] = []
  private occSampleTimer = 0
  private incidents: Incident[] = [
    // 상시 진행 중인 도로 공사 1건 (달구벌대로 두류 인근)
    { id: 1, kind: '공사', title: '달구벌대로 상수도 공사 — 1개 차로 통제', lat: 35.8562, lng: 128.5655, status: '처리중', createdAt: 0 },
  ]
  private incidentSeq = 2
  private pleas: Plea[] = []
  private pleaSeq = 1

  simTime = 0
  running = true
  speedMultiplier = 5

  private listeners = new Set<Listener>()
  private snapshot: SimSnapshot
  private timer: ReturnType<typeof setInterval> | null = null

  constructor() {
    for (const route of ROUTES) {
      const idx = indexPolyline(route.points)
      const stopDists = route.stops.map((s) => s.at * idx.totalM)
      this.routes.set(route.id, { route, idx, stopDists })
    }
    this.vehicles = FLEET.map((seed) => this.spawnVehicle(seed))
    this.snapshot = this.buildSnapshot()
  }

  /* ── 라이프사이클 ─────────────────────────────────────────── */

  start() {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (!this.running) return
      const dtSim = 0.25 * this.speedMultiplier
      // 1초 단위 서브스텝으로 물리 안정성 유지
      let remaining = dtSim
      while (remaining > 0) {
        const dt = Math.min(1, remaining)
        this.step(dt)
        remaining -= dt
      }
      this.emit()
    }, 250)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /* ── 외부 컨트롤 (데모 프리젠터용) ───────────────────────── */

  setSpeed(mult: number) {
    this.speedMultiplier = mult
    this.emit()
  }

  togglePause() {
    this.running = !this.running
    this.emit()
  }

  /** 데모 트리거: 날씨 전환 (맑음 → 폭우 → 폭염 → 맑음) — 기상특보 인시던트 연동 */
  cycleWeather() {
    const next: Record<WeatherCondition, WeatherState> = {
      맑음: { condition: '폭우', tempC: 21, rainMm: 14, delayForecastMin: 6, demandDeltaPct: -8 },
      폭우: { condition: '폭염', tempC: 36, rainMm: 0, delayForecastMin: 2, demandDeltaPct: 5 },
      폭염: { condition: '맑음', tempC: 24, rainMm: 0, delayForecastMin: 0, demandDeltaPct: 0 },
    }
    this.weather = next[this.weather.condition]
    const active = this.incidents.find((i) => i.kind === '기타' && i.status !== '완료')
    if (this.weather.condition !== '맑음' && !active) {
      this.incidents.unshift({
        id: this.incidentSeq++,
        kind: '기타',
        title: `${this.weather.condition === '폭우' ? '호우' : '폭염'} 특보 — 전 노선 ${this.weather.condition === '폭우' ? '감속 운행' : '냉방 강화'}`,
        status: '발생',
        createdAt: this.simTime,
      })
    } else if (this.weather.condition === '맑음' && active) {
      active.status = '완료'
    }
    this.emit()
  }

  /** 데모 트리거: 접촉사고 발생 (주인공 차량 현재 위치) — 발생→처리중→완료 자동 전이 */
  triggerAccident() {
    const v = this.vehicles.find((x) => x.id === DEMO_VEHICLE_ID)!
    this.incidents.unshift({
      id: this.incidentSeq++,
      kind: '사고',
      title: `급행1 ${v.nextStopName} 인근 접촉사고 — 승객 부상 없음`,
      lat: v.lat,
      lng: v.lng,
      status: '발생',
      createdAt: this.simTime,
    })
    if (this.incidents.length > 12) this.incidents.pop()
    this.emit()
  }

  /** 데모 트리거: 주인공 차량에 위험운전 이벤트 강제 발생 */
  triggerRiskEvent(type: RiskEventType = '급감속') {
    const v = this.vehicles.find((x) => x.id === DEMO_VEHICLE_ID)
    if (v) this.fireEvent(v, type)
    this.emit()
  }

  /** 데모 트리거: 냉각수온 고장 예측 시나리오 시작 (재시연 가능 — 기존 시나리오 초기화 후 재시작) */
  triggerFault() {
    this.workOrders = this.workOrders.filter((w) => w.vehicleId !== DEMO_VEHICLE_ID)
    this.fault = {
      vehicleId: DEMO_VEHICLE_ID,
      kind: '냉각수온 이상',
      startedAt: this.simTime,
      coolantTemp: 88,
      predicted: false,
      history: [{ t: this.simTime, temp: 88 }],
    }
    this.emit()
  }

  /** 데모 트리거: 민원 접수 (민원 → 데이터로 원인 식별 스토리) */
  fileComplaint() {
    this.complaints.unshift({
      id: this.complaintSeq++,
      simTime: this.simTime,
      text: '급행1 버스가 급정거가 너무 심합니다. 손잡이를 놓쳤으면 넘어질 뻔했어요.',
      routeId: 'R1',
      status: '접수',
    })
    this.emit()
  }

  advanceComplaint(id: number) {
    const c = this.complaints.find((x) => x.id === id)
    if (!c) return
    const order: Complaint['status'][] = ['접수', '원인식별', '조치중', '해결']
    const i = order.indexOf(c.status)
    if (i < order.length - 1) c.status = order[i + 1]
    // 접수 → 원인식별: 조사 에이전트가 증빙 자동매칭 (Agentic 파이프라인)
    if (c.status === '원인식별' && !c.evidence) {
      const v = this.vehicles.find((x) => x.id === DEMO_VEHICLE_ID)!
      const harshCount = v.eventCounts['급감속'] + v.eventCounts['급정지']
      c.evidence = {
        vehicleId: v.id,
        driverName: v.driverName,
        aiScore: Math.min(94, 62 + harshCount * 4),
        timeline: [
          { label: 'GPS 궤적 매칭', detail: '민원 시각 ±10분, 반월당~범어 구간 접근 차량 1대 식별' },
          { label: '차량속도 확인', detail: `구간 진입속도 ${Math.max(28, Math.round(v.speedKmh))}km/h → 급제동 패턴` },
          { label: 'DTG 409 패킷', detail: `급감속 ${v.eventCounts['급감속']}건 · 급정지 ${v.eventCounts['급정지']}건 검출`, warn: true },
          { label: '문 개폐 로그', detail: '정류장 정차 11초 — 무정차 아님 확인' },
          { label: 'DVR 클립 추출', detail: '이벤트 전후 20초 (전방/내부) 자동 보관' },
        ],
        draftReply:
          '불편을 드려 죄송합니다. 확인 결과 해당 시간대 급제동 이력이 확인되어, 당사는 해당 운전원에게 실시간 코칭 및 안전교육을 실시하였습니다. 동일 구간 재발 여부를 4주간 모니터링하겠습니다.',
      }
    }
    this.emit()
  }

  /* ── Agentic: 배차간격(버스 몰림) 권고 ─────────────────────── */

  /** 데모 트리거: 현재 지오메트리 기준 배차 권고 강제 생성. 이미 대기 중이면 'pending' 반환 */
  forceRecommendation(): 'created' | 'pending' {
    if (this.recommendations.some((r) => r.status !== '실행완료')) return 'pending'
    this.createBunchingRecommendation(true)
    this.emit()
    return 'created'
  }

  approveRecommendation(id: number) {
    const r = this.recommendations.find((x) => x.id === id)
    if (!r || r.status !== '대기') return
    r.status = '승인됨'
    const v = this.vehicles.find((x) => x.id === r.vehicleId)
    if (v) v.pendingHoldSec = 70
    this.emit()
  }

  private createBunchingRecommendation(force = false) {
    // 순환2(R2) 폐곡선 기준 배차간격 분석
    if (this.recommendations.some((r) => r.status !== '실행완료')) return
    const ctx = this.routes.get('R2')!
    const total = ctx.idx.totalM
    const buses = this.vehicles.filter((v) => v.routeId === 'R2').sort((a, b) => a.odoOnRoute - b.odoOnRoute)
    if (buses.length < 2) return
    const AVG_M_PER_MIN = 416 // 25km/h
    const gaps = buses.map((v, i) => {
      const next = buses[(i + 1) % buses.length]
      const gapM = ((next.odoOnRoute - v.odoOnRoute) % total + total) % total
      return { v, frontGapMin: gapM / AVG_M_PER_MIN }
    })
    const ideal = total / buses.length / AVG_M_PER_MIN
    const tight = gaps.reduce((a, b) => (a.frontGapMin < b.frontGapMin ? a : b))
    const wide = gaps.reduce((a, b) => (a.frontGapMin > b.frontGapMin ? a : b))
    if (!force && !(tight.frontGapMin < 0.45 * ideal && wide.frontGapMin > 1.5 * ideal)) return
    const f = (n: number) => Math.max(1, Math.round(n))
    this.recommendations.unshift({
      id: this.recoSeq++,
      routeId: 'R2',
      vehicleId: tight.v.id,
      action: '다음 정류장에서 70초 대기',
      reason: `앞차 간격 ${f(tight.frontGapMin)}분 / 뒷차 간격 ${f(wide.frontGapMin)}분 · 다음 2개 정류장 승차수요 낮음`,
      effect: `배차간격 ${f(wide.frontGapMin)}분 → ${f((wide.frontGapMin + tight.frontGapMin) / 2 + 1)}분 완화 기대`,
      status: '대기',
      createdAt: this.simTime,
    })
    if (this.recommendations.length > 8) this.recommendations.pop()
  }

  /* ── 시뮬레이션 스텝 ─────────────────────────────────────── */

  approveWorkOrder(id: number) {
    const w = this.workOrders.find((x) => x.id === id)
    if (w) {
      w.status = '발행됨'
      // 고장 인시던트 → 처리중 전환
      const inc = this.incidents.find((i) => i.kind === '고장' && i.status === '발생')
      if (inc) inc.status = '처리중'
    }
    this.emit()
  }

  /** 기사 소명 — 급조작 직후 음성/버튼으로 즉시 기록 (마지막 이벤트에 귀속) */
  submitPlea(vehicleId: string, note: string, method: '음성' | '버튼') {
    const v = this.vehicles.find((x) => x.id === vehicleId)
    if (!v || !v.lastEvent || v.lastEvent.justified) return
    this.pleas.unshift({
      id: this.pleaSeq++,
      vehicleId,
      driverName: v.driverName,
      eventType: v.lastEvent.eventType,
      note: note.trim() || '(내용 없음)',
      method,
      simTime: v.lastEvent.simTime,
      status: '접수',
    })
    if (this.pleas.length > 20) this.pleas.pop()
    this.emit()
  }

  /** 관제 검토: 소명 인정 → 감점 복원 + 방어 크레딧 (불이익 확정은 사람이, 구제는 즉시) */
  acknowledgePlea(id: number) {
    const p = this.pleas.find((x) => x.id === id)
    if (!p || p.status === '인정') return
    p.status = '인정'
    const v = this.vehicles.find((x) => x.id === p.vehicleId)
    if (v) {
      v.score = Math.min(100, v.score + EVENT_SCORE[p.eventType])
      v.eventCounts[p.eventType] = Math.max(0, v.eventCounts[p.eventType] - 1)
      v.defenseCredits++
    }
    const ev = this.events.find((e) => e.vehicleId === p.vehicleId && e.simTime === p.simTime)
    if (ev) {
      ev.justified = true
      ev.justifyReason = '기사 소명 인정'
    }
    this.emit()
  }

  /** 승객 앱 하차벨 → 기사 태블릿에 즉시 표시 */
  pressBell(vehicleId: string) {
    const v = this.vehicles.find((x) => x.id === vehicleId)
    if (v) v.bellPressed = true
    this.emit()
  }

  /** 하차 예약 — 목적지 접근 시 하차벨 자동 전달 (auto=false면 알람만) */
  setReservation(vehicleId: string, stopName: string, auto: boolean) {
    this.reservation = { vehicleId, stopName, auto }
    this.emit()
  }

  cancelReservation() {
    this.reservation = null
    this.emit()
  }

  /* ── 시뮬레이션 스텝 ─────────────────────────────────────── */

  private step(dt: number) {
    this.simTime += dt
    for (const v of this.vehicles) this.stepVehicle(v, dt)
    this.stepFault(dt)
    // 주기적 배차간격 점검 (20초마다)
    this.bunchingTimer += dt
    if (this.bunchingTimer >= 20) {
      this.bunchingTimer = 0
      this.createBunchingRecommendation()
    }
    // 혼잡 추이 샘플 (30초마다 평균 재차율)
    this.occSampleTimer += dt
    if (this.occSampleTimer >= 30) {
      this.occSampleTimer = 0
      const avg = this.vehicles.reduce((s, v) => s + v.occupancy, 0) / this.vehicles.length
      this.occHistory.push({ t: this.simTime, pct: Math.round(avg * 100) })
      if (this.occHistory.length > 120) this.occHistory.shift()
    }
    // 사고 인시던트 자동 전이 (발생 90초 후 처리중, 6분 후 완료)
    for (const inc of this.incidents) {
      if (inc.kind !== '사고' || inc.status === '완료') continue
      const age = this.simTime - inc.createdAt
      if (inc.status === '발생' && age > 90) inc.status = '처리중'
      else if (inc.status === '처리중' && age > 360) inc.status = '완료'
    }
  }

  private stepVehicle(v: VehicleInternal, dt: number) {
    const ctx = this.routes.get(v.routeId)!
    const persona = PERSONAS[v.persona]

    // 정류장 정차 중
    if (v.dwellRemaining > 0) {
      v.dwellRemaining -= dt
      v.speedKmh = 0
      v.rpm = 650
      v.fuelM3 += IDLE_FUEL_PER_S * dt
      v.baselineFuelM3 += IDLE_FUEL_PER_S * dt * (1 + BASELINE_PENALTY[v.persona] * 0.3)
      // 공회전 낭비: 정차 연료의 일부는 불필요 공회전으로 간주 (엔진 정지 미실시분)
      v.fuelWaste.idle += IDLE_FUEL_PER_S * dt * 0.4
      if (v.dwellRemaining <= 0) {
        v.bellPressed = false // 정류장 출발 시 하차벨 해제
        // 예약된 하차 정류장에서 출발 → 예약 완료 처리
        if (this.reservation && this.reservation.vehicleId === v.id && v.nextStopName === this.reservation.stopName) {
          this.reservation = null
        }
        v.nextStopM = this.findNextStop(v, ctx.stopDists, ctx.idx.totalM)
      }
      return
    }

    // 목표속도: 순항 ± 요동, 정류장 접근 시 감속, 날씨 영향(폭우 감속)
    const weatherSpeed = this.weather.condition === '폭우' ? 0.8 : this.weather.condition === '폭염' ? 0.96 : 1
    const distToStop = this.distToNextStop(v, ctx.idx.totalM)
    let target = persona.cruiseKmh * weatherSpeed * (0.9 + 0.2 * Math.sin(this.simTime / 23 + v.odoOnRoute / 900))
    if (distToStop < STOP_APPROACH_M) {
      target = Math.max(8, (distToStop / STOP_APPROACH_M) * persona.cruiseKmh)
    }

    // 경제운전(관성주행) 점수: 정류장 접근 감속 구간에서 조기에 발을 떼면 가점
    // 페르소나별 목표치로 수렴 (A 모범 ~94, B ~78, C ~62) + 미세 변동
    const ecoTarget = v.persona === 'A' ? 94 : v.persona === 'B' ? 78 : 62
    if (distToStop < STOP_APPROACH_M && v.speedKmh > 12) {
      const coasting = target < v.speedKmh // 감속 국면
      v.ecoScore += ((coasting ? ecoTarget + 4 : ecoTarget - 8) - v.ecoScore) * 0.02 * dt
    } else {
      v.ecoScore += (ecoTarget - v.ecoScore) * 0.01 * dt
    }
    v.ecoScore = Math.max(30, Math.min(100, v.ecoScore))

    // 가감속 (모범기사일수록 부드럽게)
    const accelLimit = v.persona === 'C' ? 2.6 : v.persona === 'B' ? 1.8 : 1.3 // m/s²
    const diff = target - v.speedKmh
    const maxDelta = accelLimit * dt * 3.6
    v.speedKmh += Math.max(-maxDelta, Math.min(maxDelta, diff))
    v.speedKmh = Math.max(0, v.speedKmh)
    v.rpm = Math.round(620 + v.speedKmh * 28 + Math.random() * 60)

    // 이동
    const dM = (v.speedKmh / 3.6) * dt
    v.odoOnRoute += dM * v.dir
    v.distanceKm += dM / 1000

    // 연료: 실제(코칭 적용) vs 기준선(미적용) · 폭염 시 냉방부하 가산 + 낭비 요인 분해
    const acLoad = this.weather.condition === '폭염' ? 1.08 : 1
    const idealFuel = (dM / 1000) * FUEL_PER_KM // 이상(습관·냉방 0) 최소 연료
    const fuel = idealFuel * (1 + persona.fuelPenalty) * acLoad
    v.fuelM3 += fuel
    v.baselineFuelM3 += (dM / 1000) * FUEL_PER_KM * (1 + BASELINE_PENALTY[v.persona]) * acLoad
    v.co2Kg = v.fuelM3 * CO2_PER_M3
    // 낭비 분해: 운전습관(급가감속 페널티) · 냉방부하
    v.fuelWaste.habit += idealFuel * persona.fuelPenalty
    v.fuelWaste.ac += idealFuel * (1 + persona.fuelPenalty) * (acLoad - 1)

    // 노선 끝 처리 (순환선은 랩, 왕복선은 방향 전환) → 521 운행기록 제출
    if (v.odoOnRoute >= ctx.idx.totalM || v.odoOnRoute <= 0) {
      this.completeTrip(v, ctx.route)
      if (ctx.route.loop) {
        v.odoOnRoute = v.odoOnRoute >= ctx.idx.totalM ? 0 : ctx.idx.totalM
      } else {
        v.dir = (v.dir * -1) as 1 | -1
        v.odoOnRoute = Math.max(0, Math.min(v.odoOnRoute, ctx.idx.totalM))
      }
      v.nextStopM = this.findNextStop(v, ctx.stopDists, ctx.idx.totalM)
    }

    // 정류장 도착 판정
    if (this.distToNextStop(v, ctx.idx.totalM) < 6 && v.speedKmh < 12) {
      v.dwellRemaining = DWELL_SEC * (0.7 + Math.random() * 0.6)
      // 승인된 배차 권고 실행 (추가 대기)
      if (v.pendingHoldSec > 0) {
        v.dwellRemaining += v.pendingHoldSec
        v.pendingHoldSec = 0
        const r = this.recommendations.find((x) => x.vehicleId === v.id && x.status === '승인됨')
        if (r) r.status = '실행완료'
      }
      // 승하차 — 재차율 변동 (APC 상당) + 탑승객 집계 (CNG 시내버스 정원 ~45명 기준)
      const occBefore = v.occupancy
      v.occupancy = Math.min(0.95, Math.max(0.08, v.occupancy + (Math.random() * 0.5 - 0.22)))
      this.totalBoardings += Math.max(1, Math.round(Math.max(0, v.occupancy - occBefore) * 45 + Math.random() * 5))
      v.speedKmh = 0
    }

    // 위치 갱신
    const { pos, heading } = pointAt(ctx.idx, v.odoOnRoute)
    v.lat = pos[0]
    v.lng = pos[1]
    v.headingDeg = heading

    // 다음 정류장 메타 (인포테인먼트 표출)
    v.nextStopDistM = Math.abs(v.nextStopM - v.odoOnRoute)
    v.nextStopName = this.stopNameAt(v.routeId, v.nextStopM)

    // 하차 예약: 목적지 접근 시 하차벨 자동 전달
    const res = this.reservation
    if (res && res.auto && res.vehicleId === v.id && !v.bellPressed && v.nextStopName === res.stopName && v.nextStopDistM < 350) {
      v.bellPressed = true
    }

    // 위험운전 이벤트 확률 발생 (폭우 시 위험 ↑)
    const weatherRisk = this.weather.condition === '폭우' ? 1.5 : 1
    v.eventCooldown = Math.max(0, v.eventCooldown - dt)
    if (v.eventCooldown === 0 && v.speedKmh > 15) {
      const p = (persona.eventRatePerMin / 60) * dt * weatherRisk
      if (Math.random() < p) {
        const type = weightedPick()
        this.fireEvent(v, type)
        v.eventCooldown = 20
      }
    }

    // 무사고 주행 시 점수 회복 (이벤트 1건 감점을 약 2~3분 무사고 주행으로 상쇄)
    v.score = Math.min(100, v.score + 0.015 * dt)
  }

  /**
   * 맥락 융합 정당성 판정 — 사고 회피 등 방어적 급조작은 감점하지 않는다.
   * 판정 근거: ①돌발(사고·공사) 반경 ②폭우 감속 ③정류장 접근 감속 ④군집(동일 구간 타 차량 이벤트)
   * 원칙: 면제는 자동으로 후하게, 감점 확정(불이익)은 사람 검토(소명함)로 보수적으로.
   */
  private justifyEvent(v: VehicleInternal, type: RiskEventType): string | null {
    const decel = type === '급감속' || type === '급정지' || type === '급진로변경'
    // ① 돌발 반경 300m — 사고·공사 지점 회피
    for (const inc of this.incidents) {
      if (inc.status !== '완료' && inc.lat != null && inc.lng != null) {
        if (haversine([v.lat, v.lng], [inc.lat, inc.lng]) < 300) return `${inc.kind} 지점 회피 기동`
      }
    }
    // ② 폭우 중 감속 계열 — 적절한 방어 대응
    if (decel && this.weather.condition === '폭우') return '폭우 노면 감속 대응'
    // ③ 정류장 접근 150m 내 감속 — 하차 대응
    if (decel && v.nextStopDistM < 150) return '정류장 접근 대응'
    // ④ 군집 — 최근 10분 내 같은 구간(250m)에서 타 차량도 급조작 (구간 환경 요인)
    const near = this.events.filter(
      (e) => e.vehicleId !== v.id && this.simTime - e.simTime < 600 && haversine([e.lat, e.lng], [v.lat, v.lng]) < 250,
    ).length
    if (near >= 2) return '위험구간 군집 반응 (환경 요인)'
    return null
  }

  private fireEvent(v: VehicleInternal, type: RiskEventType) {
    const reason = this.justifyEvent(v, type)
    const ev: Packet409 = {
      packetType: 409,
      vehicleId: v.id,
      eventType: type,
      lat: v.lat,
      lng: v.lng,
      speedKmh: Math.round(v.speedKmh),
      rpm: v.rpm,
      simTime: this.simTime,
      justified: reason != null,
      justifyReason: reason ?? undefined,
    }
    this.events.unshift(ev)
    if (this.events.length > 400) this.events.pop()
    if (reason) {
      // 정당 판정: 감점·위험운전 집계 면제 + 방어운전 크레딧
      v.defenseCredits++
    } else {
      v.eventCounts[type]++
      v.score = Math.max(40, v.score - EVENT_SCORE[type])
    }
    v.lastEvent = ev
    v.lastEventWall = Date.now()
    // 급조작은 연료도 소모 (전액 낭비 요인)
    v.fuelM3 += 0.012
    v.baselineFuelM3 += 0.012
    v.fuelWaste.harsh += 0.012
    // 속도 급변 연출
    if (type === '급감속' || type === '급정지') v.speedKmh = Math.max(0, v.speedKmh - 22)
    if (type === '급가속' || type === '급출발') v.speedKmh += 14
  }

  private completeTrip(v: VehicleInternal, route: BusRoute) {
    const dist = v.distanceKm - v.tripStartDist
    if (dist < 0.5) return
    this.trips.unshift({
      packetType: 521,
      vehicleId: v.id,
      routeName: route.name,
      startSimTime: v.tripStartTime,
      endSimTime: this.simTime,
      distanceKm: Math.round(dist * 10) / 10,
      fuelM3: Math.round(v.fuelM3 * 100) / 100,
      co2Kg: Math.round(v.fuelM3 * CO2_PER_M3 * 10) / 10,
    })
    if (this.trips.length > 60) this.trips.pop()
    v.tripStartTime = this.simTime
    v.tripStartDist = v.distanceKm
    v.etasSubmitted = true // eTAS 자동제출 완료
  }

  private stepFault(dt: number) {
    const f = this.fault
    if (!f || f.coolantTemp >= 112) return
    f.coolantTemp = Math.min(112, f.coolantTemp + (dt / 180) * 24) // 3분에 걸쳐 88→112
    if (this.simTime - (f.history[f.history.length - 1]?.t ?? 0) > 5) {
      f.history.push({ t: this.simTime, temp: Math.round(f.coolantTemp * 10) / 10 })
      if (f.history.length > 80) f.history.shift()
    }
    if (!f.predicted && f.coolantTemp >= 100) {
      f.predicted = true
      // 돌발정보: 고장 인시던트 발생 (해당 차량 현재 위치)
      const fv = this.vehicles.find((x) => x.id === f.vehicleId)
      this.incidents.unshift({
        id: this.incidentSeq++,
        kind: '고장',
        title: `${f.vehicleId.slice(-4)}호 ${f.kind} — 예방정비 예정`,
        lat: fv?.lat,
        lng: fv?.lng,
        status: '발생',
        createdAt: this.simTime,
      })
      // Agentic: 예지정비 에이전트가 작업지시 초안 자동 생성
      this.workOrders.unshift({
        id: this.woSeq++,
        vehicleId: f.vehicleId,
        kind: f.kind,
        items: ['냉각팬 작동 점검', '서모스탯 교체 검토', '냉각수 라인 누설 확인'],
        estHours: 1.5,
        status: '초안',
        createdAt: this.simTime,
      })
    }
  }

  /* ── 헬퍼 ─────────────────────────────────────────────────── */

  private spawnVehicle(seed: FleetSeed): VehicleInternal {
    const ctx = this.routes.get(seed.routeId)!
    const odo = seed.offsetFrac * ctx.idx.totalM
    const { pos, heading } = pointAt(ctx.idx, odo)
    const counts = {} as Record<RiskEventType, number>
    for (const t of RISK_EVENT_TYPES) counts[t] = 0
    const v: VehicleInternal = {
      id: seed.id,
      routeId: seed.routeId,
      driverName: seed.driverName,
      persona: seed.persona,
      lat: pos[0],
      lng: pos[1],
      headingDeg: heading,
      speedKmh: PERSONAS[seed.persona].cruiseKmh * 0.8,
      rpm: 1500,
      odoOnRoute: odo,
      distanceKm: 0,
      fuelM3: 0,
      co2Kg: 0,
      baselineFuelM3: 0,
      score: seed.persona === 'A' ? 96 : seed.persona === 'B' ? 88 : 74,
      eventCounts: counts,
      dwellRemaining: 0,
      etasSubmitted: false,
      dir: 1,
      occupancy: 0.25 + Math.random() * 0.35,
      nextStopName: '',
      nextStopDistM: 0,
      bellPressed: false,
      defenseCredits: 0,
      ecoScore: seed.persona === 'A' ? 92 : seed.persona === 'B' ? 76 : 60,
      fuelWaste: { idle: 0, harsh: 0, habit: 0, ac: 0 },
      targetSpeed: 0,
      nextStopM: 0,
      tripStartTime: 0,
      tripStartDist: 0,
      eventCooldown: 5,
      pendingHoldSec: 0,
    }
    v.nextStopM = this.findNextStop(v, ctx.stopDists, ctx.idx.totalM)
    return v
  }

  private findNextStop(v: VehicleInternal, stopDists: number[], totalM: number): number {
    if (v.dir === 1) {
      const next = stopDists.find((d) => d > v.odoOnRoute + 10)
      return next ?? totalM
    }
    const prev = [...stopDists].reverse().find((d) => d < v.odoOnRoute - 10)
    return prev ?? 0
  }

  private distToNextStop(v: VehicleInternal, _totalM: number): number {
    return Math.abs(v.nextStopM - v.odoOnRoute)
  }

  private stopNameAt(routeId: string, stopM: number): string {
    const ctx = this.routes.get(routeId)!
    const i = ctx.stopDists.findIndex((d) => Math.abs(d - stopM) < 2)
    return i >= 0 ? ctx.route.stops[i].name : ctx.route.stops[ctx.route.stops.length - 1].name
  }

  /* ── 스냅샷 / 구독 ────────────────────────────────────────── */

  /** 같은 노선·같은 방향 차량들의 앞차/뒤차 배차 간격 계산 */
  private computeHeadways(vehicles: VehicleState[]) {
    const AVG_M_PER_MIN = 416 // 25km/h
    // 노선+방향으로 그룹핑
    const groups = new Map<string, VehicleState[]>()
    for (const v of vehicles) {
      const ctx = this.routes.get(v.routeId)
      if (!ctx) continue
      const key = ctx.route.loop ? v.routeId : `${v.routeId}|${v.dir}`
      const g = groups.get(key)
      if (g) g.push(v)
      else groups.set(key, [v])
    }
    for (const [, group] of groups) {
      const first = group[0]
      const ctx = this.routes.get(first.routeId)!
      const total = ctx.idx.totalM
      const loop = ctx.route.loop
      // 진행 방향 기준 위치 (dir=-1이면 역순 진행이므로 반전)
      const prog = (v: VehicleState) => (loop || v.dir === 1 ? v.odoOnRoute : total - v.odoOnRoute)
      const sorted = [...group].sort((a, b) => prog(a) - prog(b))
      const n = sorted.length
      const idealMin = total / Math.max(1, n) / AVG_M_PER_MIN
      sorted.forEach((v, i) => {
        if (n < 2) {
          v.headway = { frontId: null, frontGapMin: 0, rearId: null, rearGapMin: 0, idealMin, status: 'normal', peers: n }
          return
        }
        // 앞차 = 진행 방향으로 다음 위치. 순환선은 wrap, 왕복선은 끝 차량이면 앞차 없음
        const frontIdx = loop ? (i + 1) % n : i + 1
        const rearIdx = loop ? (i - 1 + n) % n : i - 1
        const front = frontIdx < n ? sorted[frontIdx] : null
        const rear = rearIdx >= 0 ? sorted[rearIdx] : null
        const gapTo = (o: VehicleState | null) => {
          if (!o) return Infinity
          let d = prog(o) - prog(v)
          if (loop) d = ((d % total) + total) % total
          return Math.abs(d) / AVG_M_PER_MIN
        }
        const frontGapMin = gapTo(front)
        const rearGapMin = gapTo(rear)
        let status: Headway['status'] = 'normal'
        if (front && frontGapMin < idealMin * 0.5) status = 'bunching'
        else if (rear && rearGapMin > idealMin * 1.6 && rearGapMin !== Infinity) status = 'gap'
        v.headway = {
          frontId: front?.id ?? null,
          frontGapMin: frontGapMin === Infinity ? 0 : frontGapMin,
          rearId: rear?.id ?? null,
          rearGapMin: rearGapMin === Infinity ? 0 : rearGapMin,
          idealMin,
          status,
          peers: n,
        }
      })
    }
  }

  private buildSnapshot(): SimSnapshot {
    const vehicles = this.vehicles.map((v) => ({ ...v, eventCounts: { ...v.eventCounts } }))
    this.computeHeadways(vehicles)
    const totalFuel = vehicles.reduce((s, v) => s + v.fuelM3, 0)
    const totalBaseline = vehicles.reduce((s, v) => s + v.baselineFuelM3, 0)
    const totalDist = vehicles.reduce((s, v) => s + v.distanceKm, 0)
    const totalEvents = this.events.length
    const fuelSavedPct = totalBaseline > 0 ? ((totalBaseline - totalFuel) / totalBaseline) * 100 : 0
    return {
      simTime: this.simTime,
      running: this.running,
      speedMultiplier: this.speedMultiplier,
      weather: { ...this.weather },
      vehicles,
      events: [...this.events],
      trips: [...this.trips],
      fault: this.fault
        ? { ...this.fault, history: [...this.fault.history] }
        : null,
      complaints: this.complaints.map((c) => ({ ...c })),
      recommendations: this.recommendations.map((r) => ({ ...r })),
      workOrders: this.workOrders.map((w) => ({ ...w })),
      reservation: this.reservation ? { ...this.reservation } : null,
      incidents: this.incidents.map((i) => ({ ...i })),
      pleas: this.pleas.map((p) => ({ ...p })),
      passengers: this.totalBoardings,
      occHistory: [...this.occHistory],
      kpi: {
        totalDistanceKm: totalDist,
        totalFuelM3: totalFuel,
        totalCo2SavedKg: (totalBaseline - totalFuel) * CO2_PER_M3,
        fuelSavedPct,
        totalEvents,
        avgScore: vehicles.reduce((s, v) => s + v.score, 0) / vehicles.length,
      },
    }
  }

  private emit() {
    this.snapshot = this.buildSnapshot()
    for (const l of this.listeners) l()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SimSnapshot => this.snapshot
}

function weightedPick(): RiskEventType {
  const total = EVENT_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [type, w] of EVENT_WEIGHTS) {
    r -= w
    if (r <= 0) return type
  }
  return '급감속'
}
