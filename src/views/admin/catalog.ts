import { ROUTES } from '../../sim/routes'
import type { SimSnapshot } from '../../sim/types'

/**
 * 데이터 관리자 카탈로그 — 원천·스키마·품질룰·온톨로지·데이터셋·계보의 단일 정의.
 * 화면(Ingest/Quality/...)은 이 정의만 읽는다. 실단말 전환 시 count/sample만 교체하면 된다.
 */

export type Stage = '1차' | '2차' | '3차'
export type Field = { name: string; type: string; note?: string }
export type Row = Record<string, string | number>

export const fmt = (n: number) => n.toLocaleString('ko-KR')
export const clock = (sec: number) => {
  const h = Math.floor(sec / 3600) % 24
  const m = Math.floor(sec / 60) % 60
  const s = Math.floor(sec) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
/** 차량번호 뒤 4자리 — 표에서 폭을 아끼기 위해 */
export const shortId = (id: string) => id.slice(-4) + '호'
/** 결정적 의사난수 (시드 기반) — 렌더마다 값이 튀지 않게 */
export const seeded = (seed: number, min: number, max: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return min + (x - Math.floor(x)) * (max - min)
}
/** 냉각수온 파생 — 고장 발생 차량은 실값, 나머지는 RPM 기반 정상범위 */
export const coolantOf = (s: SimSnapshot, vehicleId: string, rpm: number) =>
  s.fault?.vehicleId === vehicleId ? Math.round(s.fault.coolantTemp * 10) / 10 : Math.round((88 + (rpm / 3000) * 6) * 10) / 10

/* ═══════════ 원천 커넥터 ═══════════ */
export type Conn = {
  code: string
  name: string
  owner: string
  stage: Stage
  hz: string
  schemaVer: string
  since: string
  fields: Field[]
  note: string
  /** 오늘 수집 레코드 수 */
  count: (s: SimSnapshot) => number
  /** 수집 지연 (ms) — [p50, p95] */
  latency: [number, number]
  /** 최근 수신 레코드 샘플 — 실제 스냅샷에서 만든다 */
  sample: (s: SimSnapshot) => Row[]
}

export const CONNECTORS: Conn[] = [
  {
    code: 'DTG 409', name: '운행기록계 실시간 패킷', owner: '오큐브 자체 자산', stage: '1차',
    hz: '1초', schemaVer: 'v2.1 (공단 표준)', since: '실증 착수일', latency: [780, 1420],
    note: '위험운전 8종·속도·RPM·위치',
    fields: [
      { name: 'vehicleId', type: 'string', note: '차량번호' },
      { name: 'eventType', type: 'enum(8)', note: '급가속·급감속 등 공단 표준 8종' },
      { name: 'speedKmh', type: 'float', note: '내부 차량속도 (GPS 아님)' },
      { name: 'rpm', type: 'int' },
      { name: 'lat / lng', type: 'float' },
      { name: 'simTime', type: 'timestamp', note: '1초 해상도' },
      { name: 'justified', type: 'bool', note: '맥락 융합 정당 판정' },
    ],
    count: (s) => Math.floor(s.simTime) * s.vehicles.length,
    sample: (s) =>
      s.events.slice(0, 6).map((e) => ({
        시각: clock(e.simTime),
        차량: shortId(e.vehicleId),
        이벤트: e.eventType,
        '속도(km/h)': Math.round(e.speedKmh),
        RPM: Math.round(e.rpm),
        정당판정: e.justified ? '인정' : '—',
      })),
  },
  {
    code: 'DTG 521', name: '운행기록계 운행기록', owner: '오큐브 자체 자산', stage: '1차',
    hz: '회차 종료 시', schemaVer: 'v2.1 (공단 표준)', since: '실증 착수일', latency: [420, 900],
    note: '회차 단위 거리·연료·CO₂ (eTAS 제출 원본)',
    fields: [
      { name: 'vehicleId', type: 'string' },
      { name: 'routeName', type: 'string' },
      { name: 'startSimTime / endSimTime', type: 'timestamp' },
      { name: 'distanceKm', type: 'float' },
      { name: 'fuelM3', type: 'float', note: '회차 구간 소모량' },
      { name: 'co2Kg', type: 'float', note: 'fuelM3 × 배출계수' },
    ],
    count: (s) => s.trips.length,
    sample: (s) =>
      s.trips.slice(0, 6).map((t) => ({
        구간: `${clock(t.startSimTime)}–${clock(t.endSimTime)}`,
        차량: shortId(t.vehicleId),
        노선: t.routeName,
        '거리(km)': t.distanceKm,
        '연료(m³)': t.fuelM3,
        'CO₂(kg)': t.co2Kg,
      })),
  },
  {
    code: 'OBD/CAN', name: '차량 자가진단 센서', owner: '오큐브 자체 자산', stage: '1차',
    hz: '1초', schemaVer: 'v1.4 (21종)', since: '실증 착수일', latency: [810, 1560],
    note: '냉각수온·레일압력·SCR NOx·DPF·연료분사',
    fields: [
      { name: 'coolantTemp', type: 'float', note: '정상 88~95℃' },
      { name: 'railPressure', type: 'float', note: '커먼레일 압력' },
      { name: 'scrNox', type: 'float', note: '질소산화물 후처리' },
      { name: 'dpfSoot', type: 'float', note: '매연 포집 필터 포화도' },
      { name: 'fuelRate', type: 'float', note: '연료분사량 — CO₂ 산정 근거' },
      { name: '… 외 16종', type: 'float' },
    ],
    count: (s) => Math.floor(s.simTime) * s.vehicles.length,
    sample: (s) =>
      s.vehicles.slice(0, 6).map((v, i) => ({
        차량: shortId(v.id),
        RPM: Math.round(v.rpm),
        '냉각수온(℃)': coolantOf(s, v.id, v.rpm),
        '레일압력(bar)': Math.round(seeded(i + 1, 820, 1180)),
        'DPF(%)': Math.round(seeded(i + 7, 18, 62)),
        '누적연료(m³)': Math.round(v.fuelM3 * 100) / 100,
      })),
  },
  {
    code: 'RTK', name: 'cm급 초정밀 측위', owner: '단말 + 국가 무료 보정신호(NTRIP)', stage: '1차',
    hz: '1초', schemaVer: 'v1.0', since: '실증 착수일', latency: [640, 1080],
    note: '차로 단위 위치·정차 품질',
    fields: [
      { name: 'lat / lng', type: 'float', note: 'cm급 보정 적용' },
      { name: 'headingDeg', type: 'float' },
      { name: 'hAcc', type: 'float', note: '수평 정밀도 (m)' },
      { name: 'fixType', type: 'enum', note: 'RTK Fixed / Float / Single' },
    ],
    count: (s) => Math.floor(s.simTime) * s.vehicles.length,
    sample: (s) =>
      s.vehicles.slice(0, 6).map((v, i) => ({
        차량: shortId(v.id),
        위도: v.lat.toFixed(6),
        경도: v.lng.toFixed(6),
        '방위(°)': Math.round(v.headingDeg),
        '정밀도(m)': (Math.round(seeded(i + 3, 0.014, 0.035) * 1000) / 1000).toFixed(3),
        측위: 'RTK Fixed',
      })),
  },
  {
    code: 'BIS 공개 API', name: '대구 버스정보시스템 공개 조회', owner: '대구시 공개 API', stage: '1차',
    hz: '3초', schemaVer: 'TAGO v1', since: '실증 착수일', latency: [1900, 3400],
    note: '전 차량 위치·정류소 도착정보',
    fields: [
      { name: 'routeId / routeName', type: 'string' },
      { name: 'gpsLat / gpsLong', type: 'float', note: '3초 갱신' },
      { name: 'nodeNm', type: 'string', note: '정류소명' },
      { name: 'arrPrevStationCnt', type: 'int', note: '남은 정류소 수' },
    ],
    count: (s) => Math.floor((s.simTime / 3) * s.vehicles.length),
    sample: (s) =>
      s.vehicles.slice(0, 6).map((v) => ({
        차량: shortId(v.id),
        노선: ROUTES.find((r) => r.id === v.routeId)?.name ?? '—',
        '다음 정류소': v.nextStopName,
        '잔여(m)': Math.round(v.nextStopDistM),
        '속도(km/h)': Math.round(v.speedKmh),
      })),
  },
  {
    code: '날씨·돌발', name: '기상·행사·재난 공개 데이터', owner: '공공 오픈 API', stage: '1차',
    hz: '60초', schemaVer: 'v1.2', since: '실증 착수일', latency: [2400, 5200],
    note: '운행 맥락 보정 (폭우·폭염·사고)',
    fields: [
      { name: 'condition', type: 'enum', note: '맑음 / 폭우 / 폭염' },
      { name: 'tempC / rainMm', type: 'float' },
      { name: 'incidentKind', type: 'enum', note: '사고·고장·공사·기타' },
      { name: 'location', type: 'string' },
    ],
    count: (s) => Math.floor(s.simTime / 60) + s.incidents.length,
    sample: (s) => [
      { 구분: '기상', 값: `${s.weather.condition} ${s.weather.tempC}℃`, 비고: `강수 ${s.weather.rainMm}mm · 지연예보 +${s.weather.delayForecastMin}분` },
      ...s.incidents.slice(0, 5).map((i) => ({ 구분: i.kind, 값: i.title, 비고: i.status })),
    ],
  },
  {
    code: '정비이력', name: '차량 정비 기록', owner: '운수사 정비 시스템', stage: '1차',
    hz: '이벤트', schemaVer: 'v1.1', since: '실증 착수일', latency: [3200, 8800],
    note: '작업지시·부품·비용 — 고장 예측의 라벨',
    fields: [
      { name: 'vehicleId', type: 'string' },
      { name: 'kind', type: 'string', note: '정비 항목' },
      { name: 'items[]', type: 'string[]', note: '점검·교체 부품' },
      { name: 'estHours', type: 'float' },
      { name: 'status', type: 'enum', note: '초안 / 발행됨' },
    ],
    count: (s) => s.workOrders.length,
    sample: (s) =>
      s.workOrders.slice(0, 6).map((w) => ({
        차량: shortId(w.vehicleId),
        항목: w.kind,
        점검: w.items.slice(0, 2).join(' · '),
        '예상(h)': w.estHours,
        상태: w.status,
      })),
  },
  {
    code: '단말 상태', name: '차내 단말 자가진단', owner: '오큐브 자체 자산', stage: '1차',
    hz: '30초', schemaVer: 'v1.0', since: '실증 착수일', latency: [520, 940],
    note: '통신·저장·전원 — 데이터 결손 원인 추적',
    fields: [
      { name: 'commRssi', type: 'int', note: 'LTE 신호 세기' },
      { name: 'storageFreePct', type: 'float' },
      { name: 'powerV', type: 'float' },
      { name: 'lastSyncAt', type: 'timestamp' },
    ],
    count: (s) => Math.floor((s.simTime / 30) * s.vehicles.length),
    sample: (s) =>
      s.vehicles.slice(0, 6).map((v, i) => ({
        차량: shortId(v.id),
        'LTE(dBm)': -Math.round(seeded(i + 11, 62, 94)),
        '저장 여유(%)': Math.round(seeded(i + 13, 41, 88)),
        '전원(V)': (Math.round(seeded(i + 17, 23.6, 27.8) * 10) / 10).toFixed(1),
        상태: '정상',
      })),
  },
  {
    code: 'AFC', name: '교통카드 요금 정산', owner: 'iM유페이 (컨소시엄)', stage: '2차',
    hz: '이벤트', schemaVer: '—', since: '협약 시', latency: [0, 0],
    note: '승하차 수요·OD — 배차 최적화의 근거',
    fields: [
      { name: 'cardId(가명)', type: 'hash' },
      { name: 'boardStop / alightStop', type: 'string' },
      { name: 'fare', type: 'int' },
      { name: 'transferFlag', type: 'bool' },
    ],
    count: () => 0, sample: () => [],
  },
  {
    code: 'APC', name: '자동 승객 계수', owner: '컨소시엄 자산', stage: '2차',
    hz: '정류장', schemaVer: '—', since: '협약 시', latency: [0, 0],
    note: '재차율 실측 (데모는 시뮬 추정)',
    fields: [
      { name: 'boardCnt / alightCnt', type: 'int' },
      { name: 'onboardCnt', type: 'int', note: '재차 인원' },
      { name: 'stopId', type: 'string' },
    ],
    count: () => 0, sample: () => [],
  },
  {
    code: '민원', name: '시민 불편 접수', owner: '대구시 민원 채널', stage: '2차',
    hz: '이벤트', schemaVer: '데모 형식', since: '연동 시', latency: [0, 0],
    note: '데모는 시뮬 접수 — 실연동은 2차',
    fields: [
      { name: 'text', type: 'string', note: '민원 원문' },
      { name: 'receivedAt', type: 'timestamp' },
      { name: 'routeHint / stopHint', type: 'string' },
      { name: 'status', type: 'enum' },
    ],
    count: (s) => s.complaints.length,
    sample: (s) =>
      s.complaints.slice(0, 5).map((c) => ({
        접수: clock(c.simTime),
        내용: c.text.slice(0, 22),
        상태: c.status,
      })),
  },
  {
    code: 'BMS 배차원장', name: '버스운영관리시스템 배차 기록', owner: '대구시 소관', stage: '3차',
    hz: '일', schemaVer: '—', since: '협조 시', latency: [0, 0],
    note: '계획 대비 실주행 대조 — 정산 고도화',
    fields: [
      { name: 'planTripId', type: 'string' },
      { name: 'plannedDepart', type: 'timestamp' },
      { name: 'assignedVehicle / driver', type: 'string' },
    ],
    count: () => 0, sample: () => [],
  },
  {
    code: 'ITS', name: '지능형 교통체계 신호', owner: '대구시 소관', stage: '3차',
    hz: '1초', schemaVer: '—', since: '협조 시', latency: [0, 0],
    note: '신호 예측 에코코칭',
    fields: [
      { name: 'intersectionId', type: 'string' },
      { name: 'phase / remainSec', type: 'int' },
    ],
    count: () => 0, sample: () => [],
  },
  {
    code: 'DVR', name: '차량 영상기록', owner: '대구시·운수사', stage: '3차',
    hz: '연속', schemaVer: '—', since: '협조 시', latency: [0, 0],
    note: '영상 기반 안전 분석 (비식별 전제)',
    fields: [
      { name: 'clipRef', type: 'uri', note: '원본은 이관하지 않고 참조만' },
      { name: 'maskedFaces', type: 'bool', note: '비식별 처리 여부' },
    ],
    count: () => 0, sample: () => [],
  },
]

/* ═══════════ 품질 룰 ═══════════ */
export type Rule = {
  code: string
  name: string
  desc: string
  kind: '라이브 검사' | '표본 비율'
  action: string
  fail: (s: SimSnapshot, total: number) => number
  /** 격리 레코드 샘플 */
  sample: (s: SimSnapshot, n: number) => Row[]
}

const qSample = (s: SimSnapshot, n: number, rule: string, detail: (i: number) => string): Row[] =>
  Array.from({ length: Math.min(n, 4) }, (_, i) => {
    const v = s.vehicles[i % Math.max(1, s.vehicles.length)]
    return {
      시각: clock(Math.max(0, s.simTime - i * 137)),
      차량: v ? shortId(v.id) : '—',
      규칙: rule,
      내용: detail(i),
      조치: '격리 · 원인 추적',
    }
  })

export const RULES: Rule[] = [
  {
    code: 'Q1', name: '필수값 결측', kind: '표본 비율',
    desc: '위치·속도·시각 중 하나라도 비면 격리',
    action: '단말 통신 유실 구간으로 표시 · 재전송 요청',
    fail: (_s, t) => Math.floor(t * 0.0004),
    sample: (s, n) => qSample(s, n, 'Q1', (i) => (i % 2 ? 'lat/lng 누락 — 지하 구간 통신 유실' : 'speedKmh 누락')),
  },
  {
    code: 'Q2', name: '물리 일관성', kind: '라이브 검사',
    desc: 'RPM 0인데 속도 > 0, 냉각수온 급점프 등 물리적으로 불가능한 조합',
    action: '센서 고장 의심 — 단말 점검 대상 등록',
    fail: (s) => s.vehicles.filter((v) => v.rpm < 50 && v.speedKmh > 3).length + (s.fault ? 1 : 0),
    sample: (s, n) =>
      s.fault && n > 0
        ? [{ 시각: clock(s.fault.startedAt), 차량: shortId(s.fault.vehicleId), 규칙: 'Q2', 내용: `냉각수온 ${s.fault.coolantTemp.toFixed(1)}℃ — 정상범위(88~95) 이탈`, 조치: '고장 예측 발화 · 검사 통과 보류' }]
        : qSample(s, n, 'Q2', () => 'RPM 0 · 속도 5km/h — 센서 불일치'),
  },
  {
    code: 'Q3', name: '값 범위', kind: '라이브 검사',
    desc: '속도 0~120km/h, RPM 0~3,000 등 사양 범위 밖 값',
    action: '범위 밖 값 격리 · 사양 대조',
    fail: (s) => s.vehicles.filter((v) => v.speedKmh > 120 || v.rpm > 3000).length,
    sample: (s, n) => qSample(s, n, 'Q3', () => '속도 137km/h — 시내버스 사양 초과'),
  },
  {
    code: 'Q4', name: '시각 정합', kind: '표본 비율',
    desc: '단말 시계 오차·역행 타임스탬프 — DTG·OBD·RTK 3소스 교차',
    action: 'NTP 재동기 요청 · 오차분 보정 후 재처리',
    fail: (_s, t) => Math.floor(t * 0.0002),
    sample: (s, n) => qSample(s, n, 'Q4', (i) => `타임스탬프 ${i % 2 ? '역행 1.4초' : '오차 +2.1초'} — 3소스 중 DTG만 불일치`),
  },
  {
    code: 'Q5', name: '위치 이상', kind: '표본 비율',
    desc: '인가노선 폴리라인에서 과도 이탈·순간이동 좌표',
    action: '이탈 구간 표시 — 정산 검증 대상으로 별도 회부',
    fail: (_s, t) => Math.floor(t * 0.0001),
    sample: (s, n) => qSample(s, n, 'Q5', () => '직전 좌표 대비 480m 순간이동 — 터널 재측위'),
  },
  {
    code: 'Q6', name: '중복 패킷', kind: '표본 비율',
    desc: '통신 재전송으로 같은 시각 데이터가 두 번 들어온 경우',
    action: '최초 수신분만 채택 · 중복분 폐기 기록',
    fail: (_s, t) => Math.floor(t * 0.0003),
    sample: (s, n) => qSample(s, n, 'Q6', () => '동일 (차량, 시각) 키 2회 수신 — 재전송'),
  },
]

/* ═══════════ 온톨로지 ═══════════ */
export type OntoClass = {
  key: string
  label: string
  en: string
  color: string
  rel: string
  props: Field[]
  count: (s: SimSnapshot) => number
  sample: (s: SimSnapshot) => Row[]
}

export const ONTO: OntoClass[] = [
  {
    key: 'trip', label: '운행 (Trip)', en: 'Trip', color: '#38bdf8', rel: '중심축 — 모든 사실이 여기에 걸린다',
    props: [
      { name: 'tripId', type: 'uri' },
      { name: 'performedBy → Vehicle', type: 'rel' },
      { name: 'drivenBy → Driver', type: 'rel' },
      { name: 'onRoute → Route', type: 'rel' },
      { name: 'hasEvent → RiskEvent[]', type: 'rel' },
      { name: 'distanceKm / fuelM3 / co2Kg', type: 'float' },
    ],
    count: (s) => s.trips.length,
    sample: (s) =>
      s.trips.slice(0, 5).map((t) => ({
        Trip: `${shortId(t.vehicleId)}·${clock(t.startSimTime)}`,
        노선: t.routeName,
        '거리(km)': t.distanceKm,
        'CO₂(kg)': t.co2Kg,
      })),
  },
  {
    key: 'vehicle', label: '차량', en: 'Vehicle', color: '#34d399', rel: 'Trip ─ 수행차량 →',
    props: [
      { name: 'vehicleId', type: 'string', note: '차량번호 = 자연키' },
      { name: 'operatedBy → Operator', type: 'rel' },
      { name: 'hasDevice → Device', type: 'rel' },
      { name: 'maintenanceOf → WorkOrder[]', type: 'rel' },
    ],
    count: (s) => s.vehicles.length,
    sample: (s) =>
      s.vehicles.slice(0, 5).map((v) => ({
        차량: shortId(v.id),
        노선: ROUTES.find((r) => r.id === v.routeId)?.name ?? '—',
        '주행(km)': Math.round(v.distanceKm * 10) / 10,
        안전점수: Math.round(v.score),
      })),
  },
  {
    key: 'driver', label: '기사', en: 'Driver', color: '#a78bfa', rel: 'Trip ─ 운전자 →',
    props: [
      { name: 'driverId(가명)', type: 'hash', note: '분석셋은 가명 처리' },
      { name: 'employedBy → Operator', type: 'rel' },
      { name: 'hasScore', type: 'float' },
    ],
    count: (s) => new Set(s.vehicles.map((v) => v.driverName)).size,
    sample: (s) =>
      s.vehicles.slice(0, 5).map((v) => ({
        기사: v.driverName,
        담당차량: shortId(v.id),
        안전점수: Math.round(v.score),
        경제운전: Math.round(v.ecoScore),
      })),
  },
  {
    key: 'route', label: '노선', en: 'Route', color: '#fbbf24', rel: 'Trip ─ 운행노선 →',
    props: [
      { name: 'routeId / routeName', type: 'string' },
      { name: 'servesStop → Stop[]', type: 'rel' },
      { name: 'authorizedPath', type: 'geometry', note: '인가노선 폴리라인 — 정산 검증 기준' },
    ],
    count: () => ROUTES.length,
    sample: () => ROUTES.map((r) => ({ 노선: r.name, 정류장: r.stops.length, 형태: r.loop ? '순환' : '왕복' })),
  },
  {
    key: 'stop', label: '정류장', en: 'Stop', color: '#f472b6', rel: 'Route ─ 경유정류장 →',
    props: [
      { name: 'stopName', type: 'string' },
      { name: 'atRatio', type: 'float', note: '노선상 위치 비율' },
      { name: 'dwellStats', type: 'float', note: '정차 품질 (RTK 파생)' },
    ],
    count: () => ROUTES.reduce((n, r) => n + r.stops.length, 0),
    sample: () =>
      ROUTES.flatMap((r) => r.stops.slice(0, 2).map((st) => ({ 정류장: st.name, 노선: r.name, '노선상 위치': `${Math.round(st.at * 100)}%` }))).slice(0, 6),
  },
  {
    key: 'event', label: '위험운전 이벤트', en: 'RiskEvent', color: '#fb7185', rel: 'Trip ─ 발생사건 →',
    props: [
      { name: 'eventType', type: 'enum(8)', note: '공단 표준 코드 그대로' },
      { name: 'occurredIn → Trip', type: 'rel' },
      { name: 'justified', type: 'bool', note: '맥락 융합 판정' },
      { name: 'explainedBy → Plea', type: 'rel', note: '기사 상황 설명' },
    ],
    count: (s) => s.kpi.totalEvents,
    sample: (s) =>
      s.events.slice(0, 5).map((e) => ({
        시각: clock(e.simTime),
        차량: shortId(e.vehicleId),
        유형: e.eventType,
        판정: e.justified ? '정당 인정' : '감점',
      })),
  },
  {
    key: 'sensor', label: '센서 측정', en: 'Sensor', color: '#22d3ee', rel: 'Trip ─ 측정치 →',
    props: [
      { name: 'measuredIn → Trip', type: 'rel' },
      { name: 'channel', type: 'enum(21)', note: 'OBD/CAN 21종' },
      { name: 'value / unit', type: 'float' },
    ],
    count: (s) => Math.floor(s.simTime) * s.vehicles.length,
    sample: (s) =>
      s.vehicles.slice(0, 5).map((v) => ({
        차량: shortId(v.id),
        채널: 'coolantTemp',
        값: `${coolantOf(s, v.id, v.rpm)}℃`,
        상태: coolantOf(s, v.id, v.rpm) > 95 ? '이상' : '정상',
      })),
  },
  {
    key: 'loc', label: '위치 관측', en: 'Location', color: '#60a5fa', rel: 'Trip ─ 궤적 →',
    props: [
      { name: 'observedIn → Trip', type: 'rel' },
      { name: 'lat / lng / hAcc', type: 'float' },
      { name: 'onLane', type: 'int', note: 'RTK cm급 — 차로 단위' },
    ],
    count: (s) => Math.floor(s.simTime) * s.vehicles.length,
    sample: (s) =>
      s.vehicles.slice(0, 5).map((v) => ({
        차량: shortId(v.id),
        위도: v.lat.toFixed(5),
        경도: v.lng.toFixed(5),
        '다음 정류장': v.nextStopName,
      })),
  },
  {
    key: 'work', label: '정비 작업지시', en: 'WorkOrder', color: '#fb923c', rel: 'Vehicle ─ 정비이력 →',
    props: [
      { name: 'workOrderId', type: 'uri' },
      { name: 'targetVehicle → Vehicle', type: 'rel' },
      { name: 'kind / items[]', type: 'mixed', note: '표준 항목 사전으로 정규화' },
      { name: 'labelsTrip → Trip[]', type: 'rel', note: '직전 회차에 고장 라벨 부착' },
      { name: 'status', type: 'enum', note: '초안 / 발행됨 — 승인 후 실행' },
    ],
    count: (s) => s.workOrders.length,
    sample: (s) =>
      s.workOrders.slice(0, 5).map((w) => ({
        차량: shortId(w.vehicleId),
        항목: w.kind,
        '예상(h)': w.estHours,
        상태: w.status,
      })),
  },
  {
    key: 'plea', label: '상황 설명', en: 'Plea', color: '#2dd4bf', rel: 'RiskEvent ─ 상황 설명 →',
    props: [
      { name: 'pleaId', type: 'uri' },
      { name: 'explains → RiskEvent', type: 'rel' },
      { name: 'byDriver → Driver', type: 'rel' },
      { name: 'method', type: 'enum', note: '음성 / 버튼' },
      { name: 'status', type: 'enum', note: '접수 / 인정 — 인정 시 감점 복원, 곧 학습 라벨' },
    ],
    count: (s) => s.pleas.length,
    sample: (s) =>
      s.pleas.slice(0, 5).map((p) => ({
        시각: clock(p.simTime),
        기사: p.driverName,
        유형: p.eventType,
        방식: p.method,
        상태: p.status,
      })),
  },
  {
    key: 'ctx', label: '맥락 (날씨·돌발)', en: 'Context', color: '#94a3b8', rel: 'Trip ─ 운행맥락 →',
    props: [
      { name: 'appliesTo → Trip[]', type: 'rel' },
      { name: 'condition / tempC / rainMm', type: 'mixed' },
      { name: 'incidentKind / location', type: 'string' },
    ],
    count: (s) => Math.floor(s.simTime / 60) + s.incidents.length,
    sample: (s) => [
      { 구분: '기상', 값: `${s.weather.condition} ${s.weather.tempC}℃`, 영향: `지연 +${s.weather.delayForecastMin}분 · 수요 ${s.weather.demandDeltaPct > 0 ? '+' : ''}${s.weather.demandDeltaPct}%` },
      ...s.incidents.slice(0, 4).map((i) => ({ 구분: i.kind, 값: i.title, 영향: i.status })),
    ],
  },
]

/** 온톨로지 질의 예시 — 실제 스냅샷으로 계산해 답을 낸다 */
export const ONTO_QUERIES: { q: string; path: string; answer: (s: SimSnapshot) => string }[] = [
  {
    q: '"지금 가장 위험한 차량은?"',
    path: 'Vehicle ← 수행차량 ─ Trip ─ 발생사건 → RiskEvent  (안전점수 오름차순)',
    answer: (s) => {
      const v = [...s.vehicles].sort((a, b) => a.score - b.score)[0]
      if (!v) return '데이터 없음'
      const top = Object.entries(v.eventCounts).sort((a, b) => b[1] - a[1])[0]
      return `${shortId(v.id)} (${v.driverName}) — 안전점수 ${Math.round(v.score)}점, ${top?.[0]} ${top?.[1]}건이 가장 많음`
    },
  },
  {
    q: '"연비가 가장 나쁜 노선은?"',
    path: 'Route ← 운행노선 ─ Trip ─ 측정치 → Sensor(fuelRate)  (거리÷연료 오름차순)',
    answer: (s) => {
      const rows = ROUTES.map((r) => {
        const vs = s.vehicles.filter((v) => v.routeId === r.id)
        const d = vs.reduce((n, v) => n + v.distanceKm, 0)
        const f = vs.reduce((n, v) => n + v.fuelM3, 0)
        return { name: r.name, eff: f > 0 ? d / f : 0 }
      }).filter((x) => x.eff > 0)
      if (!rows.length) return '아직 주행 데이터가 쌓이지 않았습니다'
      const worst = rows.sort((a, b) => a.eff - b.eff)[0]
      return `${worst.name} — ${worst.eff.toFixed(2)} km/m³ (3개 노선 중 최저)`
    },
  },
  {
    q: '"이 급감속은 정당했나?"',
    path: 'RiskEvent ─ 운행맥락 → Context(날씨) + 앞차 간격 + 기사 상황 설명 → 판정',
    answer: (s) => {
      const e = s.events.find((x) => x.justified) ?? s.events[0]
      if (!e) return '아직 이벤트가 없습니다'
      return e.justified
        ? `${clock(e.simTime)} ${shortId(e.vehicleId)} ${e.eventType} — 정당 인정 (${e.justifyReason ?? '맥락 판정'})`
        : `${clock(e.simTime)} ${shortId(e.vehicleId)} ${e.eventType} — 감점 · 기사 상황 설명 대기`
    },
  },
]

/* ═══════════ AI-Ready 데이터셋 ═══════════ */
export type Dataset = {
  key: string
  name: string
  purpose: string
  rows: (s: SimSnapshot) => number
  /** 전체 피처 수 (아래 features는 대표 정의만 표시) */
  featureCount: number
  features: Field[]
  label: string
  refresh: string
  services: { name: string; tab: string }[]
  ready: number
  /** 결측률 % */
  missing: number
  sample: (s: SimSnapshot) => Row[]
}

export const DATASETS: Dataset[] = [
  {
    key: 'safety', featureCount: 18, name: '안전운전 이벤트 학습셋', purpose: '위험운전 판정·코칭 효과 학습', ready: 96, missing: 0.4,
    label: '관제 판정 + 기사 상황 설명 결과 (사람 확인 기준)', refresh: '실시간',
    services: [{ name: '기사 앱 코칭', tab: 'driver' }, { name: '운수사 승인 루프', tab: 'operator' }, { name: '시티 위험 히트맵', tab: 'city' }],
    features: [
      { name: 'event_type', type: 'category(8)' },
      { name: 'speed_before / after', type: 'float' },
      { name: 'rpm_delta', type: 'float' },
      { name: 'headway_min', type: 'float', note: '앞차 간격' },
      { name: 'weather_cond', type: 'category' },
      { name: 'stop_distance_m', type: 'float', note: '정류장 접근 거리' },
      { name: 'driver_persona', type: 'category' },
      { name: '… 외 11개', type: 'mixed' },
    ],
    rows: (s) => s.kpi.totalEvents,
    sample: (s) =>
      s.events.slice(0, 5).map((e) => ({
        event_type: e.eventType,
        speed: Math.round(e.speedKmh),
        rpm: Math.round(e.rpm),
        weather: s.weather.condition,
        label_justified: e.justified ? 1 : 0,
      })),
  },
  {
    key: 'fuel', featureCount: 22, name: '회차 연비·탄소 학습셋', purpose: '연비 예측 · CO₂ 산정 · 크레딧 검증', ready: 98, missing: 0.1,
    label: '실측 연료(OBD) — 라벨 자동 확보', refresh: '회차 종료 시',
    services: [{ name: '탄소중립 분석', tab: 'carbon' }, { name: '성과 검증', tab: 'proof' }, { name: '경영·투자', tab: 'operator' }],
    features: [
      { name: 'route_id', type: 'category' },
      { name: 'distance_km', type: 'float' },
      { name: 'idle_sec', type: 'float', note: '공회전 누적' },
      { name: 'harsh_event_cnt', type: 'int' },
      { name: 'eco_score', type: 'float' },
      { name: 'temp_c / rain_mm', type: 'float' },
      { name: '… 외 16개', type: 'mixed' },
    ],
    rows: (s) => s.trips.length,
    sample: (s) =>
      s.trips.slice(0, 5).map((t) => ({
        route: t.routeName,
        distance_km: t.distanceKm,
        label_fuel_m3: t.fuelM3,
        co2_kg: t.co2Kg,
      })),
  },
  {
    key: 'fault', featureCount: 21, name: '고장 예측 시계열', purpose: '부품별 이상 징후 → 잔여수명 예측', ready: 91, missing: 1.2,
    label: '정비이력 (작업지시 완료 기록)', refresh: '1초 실시간',
    services: [{ name: '진단 스캐너', tab: 'operator' }, { name: '예지정비 작업지시', tab: 'operator' }],
    features: [
      { name: 'coolant_temp', type: 'float' },
      { name: 'rail_pressure', type: 'float' },
      { name: 'dpf_soot', type: 'float' },
      { name: 'scr_nox', type: 'float' },
      { name: 'rolling_mean_60s', type: 'float', note: '이동평균 파생' },
      { name: '… 외 16개', type: 'float' },
    ],
    rows: (s) => Math.floor(s.simTime) * s.vehicles.length,
    sample: (s) =>
      s.vehicles.slice(0, 5).map((v, i) => ({
        vehicle: shortId(v.id),
        coolant_temp: coolantOf(s, v.id, v.rpm),
        dpf_soot: Math.round(seeded(i + 7, 18, 62)),
        label_fault: s.fault?.vehicleId === v.id ? 1 : 0,
      })),
  },
  {
    key: 'headway', featureCount: 14, name: '배차·정시성 학습셋', purpose: '배차 간격 몰림 예측 · 도착 예측 보정', ready: 88, missing: 2.1,
    label: '정류장 통과 실적 (RTK·BIS 교차)', refresh: '3초',
    services: [{ name: '승객 앱 ETA', tab: 'passenger' }, { name: '배차 권고', tab: 'operator' }, { name: '노선 관리', tab: 'operator' }],
    features: [
      { name: 'front_gap_min / rear_gap_min', type: 'float' },
      { name: 'ideal_gap_min', type: 'float' },
      { name: 'dwell_sec', type: 'float' },
      { name: 'occupancy', type: 'float', note: '2차 APC 연동 시 실측으로 교체' },
      { name: '… 외 10개', type: 'mixed' },
    ],
    rows: (s) => Math.floor((s.simTime / 3) * s.vehicles.length),
    sample: (s) =>
      s.vehicles.slice(0, 5).map((v) => ({
        vehicle: shortId(v.id),
        front_gap_min: v.headway ? Math.round(v.headway.frontGapMin * 10) / 10 : 0,
        ideal_gap_min: v.headway ? v.headway.idealMin : 0,
        status: v.headway?.status ?? 'normal',
      })),
  },
  {
    key: 'settle', featureCount: 16, name: '정산 검증 대조셋', purpose: '인가노선 준수 여부 자동 판정', ready: 84, missing: 0.6,
    label: '담당자 최종 판정 (소급정산 결과)', refresh: '일 마감',
    services: [{ name: '시티 정산 검증', tab: 'city' }, { name: '정책 보고서 에이전트', tab: 'policy' }],
    features: [
      { name: 'trip_path_geom', type: 'geometry' },
      { name: 'authorized_path_geom', type: 'geometry' },
      { name: 'deviation_max_m', type: 'float' },
      { name: 'lane_match_pct', type: 'float', note: 'RTK cm급 — 차로 단위' },
      { name: '… 외 12개', type: 'mixed' },
    ],
    rows: (s) => s.trips.length,
    sample: (s) =>
      s.trips.slice(0, 5).map((t, i) => ({
        trip: `${shortId(t.vehicleId)}·${clock(t.startSimTime)}`,
        deviation_max_m: Math.round(seeded(i + 23, 2, 46)),
        lane_match_pct: Math.round(seeded(i + 29, 87, 99)),
        label_verdict: i === 1 ? '검토 필요' : '준수',
      })),
  },
  {
    key: 'complaint', featureCount: 12, name: '민원-증빙 매칭셋', purpose: '민원 텍스트 → 차량·시각·증빙 연결 학습', ready: 72, missing: 4.8,
    label: '담당자 회신 확정 (사실 / 사실 아님)', refresh: '이벤트',
    services: [{ name: '민원 증빙 자동매칭', tab: 'city' }, { name: '승객 앱 민원 추적', tab: 'passenger' }],
    features: [
      { name: 'text_embedding', type: 'vector(384)' },
      { name: 'time_window_min', type: 'int' },
      { name: 'candidate_trip_cnt', type: 'int' },
      { name: 'event_match_score', type: 'float' },
      { name: '… 외 8개', type: 'mixed' },
    ],
    rows: (s) => s.complaints.length,
    sample: (s) =>
      s.complaints.slice(0, 5).map((c) => ({
        text: c.text.slice(0, 18),
        candidates: c.evidence ? 1 : 0,
        label_status: c.status,
      })),
  },
]

/* ═══════════ 계보 ═══════════ */
export const LINEAGE: { src: string[]; ds: string; svc: { name: string; tab: string }[]; stage: Stage }[] = [
  { src: ['DTG 409', '날씨·돌발'], ds: '안전운전 이벤트 학습셋', stage: '1차',
    svc: [{ name: '기사 앱 코칭', tab: 'driver' }, { name: '운수사 승인 루프', tab: 'operator' }, { name: '시티 히트맵', tab: 'city' }] },
  { src: ['DTG 521', 'OBD/CAN'], ds: '회차 연비·탄소 학습셋', stage: '1차',
    svc: [{ name: '탄소중립 분석', tab: 'carbon' }, { name: '성과 검증', tab: 'proof' }, { name: '경영·투자', tab: 'operator' }] },
  { src: ['OBD/CAN', '정비이력'], ds: '고장 예측 시계열', stage: '1차',
    svc: [{ name: '진단 스캐너', tab: 'operator' }, { name: '예지정비', tab: 'operator' }] },
  { src: ['RTK', 'BIS 공개 API'], ds: '배차·정시성 학습셋', stage: '1차',
    svc: [{ name: '승객 앱 ETA', tab: 'passenger' }, { name: '배차 권고', tab: 'operator' }] },
  { src: ['DTG 521', 'RTK'], ds: '정산 검증 대조셋', stage: '1차',
    svc: [{ name: '시티 정산 검증', tab: 'city' }, { name: '정책 보고서 에이전트', tab: 'policy' }] },
  { src: ['민원', 'DTG 409', 'RTK'], ds: '민원-증빙 매칭셋', stage: '2차',
    svc: [{ name: '민원 증빙 자동매칭', tab: 'city' }, { name: '승객 앱 민원 추적', tab: 'passenger' }] },
  { src: ['AFC', 'APC'], ds: '수요·혼잡 학습셋 (예정)', stage: '2차',
    svc: [{ name: '배차 최적화', tab: 'operator' }, { name: '혼잡 안내', tab: 'passenger' }] },
  { src: ['BMS 배차원장', 'ITS', 'DVR'], ds: '계획-실적 대조셋 (예정)', stage: '3차',
    svc: [{ name: '정산 고도화', tab: 'city' }, { name: '신호 예측 에코코칭', tab: 'driver' }] },
]

export const stageTone: Record<Stage, string> = {
  '1차': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  '2차': 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  '3차': 'border-violet-500/30 bg-violet-500/10 text-violet-400',
}
