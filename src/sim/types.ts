/**
 * 공단(한국교통안전공단) SDK 패킷 스키마를 따르는 데이터 타입.
 * 시뮬레이터가 이 스키마로 데이터를 생성하므로, 실제 DTG 단말 연동 시
 * PacketSource 구현체만 교체하면 나머지 코드는 그대로 동작한다.
 */

/** 위험운전 8종 (409 패킷) */
export type RiskEventType =
  | '급가속'
  | '급출발'
  | '급감속'
  | '급정지'
  | '급진로변경'
  | '급앞지르기'
  | '급좌우회전'
  | '급유턴'

export const RISK_EVENT_TYPES: RiskEventType[] = [
  '급가속',
  '급출발',
  '급감속',
  '급정지',
  '급진로변경',
  '급앞지르기',
  '급좌우회전',
  '급유턴',
]

/** 위험운전 이벤트 — 공단 409 패킷 상당 */
export interface Packet409 {
  packetType: 409
  vehicleId: string
  eventType: RiskEventType
  lat: number
  lng: number
  speedKmh: number // 차량속도 (GPS 아님 — 내부 차량속도 기반)
  rpm: number
  simTime: number // 시뮬레이션 시각 (초)
  /** 발생 시점의 노선명 — 사후 조회 시 차량의 «현재» 노선이 아니라 그때의 노선을 답하기 위해 박아 둔다 */
  routeName: string
  /** 발생 지점 — 좌표가 아니라 «정류장과 정류장 사이»로. 사람이 읽고 현장을 찾을 수 있어야 한다 */
  segment: string
  /** 그 구간이 타는 도로 */
  road: string
  /** 발생 시점의 날씨 — 스냅샷은 현재 날씨만 들고 있어, 이벤트에 새기지 않으면 과거 이벤트의 맥락을 잃는다 */
  weather: WeatherCondition
  /** 맥락 융합 판정: 방어적 조작으로 인정되어 감점 면제 */
  justified?: boolean
  justifyReason?: string
}

/** 기사 소명 — 급조작 직후 음성/버튼으로 즉시 기록 */
export interface Plea {
  id: number
  vehicleId: string
  driverName: string
  eventType: RiskEventType
  note: string
  method: '음성' | '버튼'
  simTime: number
  status: '접수' | '인정'
}

/**
 * 운행유형 — 「이 주행은 영업인가 공차인가」에 답하는 축.
 * 영업 = 승객을 태우는 인가노선 주행 / 공차 = 차고지 출입고·회송 (수입 없는 주행)
 */
export type TripKind = '영업' | '공차'

/** 노선 방향 — 왕복 노선은 상·하행, 순환 노선은 순환 하나뿐 */
export type TripDirection = '상행' | '하행' | '순환' | '회송'

/**
 * 운행기록 요약 — 공단 521 패킷 상당.
 * 뒤쪽 6개 필드가 「1회 운행」 온톨로지의 나머지 항목(회사·차고지·방향·순번·유형)이다.
 * 이것이 없으면 거리·연료는 있어도 «무엇에 관한 주행인가»를 답할 수 없다.
 */
export interface Packet521 {
  packetType: 521
  vehicleId: string
  routeName: string
  startSimTime: number
  endSimTime: number
  distanceKm: number
  fuelM3: number // CNG 소모량
  co2Kg: number
  /** 운행유형 — 영업 / 공차 */
  kind: TripKind
  /** 노선 방향 */
  direction: TripDirection
  /** 그날 이 차량의 운행 순번 (1부터, 공차 포함) */
  seq: number
  /** 소속 차고지 */
  depot: string
  /** 운수회사 */
  company: string
}

export type DriverPersonaId = 'A' | 'B' | 'C'

export interface DriverPersona {
  id: DriverPersonaId
  label: string
  /** 분당 위험운전 이벤트 발생 기대치 */
  eventRatePerMin: number
  /** 연비 페널티 계수 (0 = 이상적) */
  fuelPenalty: number
  cruiseKmh: number
}

export interface VehicleFault {
  vehicleId: string
  kind: '냉각수온 이상' | '브레이크 패드 마모'
  startedAt: number
  coolantTemp: number
  predicted: boolean // 예측 알림 발화 여부
  history: { t: number; temp: number }[]
}

/** 앞차·뒤차 배차 간격 (같은 노선·같은 방향 기준) */
export interface Headway {
  frontId: string | null // 앞차 차량번호
  frontGapMin: number // 앞차와의 간격(분)
  rearId: string | null // 뒤차 차량번호
  rearGapMin: number // 뒤차와의 간격(분)
  idealMin: number // 이상 배차 간격(분)
  /** normal=정상, bunching=앞차 근접(몰림), gap=뒤차 벌어짐 */
  status: 'normal' | 'bunching' | 'gap'
  peers: number // 같은 방향 운행 대수
}

export interface VehicleState {
  id: string // 차량번호 e.g. 대구70자3742
  routeId: string
  driverName: string
  persona: DriverPersonaId
  lat: number
  lng: number
  headingDeg: number
  speedKmh: number
  rpm: number
  /** 노선 폴리라인 상 진행 거리 (m) */
  odoOnRoute: number
  /** 진행 방향 (왕복 노선용) */
  dir: 1 | -1
  /** 재차율 0~1 (APC 승객계수 상당) */
  occupancy: number
  /** 다음 정류장 이름 · 잔여거리(m) — 인포테인먼트 표출용 */
  nextStopName: string
  nextStopDistM: number
  /** 하차벨 (승객 앱 → 기사 태블릿 연동) */
  bellPressed: boolean
  /** 방어운전 크레딧 (정당 판정·소명 인정 누적) */
  defenseCredits: number
  distanceKm: number
  fuelM3: number
  co2Kg: number
  /** 코칭 미적용 가정 시의 기준선 연료 */
  baselineFuelM3: number
  score: number // 운전점수 0~100
  eventCounts: Record<RiskEventType, number>
  dwellRemaining: number // 정류장 정차 잔여 (s)
  etasSubmitted: boolean
  lastEvent?: Packet409
  /** 마지막 이벤트의 실제 시각(ms) — 배속과 무관한 UI 경고 표시용 */
  lastEventWall?: number
  /** 앞차·뒤차 배차 간격 (buildSnapshot에서 계산) */
  headway?: Headway
  /** 경제운전(관성주행) 점수 0~100 — 감속 시 조기에 발을 떼는 정도 */
  ecoScore: number
  /** 오늘 연료 낭비 요인별 누적(m³) — 기준선 대비, 코칭으로 줄일 수 있는 부분 */
  fuelWaste: { idle: number; harsh: number; habit: number; ac: number }
}

/** 민원 증빙 자동매칭 결과 (Agentic — 조사 에이전트) */
export interface ComplaintEvidence {
  vehicleId: string
  driverName: string
  /** AI 판단: 민원 사실 가능성 (%) */
  aiScore: number
  timeline: { label: string; detail: string; warn?: boolean }[]
  draftReply: string
}

export interface Complaint {
  id: number
  simTime: number
  text: string
  routeId: string
  status: '접수' | '원인식별' | '조치중' | '해결'
  evidence?: ComplaintEvidence
}

/** 돌발정보 — 사고·고장·공사·기타 인시던트 (발생→처리중→완료 라이프사이클) */
export interface Incident {
  id: number
  kind: '사고' | '고장' | '공사' | '기타'
  title: string
  lat?: number
  lng?: number
  status: '발생' | '처리중' | '완료'
  createdAt: number
}

/** 하차 예약 — 승객이 목적지를 지정하면 도착 전 하차벨 자동 전달 */
export interface AlightReservation {
  vehicleId: string
  stopName: string
  /** true = 하차벨 자동 전달 (예약), false = 알람만 (직접 누름) */
  auto: boolean
}

/** 배차간격(버스 몰림) 권고 — 승인 기반 실행 */
export interface DispatchRecommendation {
  id: number
  routeId: string
  vehicleId: string
  action: string
  reason: string
  effect: string
  status: '대기' | '승인됨' | '실행완료'
  createdAt: number
}

/** 예지정비 작업지시 초안 — 승인 기반 실행 */
export interface WorkOrder {
  id: number
  vehicleId: string
  kind: string
  items: string[]
  estHours: number
  status: '초안' | '발행됨'
  createdAt: number
}

/** 날씨/행사/재난 — 1차 데이터의 외부 컨텍스트 축 */
export type WeatherCondition = '맑음' | '폭우' | '폭염'

export interface WeatherState {
  condition: WeatherCondition
  tempC: number
  rainMm: number
  /** AI 수요·지연 예측 (조건 변화 시 갱신) */
  delayForecastMin: number
  demandDeltaPct: number
}

export interface SimSnapshot {
  simTime: number // 초
  running: boolean
  speedMultiplier: number
  weather: WeatherState
  vehicles: VehicleState[]
  events: Packet409[] // 최근 이벤트 (최신 우선)
  /** 영업 운행만 — 기존 화면(운행 이력·연비·정산)이 그대로 쓰는 축이라 공차를 섞지 않는다 */
  trips: Packet521[]
  /** 공차 운행 (차고지 출고·회송) — 영업과 분리 집계해야 공차율·차고지 배치 효율을 답할 수 있다 */
  deadheads: Packet521[]
  fault: VehicleFault | null
  complaints: Complaint[]
  recommendations: DispatchRecommendation[]
  workOrders: WorkOrder[]
  reservation: AlightReservation | null
  incidents: Incident[]
  pleas: Plea[]
  /** 오늘 누적 탑승객 (정류장 승차 집계) */
  passengers: number
  /** 평균 재차율 시계열 (30초 샘플, 혼잡 추이 차트용) */
  occHistory: { t: number; pct: number }[]
  kpi: {
    totalDistanceKm: number
    totalFuelM3: number
    totalCo2SavedKg: number
    fuelSavedPct: number
    totalEvents: number
    avgScore: number
  }
}

/**
 * 데이터 소스 추상화.
 * SimPacketSource(시뮬레이터) ↔ RealPacketSource(실단말 WebSocket) 교체 지점.
 */
export interface PacketSource {
  subscribe(listener: () => void): () => void
  getSnapshot(): SimSnapshot
}
