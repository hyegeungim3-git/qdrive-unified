import { useState } from 'react'
import { KpiCard, Panel } from '../components/ui'
import { useSim } from '../sim/store'
import { ROUTES } from '../sim/routes'
import { RISK_EVENT_TYPES } from '../sim/types'
import type { SimSnapshot } from '../sim/types'

/**
 * 🗄️ 데이터 관리자 — Qdrive의 AX(AI 전환) 데이터 체계를 보여주는 운영자 화면.
 *
 * 서사: 흩어진 시스템의 데이터를 ①모으고 → ②믿을 수 있게 걸러내고 → ③운행 단위(Trip) 온톨로지로 엮어
 * → ④AI가 바로 학습·추론할 수 있는 형태(AI-Ready)로 만들고 → ⑤서비스 화면에 연결한다.
 * 숫자는 전부 시뮬레이터 스냅샷에서 파생 — 배속을 올리면 수집량·인스턴스가 실제로 늘어난다.
 */

const STEPS = [
  { id: 'ingest', n: '①', label: '수집', desc: '흩어진 원천을 하나의 파이프로' },
  { id: 'quality', n: '②', label: '품질', desc: '믿을 수 있는 것만 통과' },
  { id: 'ontology', n: '③', label: '온톨로지', desc: '운행 단위로 의미를 연결' },
  { id: 'dataset', n: '④', label: 'AI-Ready', desc: 'AI가 바로 쓰는 형태로' },
  { id: 'lineage', n: '⑤', label: '서비스 연결', desc: '어느 화면이 무엇을 쓰는가' },
] as const
type StepId = (typeof STEPS)[number]['id']

/* ─────────── 원천 카탈로그 ─────────── */
type Stage = '1차' | '2차' | '3차'
type Conn = {
  code: string
  name: string
  owner: string
  stage: Stage
  hz: string
  /** 라이브 수집 레코드 수 — 스냅샷에서 파생 */
  count: (s: SimSnapshot) => number
  fields: number
  note: string
}

const CONNECTORS: Conn[] = [
  { code: 'DTG 409', name: '운행기록계 실시간 패킷', owner: '오큐브 자체 자산', stage: '1차', hz: '1초', fields: 26,
    count: (s) => Math.floor(s.simTime) * s.vehicles.length, note: '위험운전 8종·속도·RPM·위치' },
  { code: 'DTG 521', name: '운행기록계 운행기록', owner: '오큐브 자체 자산', stage: '1차', hz: '회차 종료 시', fields: 14,
    count: (s) => s.trips.length, note: '회차 단위 거리·연료·CO₂ (eTAS 제출 원본)' },
  { code: 'OBD/CAN', name: '차량 자가진단 센서', owner: '오큐브 자체 자산', stage: '1차', hz: '1초', fields: 21,
    count: (s) => Math.floor(s.simTime) * s.vehicles.length, note: '냉각수온·레일압력·SCR NOx·DPF·연료분사' },
  { code: 'RTK', name: 'cm급 초정밀 측위', owner: '단말 + 국가 무료 보정신호', stage: '1차', hz: '1초', fields: 8,
    count: (s) => Math.floor(s.simTime) * s.vehicles.length, note: '차로 단위 위치·정차 품질' },
  { code: 'BIS 공개 API', name: '대구 버스정보시스템 공개 조회', owner: '대구시 공개 API', stage: '1차', hz: '3초', fields: 11,
    count: (s) => Math.floor((s.simTime / 3) * s.vehicles.length), note: '전 차량 위치·정류소 도착정보' },
  { code: '날씨·돌발', name: '기상·행사·재난 공개 데이터', owner: '공공 오픈 API', stage: '1차', hz: '60초', fields: 9,
    count: (s) => Math.floor(s.simTime / 60) + s.incidents.length, note: '운행 맥락 보정 (폭우·폭염·사고)' },
  { code: '정비이력', name: '차량 정비 기록', owner: '운수사 정비 시스템', stage: '1차', hz: '이벤트', fields: 12,
    count: (s) => s.workOrders.length, note: '작업지시·부품·비용 — 고장 예측의 라벨' },
  { code: '단말 상태', name: '차내 단말 자가진단', owner: '오큐브 자체 자산', stage: '1차', hz: '30초', fields: 7,
    count: (s) => Math.floor((s.simTime / 30) * s.vehicles.length), note: '통신·저장·전원 — 데이터 결손 원인 추적' },
  { code: 'AFC', name: '교통카드 요금 정산', owner: 'iM유페이 (컨소시엄)', stage: '2차', hz: '이벤트', fields: 15, count: () => 0, note: '승하차 수요·OD — 배차 최적화의 근거' },
  { code: 'APC', name: '자동 승객 계수', owner: '컨소시엄 자산', stage: '2차', hz: '정류장', fields: 9, count: () => 0, note: '재차율 실측 (데모는 시뮬 추정)' },
  { code: '민원', name: '시민 불편 접수', owner: '대구시 민원 채널', stage: '2차', hz: '이벤트', fields: 13,
    count: (s) => s.complaints.length, note: '데모는 시뮬 접수 — 실연동은 2차' },
  { code: 'BMS 배차원장', name: '버스운영관리시스템 배차 기록', owner: '대구시 소관', stage: '3차', hz: '일', fields: 18, count: () => 0, note: '계획 대비 실주행 대조 — 정산 고도화' },
  { code: 'ITS', name: '지능형 교통체계 신호', owner: '대구시 소관', stage: '3차', hz: '1초', fields: 10, count: () => 0, note: '신호 예측 에코코칭' },
  { code: 'DVR', name: '차량 영상기록', owner: '대구시·운수사', stage: '3차', hz: '스트림', fields: 6, count: () => 0, note: '영상 기반 안전 분석 (비식별 전제)' },
]

/* ─────────── 품질 검사 룰 ─────────── */
type Rule = {
  code: string
  name: string
  desc: string
  /** 실패(격리) 건수 — 라이브 검사 또는 결정적 비율 */
  fail: (s: SimSnapshot, total: number) => number
  kind: '라이브 검사' | '표본 비율'
}

const RULES: Rule[] = [
  { code: 'Q1', name: '필수값 결측', desc: '위치·속도·시각 중 하나라도 비면 격리', kind: '표본 비율',
    fail: (_s, t) => Math.floor(t * 0.0004) },
  { code: 'Q2', name: '물리 일관성', desc: 'RPM 0인데 속도 > 0, 냉각수온 급점프 등 물리적으로 불가능한 조합', kind: '라이브 검사',
    fail: (s) => s.vehicles.filter((v) => v.rpm < 50 && v.speedKmh > 3).length + (s.fault ? 1 : 0) },
  { code: 'Q3', name: '값 범위', desc: '속도 0~120km/h, RPM 0~3,000 등 사양 범위 밖 값', kind: '라이브 검사',
    fail: (s) => s.vehicles.filter((v) => v.speedKmh > 120 || v.rpm > 3000).length },
  { code: 'Q4', name: '시각 정합', desc: '단말 시계 오차·역행 타임스탬프 — DTG·OBD·RTK 3소스 교차', kind: '표본 비율',
    fail: (_s, t) => Math.floor(t * 0.0002) },
  { code: 'Q5', name: '위치 이상', desc: '인가노선 폴리라인에서 과도 이탈·순간이동 좌표', kind: '표본 비율',
    fail: (_s, t) => Math.floor(t * 0.0001) },
  { code: 'Q6', name: '중복 패킷', desc: '통신 재전송으로 같은 시각 레코드가 두 번 들어온 경우', kind: '표본 비율',
    fail: (_s, t) => Math.floor(t * 0.0003) },
]

/* ─────────── 온톨로지 클래스 ─────────── */
type OntoClass = {
  key: string
  label: string
  en: string
  color: string
  count: (s: SimSnapshot) => number
  rel: string
}
const ONTO: OntoClass[] = [
  { key: 'trip', label: '운행 (Trip)', en: 'Trip', color: '#38bdf8', rel: '중심축 — 모든 사실이 여기에 걸린다', count: (s) => s.trips.length },
  { key: 'vehicle', label: '차량', en: 'Vehicle', color: '#34d399', rel: 'Trip ─ 수행차량 →', count: (s) => s.vehicles.length },
  { key: 'driver', label: '기사', en: 'Driver', color: '#a78bfa', rel: 'Trip ─ 운전자 →', count: (s) => new Set(s.vehicles.map((v) => v.driverName)).size },
  { key: 'route', label: '노선', en: 'Route', color: '#fbbf24', rel: 'Trip ─ 운행노선 →', count: () => ROUTES.length },
  { key: 'stop', label: '정류장', en: 'Stop', color: '#f472b6', rel: 'Route ─ 경유정류장 →', count: () => ROUTES.reduce((n, r) => n + r.stops.length, 0) },
  { key: 'event', label: '위험운전 이벤트', en: 'RiskEvent', color: '#fb7185', rel: 'Trip ─ 발생사건 →', count: (s) => s.kpi.totalEvents },
  { key: 'sensor', label: '센서 측정', en: 'Sensor', color: '#22d3ee', rel: 'Trip ─ 측정치 →', count: (s) => Math.floor(s.simTime) * s.vehicles.length },
  { key: 'loc', label: '위치 관측', en: 'Location', color: '#60a5fa', rel: 'Trip ─ 궤적 →', count: (s) => Math.floor(s.simTime) * s.vehicles.length },
  { key: 'ctx', label: '맥락 (날씨·돌발)', en: 'Context', color: '#94a3b8', rel: 'Trip ─ 운행맥락 →', count: (s) => Math.floor(s.simTime / 60) + s.incidents.length },
]

/* ─────────── AI-Ready 데이터셋 ─────────── */
type Dataset = {
  name: string
  purpose: string
  rows: (s: SimSnapshot) => number
  features: number
  label: string
  refresh: string
  services: string[]
  ready: number
}
const DATASETS: Dataset[] = [
  { name: '안전운전 이벤트 피처', purpose: '위험운전 판정·코칭 효과 학습', features: 18,
    label: '관제 판정 + 기사 상황 설명 결과 (사람 확인 기준)', refresh: '실시간',
    services: ['기사 앱 코칭', '운수사 승인 루프', '시티 위험 히트맵'], ready: 96,
    rows: (s) => s.kpi.totalEvents },
  { name: '회차 연비·탄소 피처', purpose: '연비 예측 · CO₂ 산정 · 크레딧 검증', features: 22,
    label: '실측 연료(OBD) — 라벨 자동 확보', refresh: '회차 종료 시',
    services: ['탄소중립 분석', '성과 검증', '경영·투자'], ready: 98,
    rows: (s) => s.trips.length },
  { name: '고장 예측 시계열', purpose: '부품별 이상 징후 → 잔여수명 예측', features: 21,
    label: '정비이력 (작업지시 완료 기록)', refresh: '1초 스트림',
    services: ['진단 스캐너', '예지정비 작업지시'], ready: 91,
    rows: (s) => Math.floor(s.simTime) * s.vehicles.length },
  { name: '배차·정시성 피처', purpose: '배차 간격 몰림 예측 · 도착 예측 보정', features: 14,
    label: '정류장 통과 실적 (RTK·BIS 교차)', refresh: '3초',
    services: ['승객 앱 ETA', '배차 권고', '노선 관리'], ready: 88,
    rows: (s) => Math.floor((s.simTime / 3) * s.vehicles.length) },
  { name: '정산 검증 대조셋', purpose: '인가노선 준수 여부 자동 판정', features: 16,
    label: '담당자 최종 판정 (소급정산 결과)', refresh: '일 마감',
    services: ['시티 정산 검증', '정책 보고서 에이전트'], ready: 84,
    rows: (s) => s.trips.length },
  { name: '민원-증빙 매칭셋', purpose: '민원 텍스트 → 차량·시각·증빙 연결 학습', features: 12,
    label: '담당자 회신 확정 (사실/사실 아님)', refresh: '이벤트',
    services: ['민원 증빙 자동매칭', '승객 앱 민원 추적'], ready: 72,
    rows: (s) => s.complaints.length },
]

/* ─────────── 계보 (원천 → 데이터셋 → 서비스) ─────────── */
const LINEAGE: { src: string; ds: string; svc: string; stage: Stage }[] = [
  { src: 'DTG 409', ds: '안전운전 이벤트 피처', svc: '기사 앱 코칭 · 운수사 승인 루프 · 시티 히트맵', stage: '1차' },
  { src: 'DTG 521 · OBD', ds: '회차 연비·탄소 피처', svc: '탄소중립 분석 · 성과 검증 · 경영·투자', stage: '1차' },
  { src: 'OBD/CAN · 정비이력', ds: '고장 예측 시계열', svc: '진단 스캐너 · 예지정비 작업지시', stage: '1차' },
  { src: 'RTK · BIS 공개 API', ds: '배차·정시성 피처', svc: '승객 앱 ETA · 배차 권고 · 노선 관리', stage: '1차' },
  { src: 'DTG 521 · RTK', ds: '정산 검증 대조셋', svc: '시티 정산 검증 · 정책 보고서 에이전트', stage: '1차' },
  { src: '민원 · DTG 409 · RTK', ds: '민원-증빙 매칭셋', svc: '민원 증빙 자동매칭 · 승객 앱 민원 추적', stage: '2차' },
  { src: 'AFC · APC', ds: '수요·혼잡 피처 (예정)', svc: '배차 최적화 · 혼잡 안내', stage: '2차' },
  { src: 'BMS 배차원장 · ITS', ds: '계획-실적 대조셋 (예정)', svc: '정산 고도화 · 신호 예측 에코코칭', stage: '3차' },
]

const stageTone: Record<Stage, string> = {
  '1차': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  '2차': 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  '3차': 'border-violet-500/30 bg-violet-500/10 text-violet-400',
}
const fmt = (n: number) => n.toLocaleString('ko-KR')

/* ═══════════════════════════════════════════ */

export default function AdminConsole() {
  const snap = useSim()
  const [step, setStep] = useState<StepId>('ingest')

  const live = CONNECTORS.filter((c) => c.stage === '1차')
  const totalRecords = live.reduce((n, c) => n + c.count(snap), 0)
  const failed = RULES.reduce((n, r) => n + r.fail(snap, totalRecords), 0)
  const passRate = totalRecords > 0 ? ((totalRecords - failed) / totalRecords) * 100 : 100
  const ontoTotal = ONTO.reduce((n, c) => n + c.count(snap), 0)
  const dsRows = DATASETS.reduce((n, d) => n + d.rows(snap), 0)

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-sky-400">AX DATA PLATFORM</div>
          <h2 className="mt-0.5 text-lg font-black tracking-tight text-gray-50">🔗 데이터 관리자</h2>
          <p className="mt-1 max-w-3xl break-keep text-[12.5px] leading-relaxed text-gray-400">
            시스템마다 흩어져 있던 버스 데이터를 <b className="text-gray-200">모으고 · 걸러내고 · 운행 단위로 엮어</b>,
            AI가 바로 쓸 수 있는 형태로 만들어 서비스 화면에 연결합니다. 아래 수치는 전부 지금 돌아가는 엔진에서
            집계된 값입니다 — 배속을 올리면 실제로 늘어납니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            파이프라인 가동 중
          </span>
        </div>
      </div>

      {/* 총괄 KPI */}
      <div className="grid grid-cols-5 gap-3 max-[1100px]:grid-cols-3 max-[720px]:grid-cols-2">
        <KpiCard label="연결 원천" value={`${live.length}`} unit={`/ ${CONNECTORS.length}종`} sub="1차 자체·공개 데이터 전부 연결" accent="text-emerald-400" />
        <KpiCard label="오늘 수집 레코드" value={fmt(totalRecords)} unit="건" sub="엔진 실집계 · 배속 반영" accent="text-sky-400" />
        <KpiCard label="품질 통과율" value={passRate.toFixed(2)} unit="%" sub={`격리 ${fmt(failed)}건 — 6개 룰 검사`} accent={passRate >= 99 ? 'text-emerald-400' : 'text-amber-400'} />
        <KpiCard label="온톨로지 인스턴스" value={fmt(ontoTotal)} unit="개" sub={`${ONTO.length}개 클래스 · 운행 단위 연결`} accent="text-violet-400" />
        <KpiCard label="AI-Ready 데이터셋" value={`${DATASETS.length}`} unit="종" sub={`학습 가능 행 ${fmt(dsRows)}건`} accent="text-amber-400" />
      </div>

      {/* 5단계 내비 */}
      <div className="grid grid-cols-5 gap-2 max-[900px]:grid-cols-2">
        {STEPS.map((s, i) => {
          const on = step === s.id
          return (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                on ? 'border-sky-500/60 bg-sky-500/10' : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-black ${on ? 'text-sky-400' : 'text-gray-600'}`}>{s.n}</span>
                <span className={`text-[13px] font-bold ${on ? 'text-gray-50' : 'text-gray-300'}`}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="ml-auto text-[11px] text-gray-700">→</span>}
              </div>
              <div className="mt-0.5 text-[11px] leading-tight text-gray-500">{s.desc}</div>
            </button>
          )
        })}
      </div>

      {step === 'ingest' && <Ingest snap={snap} total={totalRecords} />}
      {step === 'quality' && <Quality snap={snap} total={totalRecords} failed={failed} passRate={passRate} />}
      {step === 'ontology' && <Ontology snap={snap} />}
      {step === 'dataset' && <Datasets snap={snap} />}
      {step === 'lineage' && <Lineage />}

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 text-[11.5px] leading-relaxed text-gray-500">
        ⚙️ <b className="text-gray-300">실단말 전환 시</b> — 이 화면의 커넥터는 시뮬레이터 대신 실단말 스트림(<code className="text-gray-400">PacketSource</code>)을
        바라보게 바꾸면 그대로 동작합니다. 품질 룰·온톨로지 스키마·데이터셋 정의는 원천이 바뀌어도 유지됩니다 —
        <b className="text-gray-300"> 2·3차 데이터는 같은 중심축(운행 단위)에 꽂기만 하면 됩니다.</b>
      </div>
    </div>
  )
}

/* ─────────── ① 수집 ─────────── */
function Ingest({ snap, total }: { snap: SimSnapshot; total: number }) {
  const byStage = (st: Stage) => CONNECTORS.filter((c) => c.stage === st)
  return (
    <div className="space-y-3">
      <Panel
        title="원천별 수집 현황"
        right={<span className="text-[11px] font-semibold text-gray-500">오늘 누적 {fmt(total)}건 · 1차 원천 실시간</span>}
      >
        <div className="space-y-4">
          {(['1차', '2차', '3차'] as Stage[]).map((st) => (
            <div key={st}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${stageTone[st]}`}>{st}</span>
                <span className="text-[11.5px] font-semibold text-gray-400">
                  {st === '1차' ? '자체 자산 + 공개·무료 인프라 — 지금 수집 중' : st === '2차' ? '컨소시엄 자산 — 협약 시 연결' : '대구시 소관 — 협조 시 연결'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 max-[1200px]:grid-cols-3 max-[900px]:grid-cols-2">
                {byStage(st).map((c) => {
                  const n = c.count(snap)
                  const on = st === '1차'
                  return (
                    <div key={c.code} className={`rounded-lg border px-3 py-2.5 ${on ? 'border-gray-800 bg-gray-900/60' : 'border-dashed border-gray-800 bg-gray-900/30'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`truncate text-[12.5px] font-bold ${on ? 'text-gray-100' : 'text-gray-400'}`}>{c.code}</div>
                          <div className="truncate text-[11px] text-gray-500">{c.name}</div>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700/40 text-gray-500'
                          }`}
                        >
                          {on ? '수집 중' : '연결 대기'}
                        </span>
                      </div>
                      <div className={`mt-2 text-lg font-extrabold tabular-nums ${on ? 'text-sky-300' : 'text-gray-600'}`}>
                        {on ? fmt(n) : '—'}
                        <span className="ml-1 text-[11px] font-semibold text-gray-500">건</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-gray-500">
                        <span>주기 {c.hz}</span>
                        <span className="text-gray-700">·</span>
                        <span>필드 {c.fields}</span>
                      </div>
                      <div className="mt-1.5 truncate text-[10.5px] text-gray-500" title={c.note}>
                        {c.note}
                      </div>
                      <div className="mt-1 truncate text-[10.5px] text-gray-600">보유 {c.owner}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="수집 파이프라인 — 단말에서 저장소까지">
        <div className="grid grid-cols-5 gap-2 max-[900px]:grid-cols-2">
          {[
            ['차내 단말', 'DTG·OBD·RTK 통합 수집', `${snap.vehicles.length}대 연결`],
            ['전송', 'LTE 스트림 · 유실 시 재전송', '지연 중앙값 0.8초'],
            ['수신 게이트', '스키마 검증 · 중복 제거', `${fmt(total)}건 수신`],
            ['원본 보관', '변경 불가 원본(raw) 보존', '감사·분쟁 대응 근거'],
            ['정제 적재', '품질 통과분만 분석 저장소로', '다음 단계 ②'],
          ].map(([t, d, m], i) => (
            <div key={t} className="relative rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5">
              <div className="text-[10px] font-bold text-gray-600">{String(i + 1).padStart(2, '0')}</div>
              <div className="mt-0.5 text-[12.5px] font-bold text-gray-100">{t}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-gray-500">{d}</div>
              <div className="mt-1.5 text-[11px] font-semibold text-sky-300">{m}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

/* ─────────── ② 품질 ─────────── */
function Quality({ snap, total, failed, passRate }: { snap: SimSnapshot; total: number; failed: number; passRate: number }) {
  return (
    <div className="space-y-3">
      <Panel
        title="품질 검사 — 6개 룰"
        right={
          <span className="text-[11px] font-semibold text-gray-500">
            통과 {fmt(total - failed)} / 검사 {fmt(total)}건
          </span>
        }
      >
        <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, passRate)}%` }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">룰</th>
                <th className="py-2 pr-3 font-semibold">검사 내용</th>
                <th className="py-2 pr-3 font-semibold">방식</th>
                <th className="py-2 pr-3 text-right font-semibold">격리</th>
                <th className="py-2 text-right font-semibold">통과율</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => {
                const f = r.fail(snap, total)
                const rate = total > 0 ? ((total - f) / total) * 100 : 100
                return (
                  <tr key={r.code} className="border-b border-gray-800/60">
                    <td className="py-2 pr-3">
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-bold text-gray-300">{r.code}</span>
                      <span className="ml-2 font-bold text-gray-100">{r.name}</span>
                    </td>
                    <td className="py-2 pr-3 text-gray-400">{r.desc}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${r.kind === '라이브 검사' ? 'bg-sky-500/12 text-sky-400' : 'bg-gray-700/40 text-gray-400'}`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className={`py-2 pr-3 text-right font-bold tabular-nums ${f > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{fmt(f)}</td>
                    <td className="py-2 text-right font-bold tabular-nums text-emerald-400">{rate.toFixed(3)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="3중 교차검증 — 위치를 서로 대조한다">
          <div className="space-y-2">
            {[
              { a: 'DTG 409', b: '1초 법정 기록', c: '오큐브 자체 자산', dot: '#34d399' },
              { a: 'RTK', b: 'cm급 초정밀', c: '단말 + 국가 무료 보정', dot: '#38bdf8' },
              { a: 'BIS 공개 API', b: '3초 시 공개 스트림', c: '대구시 공개', dot: '#a78bfa' },
            ].map((s) => (
              <div key={s.a} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-gray-100">{s.a}</div>
                  <div className="text-[11px] text-gray-500">{s.b} · {s.c}</div>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-gray-300">
              서로 <b className="text-emerald-400">독립된 세 소스</b>가 같은 위치를 말하는지 대조합니다. 하나가 조작·오류여도
              나머지 둘이 잡아냅니다 — 정산 검증이 방어 가능한 근거가 되는 이유.
            </div>
          </div>
        </Panel>

        <Panel title="격리 큐 — 통과하지 못한 데이터" right={<span className="text-[11px] font-semibold text-amber-400">{fmt(failed)}건</span>}>
          {failed === 0 ? (
            <div className="py-6 text-center text-[12px] text-gray-500">현재 격리된 레코드가 없습니다 — 전 룰 통과</div>
          ) : (
            <div className="space-y-2">
              {RULES.filter((r) => r.fail(snap, total) > 0).map((r) => (
                <div key={r.code} className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2">
                  <span className="mt-0.5 shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-400">{r.code}</span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-gray-100">
                      {r.name} — {fmt(r.fail(snap, total))}건 격리
                    </div>
                    <div className="text-[11px] leading-tight text-gray-400">{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
            격리된 레코드는 <b className="text-gray-300">버리지 않고 원본 그대로 보관</b>합니다. 원인(단말 고장·통신 유실)을
            추적해 고치면 재처리되고, 그 이력 자체가 단말 관리의 근거가 됩니다.
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ─────────── ③ 온톨로지 ─────────── */
function Ontology({ snap }: { snap: SimSnapshot }) {
  const hub = ONTO[0]
  const spokes = ONTO.slice(1)
  const cx = 300
  const cy = 150
  const R = 118

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1.15fr_1fr] gap-3 max-[1000px]:grid-cols-1">
        <Panel title="운행 단위(Trip) 중심 온톨로지" right={<span className="text-[11px] font-semibold text-gray-500">클래스 {ONTO.length} · 관계 {spokes.length}</span>}>
          <svg viewBox="0 0 600 300" className="w-full" role="img" aria-label="운행 단위 중심 온톨로지 그래프">
            {spokes.map((s, i) => {
              const a = (Math.PI * 2 * i) / spokes.length - Math.PI / 2
              const x = cx + Math.cos(a) * R
              const y = cy + Math.sin(a) * R * 0.82
              return (
                <g key={s.key}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke={s.color} strokeOpacity={0.45} strokeWidth={1.6} />
                  <circle cx={x} cy={y} r={22} fill={s.color} fillOpacity={0.16} stroke={s.color} strokeOpacity={0.75} strokeWidth={1.4} />
                  <text x={x} y={y - 1} textAnchor="middle" fontSize={10} fontWeight={800} fill={s.color}>
                    {fmt(s.count(snap))}
                  </text>
                  <text x={x} y={y + 10} textAnchor="middle" fontSize={7.5} fill={s.color} fillOpacity={0.85}>
                    {s.en}
                  </text>
                </g>
              )
            })}
            <circle cx={cx} cy={cy} r={40} fill={hub.color} fillOpacity={0.2} stroke={hub.color} strokeWidth={2} />
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={15} fontWeight={900} fill={hub.color}>
              {fmt(hub.count(snap))}
            </text>
            <text x={cx} y={cy + 11} textAnchor="middle" fontSize={9} fontWeight={700} fill={hub.color}>
              Trip
            </text>
          </svg>
          <div className="mt-1 rounded-lg border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-[11.5px] leading-relaxed text-gray-300">
            어떤 데이터든 <b className="text-sky-300">운행 단위에 걸리는 순간 맥락이 생깁니다.</b> "3742호가 급감속했다"는
            사실이 <span className="text-gray-400">언제·어느 노선·어느 정류장 앞·어떤 날씨에·어느 기사가</span>까지 함께 붙어야
            판단·설명·학습에 쓸 수 있는 데이터가 됩니다.
          </div>
        </Panel>

        <Panel title="클래스별 인스턴스" right={<span className="text-[11px] font-semibold text-gray-500">LIVE</span>}>
          <div className="space-y-1.5">
            {ONTO.map((c) => {
              const n = c.count(snap)
              const max = Math.max(1, ...ONTO.map((x) => x.count(snap)))
              return (
                <div key={c.key} className="flex items-center gap-2.5">
                  <div className="w-[104px] shrink-0 text-[11.5px] font-bold text-gray-200">{c.label}</div>
                  <div className="h-3.5 flex-1 overflow-hidden rounded bg-gray-800">
                    <div className="h-full rounded" style={{ width: `${Math.max(2, (n / max) * 100)}%`, background: c.color, opacity: 0.75 }} />
                  </div>
                  <div className="w-[68px] shrink-0 text-right text-[11.5px] font-bold tabular-nums text-gray-300">{fmt(n)}</div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 space-y-1">
            {ONTO.slice(1).map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="text-gray-500">{c.rel}</span>
                <span className="font-semibold text-gray-400">{c.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="온톨로지가 열어주는 질문 — 표만 있을 때는 답할 수 없던 것">
        <div className="grid grid-cols-3 gap-2 max-[900px]:grid-cols-1">
          {[
            ['"이 노선 연비가 왜 나쁜가?"', '노선 → 회차 → 정류장 간격·신호·경사 → 기사 습관까지 근거 사슬로 되짚음', '기사별·구간별 개선안'],
            ['"이 민원은 사실인가?"', '민원 시각 → 그 시간대 운행 → 해당 차량 → 급감속 이벤트 → 위치 대조', '증빙과 함께 회신'],
            ['"이 고장은 예고됐었나?"', '정비이력 → 직전 회차 센서 시계열 → 유사 패턴 차량 탐색', '같은 징후 차량 사전 점검'],
          ].map(([q, path, out]) => (
            <div key={q} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5">
              <div className="text-[12.5px] font-bold text-gray-100">{q}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{path}</div>
              <div className="mt-1.5 text-[11px] font-semibold text-emerald-400">→ {out}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

/* ─────────── ④ AI-Ready ─────────── */
function Datasets({ snap }: { snap: SimSnapshot }) {
  return (
    <div className="space-y-3">
      <Panel
        title="AI-Ready 데이터셋 — AI가 바로 학습·추론할 수 있는 형태"
        right={<span className="text-[11px] font-semibold text-gray-500">행 수는 엔진 실집계</span>}
      >
        <div className="grid grid-cols-3 gap-2.5 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
          {DATASETS.map((d) => {
            const rows = d.rows(snap)
            const tone = d.ready >= 95 ? 'text-emerald-400' : d.ready >= 85 ? 'text-sky-400' : 'text-amber-400'
            return (
              <div key={d.name} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-bold text-gray-100">{d.name}</div>
                  <span className={`shrink-0 text-[11px] font-bold tabular-nums ${tone}`}>{d.ready}점</span>
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">{d.purpose}</div>
                <div className="mt-2.5 flex items-end gap-3">
                  <div>
                    <div className="text-[10.5px] text-gray-500">행</div>
                    <div className="text-lg font-extrabold tabular-nums text-sky-300">{fmt(rows)}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-gray-500">피처</div>
                    <div className="text-lg font-extrabold tabular-nums text-gray-200">{d.features}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[10.5px] text-gray-500">갱신</div>
                    <div className="text-[11.5px] font-bold text-gray-300">{d.refresh}</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className={`h-full rounded-full ${d.ready >= 95 ? 'bg-emerald-500' : d.ready >= 85 ? 'bg-sky-500' : 'bg-amber-500'}`} style={{ width: `${d.ready}%` }} />
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-gray-500">
                  <b className="text-gray-400">라벨</b> — {d.label}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {d.services.map((s) => (
                    <span key={s} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="스키마 고정 — 위험운전 8종이 그대로 피처 축이 된다" right={<span className="text-[11px] font-semibold text-gray-500">공단 표준 DTG 409</span>}>
        <div className="flex flex-wrap gap-1.5">
          {RISK_EVENT_TYPES.map((t) => (
            <span key={t} className="rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1 text-[11.5px] font-semibold text-gray-300">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] leading-relaxed text-gray-500">
          법정 표준 코드를 그대로 씁니다 — 자체 정의를 만들지 않으므로 <b className="text-gray-300">다른 도시·다른 사업자 데이터와도 그대로 합쳐집니다.</b>{' '}
          표준을 지키는 것이 곧 확장성입니다.
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="AI-Ready의 조건 — 무엇이 갖춰져야 학습이 되나">
          <div className="space-y-2">
            {[
              ['① 라벨이 있다', '사람(관제·담당자)의 판정이 정답으로 쌓입니다 — 승인·소명 인정·회신 확정이 곧 라벨', true],
              ['② 시점이 정확하다', '1초 단위 시각이 3소스 교차로 맞춰져 있어 인과 순서를 뒤집지 않습니다', true],
              ['③ 맥락이 붙어 있다', '같은 급감속도 폭우·정류장 접근·앞차 간격에 따라 의미가 다릅니다', true],
              ['④ 결측·이상이 걸러졌다', '품질 6룰을 통과한 데이터만 학습셋에 들어갑니다', true],
              ['⑤ 재현 가능하다', '원본 보존 + 처리 이력 → 같은 결과를 언제든 다시 만들 수 있습니다', true],
              ['⑥ 편향이 관리된다', '노선·시간대·기사군 분포를 함께 기록 — 특정 군에 치우친 학습 방지', false],
            ].map(([t, d, ok]) => (
              <div key={t as string} className="flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold ${ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {ok ? '충족' : '관리 중'}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-gray-100">{t as string}</div>
                  <div className="text-[11px] leading-relaxed text-gray-500">{d as string}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="AX 성숙도 — 지금 어디까지 왔나">
          <div className="space-y-2">
            {[
              ['L0', '산재', '시스템마다 따로 — 위치는 안내용, 기록은 제출용, 상태는 정비용', 'done'],
              ['L1', '수집', '원천을 하나의 파이프로 모음 (1차 8종 실시간)', 'done'],
              ['L2', '품질', '6개 룰 + 3중 교차검증 통과분만 적재', 'done'],
              ['L3', '온톨로지', '운행 단위 중심축으로 의미 연결 — 9개 클래스', 'done'],
              ['L4', 'AI-Ready', '라벨·맥락·재현성을 갖춘 학습셋 6종', 'now'],
              ['L5', '지식그래프 에이전트', '온톨로지를 순회해 근거 사슬로 답하는 자율 판단', 'next'],
            ].map(([lv, name, d, st]) => (
              <div
                key={lv as string}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                  st === 'now' ? 'border-sky-500/40 bg-sky-500/8' : st === 'next' ? 'border-dashed border-gray-800 bg-gray-900/30' : 'border-gray-800 bg-gray-900/50'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-black ${
                    st === 'now' ? 'bg-sky-500/20 text-sky-300' : st === 'next' ? 'bg-gray-700/40 text-gray-500' : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {lv as string}
                </span>
                <div className="min-w-0">
                  <div className={`text-[12.5px] font-bold ${st === 'next' ? 'text-gray-400' : 'text-gray-100'}`}>
                    {name as string}
                    {st === 'now' && <span className="ml-2 text-[10.5px] font-bold text-sky-400">← 현재</span>}
                    {st === 'next' && <span className="ml-2 text-[10.5px] font-bold text-gray-600">다음 단계</span>}
                  </div>
                  <div className="text-[11px] leading-relaxed text-gray-500">{d as string}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ─────────── ⑤ 서비스 연결 ─────────── */
function Lineage() {
  return (
    <div className="space-y-3">
      <Panel title="데이터 계보 — 어느 원천이 어느 화면을 움직이나">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">원천</th>
                <th className="py-2 pr-3 font-semibold">→ AI-Ready 데이터셋</th>
                <th className="py-2 pr-3 font-semibold">→ 서비스 화면</th>
                <th className="py-2 font-semibold">단계</th>
              </tr>
            </thead>
            <tbody>
              {LINEAGE.map((l) => (
                <tr key={l.ds} className="border-b border-gray-800/60">
                  <td className="py-2 pr-3 font-bold text-emerald-400">{l.src}</td>
                  <td className="py-2 pr-3 font-semibold text-gray-100">{l.ds}</td>
                  <td className="py-2 pr-3 text-gray-400">{l.svc}</td>
                  <td className="py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-bold ${stageTone[l.stage]}`}>{l.stage}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-[11.5px] leading-relaxed text-gray-500">
          계보를 기록하는 이유 — <b className="text-gray-300">어떤 화면의 숫자든 원천까지 거슬러 확인할 수 있어야</b> 의회·감사·검증기관에
          방어할 수 있습니다. 원천이 바뀌거나 품질 문제가 생기면 영향받는 서비스가 바로 특정됩니다.
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="거버넌스 — 데이터를 다루는 규칙">
          <div className="space-y-2">
            {[
              ['개인정보', '기사·승객 식별정보는 수집 단계에서 분리 보관 · 분석셋은 가명 처리', '운영 중'],
              ['보존 기간', '원본 5년(법정 운행기록) · 분석셋 3년 · 격리 로그 1년', '운영 중'],
              ['접근 권한', '시·운수사·기사 각자 자기 범위만 — 화면 단위 권한 분리', '운영 중'],
              ['감사 로그', '누가 무엇을 조회·승인·발송했는지 전량 기록', '운영 중'],
              ['불이익 결정', '평가·징계·정산 확정은 신뢰도와 무관하게 자동화하지 않음', '원칙'],
            ].map(([t, d, st]) => (
              <div key={t} className="flex items-start gap-2.5 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold ${st === '원칙' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {st}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-gray-100">{t}</div>
                  <div className="text-[11px] leading-relaxed text-gray-500">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="확장 — 데이터가 늘어도 구조는 그대로">
          <div className="space-y-2.5">
            {[
              ['2차 · 컨소시엄 자산', 'AFC·APC·민원', '수요·혼잡 축이 붙으면 배차 최적화·혼잡 안내가 열립니다', 'sky'],
              ['3차 · 대구시 소관', 'BMS·ITS·DVR', '계획-실적 대조·신호 예측·영상 안전 — 도시 통합 레이어', 'violet'],
            ].map(([t, srcs, d, tone]) => (
              <div key={t} className={`rounded-lg border border-dashed px-3 py-2.5 ${tone === 'sky' ? 'border-sky-500/40 bg-sky-500/6' : 'border-violet-500/40 bg-violet-500/6'}`}>
                <div className={`text-[12.5px] font-bold ${tone === 'sky' ? 'text-sky-300' : 'text-violet-300'}`}>{t}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-gray-400">{srcs}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{d}</div>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-[11.5px] leading-relaxed text-gray-300">
              <b className="text-emerald-400">구조를 바꾸지 않습니다.</b> 새 원천은 커넥터를 하나 추가하고 같은 중심축(운행 단위)에
              연결하면 끝 — 품질 룰·온톨로지·데이터셋 정의는 그대로 재사용됩니다. 이것이 지금 1차만으로도 시작할 수 있는 이유입니다.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
