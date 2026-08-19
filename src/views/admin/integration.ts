import { clock, seeded, shortId } from './catalog'
import type { SimSnapshot } from '../../sim/types'

/**
 * 원천별 연동 관리 상세 — "통합 관리"의 실체.
 * 각 원천이 어떤 규약으로 들어와, 어떤 규칙으로 정규화되고, 어떤 키로 다른 원천과 붙는지.
 */

export type Integration = {
  endpoint: string
  auth: string
  retry: string
  dedupKey: string
  /** 다른 원천과 붙이는 조인 키 — 통합의 실체 */
  joinKeys: string[]
  /** 적재 전 정규화 규칙 */
  transforms: string[]
  /** 원천 필드 → 표준 필드 → 온톨로지 속성 */
  mapping: { src: string; std: string; onto: string }[]
  /** 스키마 버전 이력 */
  history: { ver: string; when: string; what: string }[]
}

export const INTEGRATION: Record<string, Integration> = {
  'DTG 409': {
    endpoint: 'wss://gw.qdrive.local/stream/dtg409',
    auth: '단말 인증서(mTLS) · 차량별 클라이언트 인증',
    retry: '재시도 간격을 늘려가며 최대 5회 · 미전송분은 단말에 임시 보관(최대 72h)',
    dedupKey: '(vehicleId, simTime, eventType)',
    joinKeys: ['vehicleId → 차량', 'simTime ±1s → 운행(Trip)'],
    transforms: [
      '차량번호 표기 통일 — 하이픈·공백 제거 후 대구70자XXXX 형식으로',
      '이벤트 코드를 공단 표준 8종으로 정규화 (자체 코드 생성 금지)',
      'simTime을 운행 단위 구간에 매핑 — 구간 밖이면 보류함으로',
      'GPS 속도가 아닌 내부 차량속도 채택 — 터널 구간 신뢰도 확보',
    ],
    mapping: [
      { src: 'evt_cd', std: 'eventType', onto: 'RiskEvent.eventType' },
      { src: 'car_no', std: 'vehicleId', onto: 'Vehicle.vehicleId' },
      { src: 'spd', std: 'speedKmh', onto: 'RiskEvent.speedKmh' },
      { src: 'eng_rpm', std: 'rpm', onto: 'RiskEvent.rpm' },
      { src: 'gps_x / gps_y', std: 'lat / lng', onto: 'Location.point' },
      { src: 'occr_dt', std: 'simTime', onto: 'RiskEvent.occurredAt' },
    ],
    history: [
      { ver: 'v2.1', when: '현재', what: '정당판정(justified) 필드 추가 — 맥락 융합 결과 보존' },
      { ver: 'v2.0', when: '이전', what: '공단 표준 8종 코드 체계로 전환' },
    ],
  },
  'DTG 521': {
    endpoint: 'https://gw.qdrive.local/api/dtg521/batch',
    auth: '단말 인증서(mTLS)',
    retry: '회차 종료 시 1회 · 실패 시 다음 회차와 함께 재전송',
    dedupKey: '(vehicleId, startSimTime)',
    joinKeys: ['vehicleId → 차량', '(start, end) 구간 → 운행(Trip) 자연키'],
    transforms: [
      '연료·CO₂를 회차 구간값으로 계산 — 누적값을 그대로 쓰지 않음',
      'CO₂ = fuelM3 × 배출계수 — 계수는 상수 카탈로그에서 주입',
      'eTAS 제출 원본과 동일한 기록 유지 — 법정 기록은 변형하지 않음',
    ],
    mapping: [
      { src: 'car_no', std: 'vehicleId', onto: 'Trip.performedBy' },
      { src: 'route_nm', std: 'routeName', onto: 'Trip.onRoute' },
      { src: 'run_dist', std: 'distanceKm', onto: 'Trip.distanceKm' },
      { src: 'fuel_qty', std: 'fuelM3', onto: 'Trip.fuelM3' },
    ],
    history: [{ ver: 'v2.1', when: '현재', what: '회차 구간 연료 산출로 수정 — 누적값 오기록 해소' }],
  },
  'OBD/CAN': {
    endpoint: 'wss://gw.qdrive.local/stream/obd',
    auth: '단말 인증서(mTLS)',
    retry: '지수 백오프 최대 5회 · 결손 구간 표시 후 재처리 대상 등록',
    dedupKey: '(vehicleId, channel, simTime)',
    joinKeys: ['vehicleId → 차량', 'simTime → 운행(Trip)', 'channel → 센서 채널 사전'],
    transforms: [
      '차종별 CAN ID를 표준 채널 21종으로 매핑 — 차종 사전 기반',
      '단위 정규화 — 온도 ℃, 압력 bar, 유량 m³',
      '이동평균(60초) 파생 채널 생성 — 고장 예측 피처',
    ],
    mapping: [
      { src: 'PID 0x05', std: 'coolantTemp', onto: 'Sensor.value(coolantTemp)' },
      { src: 'PID 0x23', std: 'railPressure', onto: 'Sensor.value(railPressure)' },
      { src: 'CAN 0x18F', std: 'dpfSoot', onto: 'Sensor.value(dpfSoot)' },
      { src: 'CAN 0x2A1', std: 'scrNox', onto: 'Sensor.value(scrNox)' },
      { src: 'PID 0x5E', std: 'fuelRate', onto: 'Trip.fuelM3 (구간 적분)' },
    ],
    history: [
      { ver: 'v1.4', when: '현재', what: 'SCR NOx·DPF 채널 추가 — 총 21종' },
      { ver: 'v1.2', when: '이전', what: '차종별 CAN ID 사전 도입' },
    ],
  },
  RTK: {
    endpoint: 'NTRIP caster(국토지리정보원) + 단말 측위 엔진',
    auth: 'NTRIP 무료 계정 · 단말 인증서',
    retry: '보정신호 끊기면 Float 모드로 자동 강등 · 복구 시 Fixed 승격',
    dedupKey: '(vehicleId, simTime)',
    joinKeys: ['vehicleId → 차량', 'simTime → 운행(Trip)', '좌표 → 인가노선 폴리라인'],
    transforms: [
      '보정신호가 적용된 좌표만 채택 — Single 모드는 품질 태그를 따로 붙임',
      '인가노선 폴리라인에 스냅 — 이탈 거리(m)를 파생 필드로 기록',
      '정차 구간을 검출해 정류장 정차 품질을 파생',
    ],
    mapping: [
      { src: 'rtcm_corrected_lat/lon', std: 'lat / lng', onto: 'Location.point' },
      { src: 'fix_type', std: 'fixType', onto: 'Location.quality' },
      { src: 'h_acc', std: 'hAcc', onto: 'Location.accuracyM' },
    ],
    history: [{ ver: 'v1.0', when: '현재', what: '초기 도입 — 차로 단위 검증 가능' }],
  },
  'BIS 공개 API': {
    endpoint: 'https://apis.data.go.kr/… (TAGO 버스위치)',
    auth: '공공데이터포털 서비스 키 — 브라우저 localStorage 전용, 저장소 커밋 금지',
    retry: '3초 주기 폴링 · 429/5xx 응답 시 백오프 후 재시도',
    dedupKey: '(routeId, vehicleNo, gpsTime)',
    joinKeys: ['vehicleNo → 차량 (표기 정규화 후)', 'nodeNm → 정류장'],
    transforms: [
      '공개 API 차량번호 표기를 내부 표기로 정규화',
      '3초 주기 데이터를 1초 축으로 보간하지 않음 — 원 해상도를 유지해 교차검증용으로만 사용',
      '정류소명을 정류장 기록에 매칭 — 미매칭은 보류함으로',
    ],
    mapping: [
      { src: 'gpsLat / gpsLong', std: 'lat / lng', onto: 'Location.point(BIS)' },
      { src: 'nodeNm', std: 'stopName', onto: 'Stop.stopName' },
      { src: 'arrPrevStationCnt', std: 'remainStops', onto: 'Trip.progress' },
    ],
    history: [{ ver: 'TAGO v1', when: '현재', what: '공개 API 스펙 그대로 사용 — 실측 조회 확인 완료' }],
  },
  '날씨·돌발': {
    endpoint: 'https://apis.data.go.kr/… (기상청 초단기실황 · 돌발정보)',
    auth: '공공데이터포털 서비스 키',
    retry: '60초 주기 · 실패 시 직전 값 유지 + 신선도 태그 부착',
    dedupKey: '(obsTime, gridX, gridY)',
    joinKeys: ['관측 시각 ±30분 → 운행(Trip)', '격자 좌표 → 노선 구간'],
    transforms: [
      '기상 격자 좌표를 노선 구간에 할당',
      '값의 신선도(수집 후 경과)를 태그로 붙여 오래된 값은 가중치 하향',
      '돌발정보를 사고·고장·공사·기타 4종으로 정규화',
    ],
    mapping: [
      { src: 'T1H / RN1', std: 'tempC / rainMm', onto: 'Context.tempC / rainMm' },
      { src: 'SKY / PTY', std: 'condition', onto: 'Context.condition' },
      { src: 'incidentType', std: 'incidentKind', onto: 'Context.incidentKind' },
    ],
    history: [{ ver: 'v1.2', when: '현재', what: '돌발정보 4종 정규화 추가' }],
  },
  정비이력: {
    endpoint: '운수사 정비 시스템 — CSV 배치(향후 API)',
    auth: '운수사 계정 · 배치 파일 서명 검증',
    retry: '일 1회 배치 · 실패 시 다음 배치에 누락분 포함',
    dedupKey: '(vehicleId, workOrderId)',
    joinKeys: ['vehicleId → 차량', '정비일 직전 회차 → 운행(Trip) — 고장 라벨 부착'],
    transforms: [
      '정비 항목 자유텍스트를 표준 항목 사전으로 매핑',
      '부품 코드 정규화 · 비용은 분석셋에서 분리 보관',
      '정비 시점 직전 N회차에 라벨을 붙여 고장 예측 학습셋 생성',
    ],
    mapping: [
      { src: '정비내역(자유서술)', std: 'kind', onto: 'WorkOrder.kind' },
      { src: '교체부품', std: 'items[]', onto: 'WorkOrder.items' },
      { src: '작업시간', std: 'estHours', onto: 'WorkOrder.estHours' },
    ],
    history: [{ ver: 'v1.1', when: '현재', what: '자유텍스트 → 표준 항목 사전 매핑 도입' }],
  },
  '단말 상태': {
    endpoint: 'wss://gw.qdrive.local/stream/device',
    auth: '단말 인증서(mTLS)',
    retry: '30초 주기 하트비트 · 3회 미수신 시 결손 경보',
    dedupKey: '(vehicleId, reportedAt)',
    joinKeys: ['vehicleId → 차량', '결손 구간 → 품질 규칙 Q1 원인 태그'],
    transforms: [
      '하트비트 누락 구간을 데이터 결손 구간으로 표시',
      '결손 원인(통신·저장·전원)을 Q1 격리 데이터에 자동으로 붙임',
    ],
    mapping: [
      { src: 'rssi', std: 'commRssi', onto: 'Device.signal' },
      { src: 'free_mb', std: 'storageFreePct', onto: 'Device.storage' },
      { src: 'vbat', std: 'powerV', onto: 'Device.power' },
    ],
    history: [{ ver: 'v1.0', when: '현재', what: '결손 원인 자동 태깅 도입' }],
  },
}

/** 미연결(2·3차) 원천의 연동 준비 상태 — "무엇이 준비됐고 무엇이 막혔나" */
export const PENDING_PREP: Record<string, { need: string; ready: string; blocked: string }> = {
  AFC: { need: 'iM유페이 데이터 제공 협약', ready: '데이터 형식 정의·가명처리 설계 완료', blocked: '협약 체결 대기' },
  APC: { need: '컨소시엄 APC 장비 연동', ready: '재차율 필드 자리 확보 (지금은 시뮬 추정값)', blocked: '장비 사양 확정 대기' },
  민원: { need: '대구시 민원 채널 API 연동', ready: '증빙 자동매칭 로직은 1차에서 이미 동작', blocked: '연동 승인 대기' },
  'BMS 배차원장': { need: '대구시 BMS 조회 권한', ready: '계획-실적 대조 형식 설계 완료', blocked: '시 협조 대기' },
  ITS: { need: '신호 정보 실시간 제공', ready: '신호 예측 코칭 설계 완료', blocked: '시 협조 대기' },
  DVR: { need: '영상 비식별 처리 합의', ready: '원본 미이관·참조만 하는 구조 설계', blocked: '개인정보 협의 대기' },
}

export type LogLine = { at: string; level: '정보' | '경고' | '오류'; msg: string }

/** 원천별 수집 로그 — 스냅샷 상태에서 파생한 결정적 로그 */
export function connLogs(s: SimSnapshot, code: string): LogLine[] {
  const t = s.simTime
  const out: LogLine[] = []
  if (code === 'OBD/CAN' && s.fault) {
    out.push({ at: clock(s.fault.startedAt), level: '경고', msg: `${shortId(s.fault.vehicleId)} coolantTemp 정상범위 이탈 — 품질 규칙 Q2 보류, 고장 예측으로 회부` })
  }
  if (code === '정비이력') {
    out.push(
      s.workOrders.length > 0
        ? { at: clock(s.workOrders[0].createdAt), level: '정보', msg: `작업지시 ${s.workOrders.length}건 수신 — 고장 예측 정답으로 부착 완료` }
        : { at: clock(t), level: '정보', msg: '오늘 신규 작업지시 없음 — 이벤트 기반 원천이라 정상' },
    )
  }
  if (code === 'BIS 공개 API') {
    out.push({ at: clock(Math.max(0, t - 240)), level: '경고', msg: '공개 API 응답 3.4초 — 조회 주기(3초) 초과 1회, 자동 재시도 후 정상' })
  }
  if (code === '민원' && s.complaints.length > 0) {
    out.push({ at: clock(s.complaints[0].simTime), level: '정보', msg: `민원 ${s.complaints.length}건 접수 — 증빙 자동매칭 대기열로 전달` })
  }
  if (code === 'RTK') {
    out.push({ at: clock(Math.max(0, t - 520)), level: '정보', msg: 'NTRIP 보정신호 재연결 — Float 12초 후 Fixed 복귀' })
  }
  out.push({ at: clock(Math.max(0, t - 60)), level: '정보', msg: '형식 검증 통과 · 적재 정상' })
  out.push({ at: clock(0), level: '정보', msg: '연결 기동 — 인증·주소 확인 완료' })
  return out
}

/** 24시간 수신량 추이 (결정적) — 스파크라인용 */
export function hourly(code: string, total: number): number[] {
  const seed = [...code].reduce((n, c) => n + c.charCodeAt(0), 0)
  const shape = [0.2, 0.15, 0.1, 0.1, 0.3, 0.8, 1, 0.9, 0.75, 0.7, 0.72, 0.8, 0.85, 0.78, 0.74, 0.8, 0.95, 1, 0.88, 0.6, 0.45, 0.4, 0.32, 0.25]
  return shape.map((v, i) => Math.round((total / 24) * v * (0.9 + seeded(seed + i, 0, 1) * 0.2)) || 0)
}
