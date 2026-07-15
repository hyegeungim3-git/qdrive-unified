import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import MapView from '../components/MapView'
import { KpiCard, Panel, simClock } from '../components/ui'
import { engine, useSim } from '../sim/store'
import { DEFAULT_ROUTES, getBisKey, setBisKey, startBis, stopBis, useBis } from '../sim/bis'
import { ROUTES } from '../sim/routes'
import { focusMap, useMapFocus } from '../sim/mapFocus'
import { setOperatorSubtabIntent } from '../sim/navIntent'
import PolicyReport from './city/PolicyReport'
import ActionCenterModal from './city/ActionCenterModal'
import { actionOwnerReadyCount } from '../components/ActionCenter'

/** 노선 계통 가동률 — 도시 전체 스케일 정적 지표(실증 3노선 라이브와 구분).
 *  9대 엔진을 도시 전체로 합성 스케일링하면 오도되므로 준공영제 계통 통계는 정적 표기. */
const NETWORK_UTIL = [
  { name: '급행', run: 92, own: 96, color: '#38bdf8' },
  { name: '간선', run: 88, own: 94, color: '#34d399' },
  { name: '지선', run: 84, own: 90, color: '#a78bfa' },
  { name: '순환', run: 90, own: 93, color: '#fbbf24' },
] as const

/* ── 위젯 커스터마이즈 (표시 여부 localStorage 유지) ── */
type WidgetId = 'ops' | 'incidents' | 'riders' | 'alerts' | 'triage' | 'network' | 'occ' | 'kpi' | 'bis' | 'routes' | 'feed'
const WIDGET_DEFS: { id: WidgetId; label: string }[] = [
  { id: 'ops', label: '운행 현황' },
  { id: 'incidents', label: '돌발정보' },
  { id: 'riders', label: '이용객 수' },
  { id: 'alerts', label: '이상 현황' },
  { id: 'triage', label: '차량 이상 트리아지' },
  { id: 'network', label: '계통 가동률' },
  { id: 'occ', label: '혼잡 추이' },
  { id: 'kpi', label: '핵심 지표' },
  { id: 'bis', label: 'BIS 실데이터' },
  { id: 'routes', label: '노선 평가·정산' },
  { id: 'feed', label: '이벤트 피드' },
]
const PREFS_KEY = 'qdrive-widgets-v1'
const DEFAULT_PREFS = Object.fromEntries(WIDGET_DEFS.map((w) => [w.id, true])) as Record<WidgetId, boolean>

function loadPrefs(): Record<WidgetId, boolean> {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/** 운행률 미니 도넛 */
function MiniDonut({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-gray-800)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(c * Math.min(100, pct)) / 100} ${c}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums text-gray-100">
        {Math.round(pct)}%
      </div>
    </div>
  )
}

const WEATHER_ICON = { 맑음: '☀️', 폭우: '🌧️', 폭염: '🥵' } as const

/** 전일 혼잡 곡선 (데모용 결정적 모의 — 실증 시 전일 실측으로 교체) */
const prevDayPct = (t: number) =>
  Math.round(Math.max(8, Math.min(92, 46 + 24 * Math.sin(t / 700 + 1.1) + 8 * Math.sin(t / 173))))

const occLevel = (pct: number) =>
  pct >= 70 ? (['혼잡', 'text-red-400'] as const) : pct >= 40 ? (['보통', 'text-amber-400'] as const) : (['여유', 'text-emerald-400'] as const)

export default function CityDashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const snap = useSim()
  const [showHeat, setShowHeat] = useState(true)
  const bis = useBis()
  const [keyInput, setKeyInput] = useState(getBisKey())
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [prefs, setPrefs] = useState<Record<WidgetId, boolean>>(loadPrefs)
  const [showPrefs, setShowPrefs] = useState(false)
  const [routeFilter, setRouteFilter] = useState<Set<string>>(new Set(DEFAULT_ROUTES))
  const [showPrevDay, setShowPrevDay] = useState(true)
  const focusTarget = useMapFocus() // 탭 간 공유 (운행 이력 등에서 설정 가능)
  const [showPolicyReport, setShowPolicyReport] = useState(false)
  const [showActionCenter, setShowActionCenter] = useState(false)

  const togglePref = (id: WidgetId) =>
    setPrefs((p) => {
      const next = { ...p, [id]: !p[id] }
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      return next
    })

  const toggleRoute = (no: string) =>
    setRouteFilter((s) => {
      const next = new Set(s)
      if (next.has(no)) next.delete(no)
      else next.add(no)
      return next
    })

  // 원인식별 단계 이상의 민원이 있으면 해당 노선 하이라이트
  const activeComplaint = snap.complaints.find((c) => c.status !== '해결')
  const highlightRouteId =
    activeComplaint && activeComplaint.status !== '접수' ? activeComplaint.routeId : null

  const { kpi } = snap
  const filteredReal = bis.buses.filter((b) => routeFilter.has(b.routeNo))

  /* ── 운행 현황 (예시 대시보드 벤치마킹) ── */
  const PLANNED = 12
  const running = snap.vehicles.length
  const maint = snap.workOrders.filter((w) => w.status === '발행됨').length
  const reserve = Math.max(0, PLANNED - running - maint - 1)
  const opRate = (running / PLANNED) * 100

  /* ── 이상 현황 집계 (최근 5분 / 누적) ── */
  const RECENT_S = 300
  const countBy = (types: string[], recentOnly: boolean) =>
    snap.events.filter(
      (e) => types.includes(e.eventType) && (!recentOnly || snap.simTime - e.simTime < RECENT_S),
    ).length
  const longDwell = snap.vehicles.filter((v) => v.dwellRemaining > 25).length
  const alertRows: { label: string; color: string; recent: number | string; total: number | string }[] = [
    { label: '급가속·급출발', color: '#f97316', recent: countBy(['급가속', '급출발'], true), total: countBy(['급가속', '급출발'], false) },
    { label: '급감속·급정지', color: '#ef4444', recent: countBy(['급감속', '급정지'], true), total: countBy(['급감속', '급정지'], false) },
    { label: '급차로·급회전', color: '#8b5cf6', recent: countBy(['급진로변경', '급앞지르기', '급좌우회전', '급유턴'], true), total: countBy(['급진로변경', '급앞지르기', '급좌우회전', '급유턴'], false) },
    { label: '장시간 정차', color: '#eab308', recent: longDwell, total: '—' },
    { label: '차량 고장 예측', color: '#f59e0b', recent: snap.fault?.predicted ? 1 : 0, total: snap.workOrders.length },
  ]

  /* ── 이용객 (엔진 승차 집계) ── */
  const cardShare = Math.round(snap.passengers * 0.85)

  /* ── 차량 이상 트리아지 (개별 차량 × OBD·DTG × 심각도 × 경과) — 엔진 실집계 ── */
  const lastEventOf = (id: string) => snap.events.find((e) => e.vehicleId === id)
  const agoText = (t: number) => {
    const s = Math.max(0, Math.round(snap.simTime - t))
    return s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`
  }
  type Triage = { id: string; driver: string; sev: '위험' | '주의' | '정보'; src: string; reason: string; ago: string; order: number }
  const triage: Triage[] = snap.vehicles
    .map((v): Triage | null => {
      const last4 = v.id.slice(-4)
      // 위험 — OBD 고장 예측 발화
      if (snap.fault?.vehicleId === v.id && snap.fault.predicted) {
        return { id: last4, driver: v.driverName, sev: '위험', src: 'OBD', reason: `${snap.fault.kind} 예측 (냉각수 ${Math.round(snap.fault.coolantTemp)}°C)`, ago: agoText(snap.fault.startedAt), order: 0 }
      }
      // 주의 — 최근 2분 내 위험운전 이벤트
      const ev = lastEventOf(v.id)
      if (ev && snap.simTime - ev.simTime < 120 && !ev.justified) {
        return { id: last4, driver: v.driverName, sev: '주의', src: 'DTG', reason: `${ev.eventType} ${ev.speedKmh}km/h`, ago: agoText(ev.simTime), order: 1 }
      }
      // 정보 — 안전점수 저하
      if (v.score < 72) {
        return { id: last4, driver: v.driverName, sev: '정보', src: 'DTG', reason: `안전점수 ${Math.round(v.score)}점 — 코칭 대상`, ago: '집계 중', order: 2 }
      }
      return null
    })
    .filter((x): x is Triage => x !== null)
    .sort((a, b) => a.order - b.order)
  const SEV_CLS = {
    위험: 'bg-red-500/20 text-red-300 border-red-500/40',
    주의: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    정보: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  } as const

  /* ── AI 3카드 (운행·안전·정비 맥락) — 엔진 파생 ── */
  const worstVeh = [...snap.vehicles].sort((a, b) => a.score - b.score)[0]
  const aiCards = [
    {
      key: 'insight',
      icon: '📊',
      label: 'AI 운행 인사이트',
      tone: 'text-sky-300',
      body: `연료 절감 ${kpi.fuelSavedPct.toFixed(1)}% · 예비차 ${reserve}대 여유`,
      hint: `현재 ${running}대 운행 · 결행 0건 — 정상 범위`,
      go: () => onNavigate?.('carbon'),
    },
    {
      key: 'coach',
      icon: '🎯',
      label: 'AI 안전 코치',
      tone: 'text-amber-300',
      body: worstVeh ? `${worstVeh.id.slice(-4)}호 ${Math.round(worstVeh.score)}점 우선 코칭` : '전 차량 양호',
      hint: `평균 안전점수 ${kpi.avgScore.toFixed(1)}점 · 위험운전 ${kpi.totalEvents}건`,
      go: () => onNavigate?.('driver'),
    },
    {
      key: 'forecast',
      icon: '🔧',
      label: 'AI 정비 예측',
      tone: snap.fault?.predicted ? 'text-red-300' : 'text-emerald-300',
      body: snap.fault?.predicted ? `${snap.fault.vehicleId.slice(-4)}호 ${snap.fault.kind} 예측` : '예측 이상 없음',
      hint: snap.fault?.predicted ? '진단 스캐너에서 센서 확인 →' : `정비 입고 ${maint}대 · 예지정비 정상`,
      go: () => {
        setOperatorSubtabIntent('scanner')
        onNavigate?.('operator')
      },
    },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      {showPolicyReport && <PolicyReport onClose={() => setShowPolicyReport(false)} />}
      {showActionCenter && <ActionCenterModal onClose={() => setShowActionCenter(false)} />}

      {/* ── 성과 리본 (전폭) — 탄소·연료 라이브 성과 앵커 + 탄소중립 분석 딥링크 ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-gray-900/40 to-gray-900/40 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          오늘의 탄소·연료 성과
        </span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="text-[12px] text-gray-400">
            연료 절감 <b className="text-base tabular-nums text-emerald-400">{kpi.fuelSavedPct.toFixed(1)}%</b>
          </span>
          <span className="text-[12px] text-gray-400">
            CO₂ 절감 <b className="text-base tabular-nums text-emerald-400">{kpi.totalCo2SavedKg.toFixed(1)}<span className="text-xs">kg</span></b>
          </span>
          <span className="text-[12px] text-gray-400">
            평균 안전점수 <b className="text-base tabular-nums text-sky-300">{kpi.avgScore.toFixed(1)}<span className="text-xs">점</span></b>
          </span>
          <span className="text-[12px] text-gray-400">
            주행 <b className="text-base tabular-nums text-gray-200">{kpi.totalDistanceKm.toFixed(1)}<span className="text-xs">km</span></b>
          </span>
        </div>
        <button
          onClick={() => onNavigate?.('carbon')}
          className="ml-auto whitespace-nowrap rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[12px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25"
        >
          🌱 탄소중립 분석에서 성과 증명 →
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
      {/* ── 좌: 운영 통계 (신규) ── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        {/* 조치함 — 구 AI 업무센터의 대구시 업무 (민원소명·시의회답변·탄소보고서) */}
        <button
          onClick={() => setShowActionCenter(true)}
          className="flex w-full items-center justify-between rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-left text-[11px] font-bold text-violet-300 hover:bg-violet-500/20"
        >
          <span>📋 업무함</span>
          {actionOwnerReadyCount('대구시', snap) > 0 && (
            <span className="rounded-full bg-violet-500/30 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">
              {actionOwnerReadyCount('대구시', snap)}건 승인 대기
            </span>
          )}
        </button>
        {/* AI 정책 보고서 */}
        <button
          onClick={() => setShowPolicyReport(true)}
          className="w-full rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-left text-[11px] font-bold text-violet-300 hover:bg-violet-500/20"
        >
          📑 AI 정책 보고서 <span className="float-right font-normal text-violet-400/60">전 데이터 총괄 · 자동 생성</span>
        </button>
        {/* 위젯 구성 */}
        <div className="relative">
          <button
            onClick={() => setShowPrefs((s) => !s)}
            className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-left text-[11px] font-semibold text-gray-400 hover:text-gray-200"
          >
            ⚙ 위젯 구성 <span className="float-right text-gray-600">{showPrefs ? '▲' : '▼'}</span>
          </button>
          {showPrefs && (
            <div className="absolute inset-x-0 top-9 z-[1200] rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-2xl">
              {WIDGET_DEFS.map((w) => (
                <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800">
                  <input type="checkbox" checked={prefs[w.id]} onChange={() => togglePref(w.id)} className="h-3 w-3 accent-sky-500" />
                  {w.label}
                </label>
              ))}
              <div className="mt-1 border-t border-gray-800 px-2 pt-1 text-[9px] text-gray-600">선택은 브라우저에 저장됩니다</div>
            </div>
          )}
        </div>

        {prefs.ops && (
          <Panel title="🚌 운행 현황" right={<span className="text-[10px] text-gray-500">계획 {PLANNED}대</span>}>
            <div className="flex items-center gap-3">
              <MiniDonut pct={opRate} />
              <div className="grid flex-1 grid-cols-2 gap-1 text-center text-[11px]">
                <div className="rounded-md bg-sky-500/10 py-1.5">
                  <div className="text-base font-extrabold tabular-nums text-sky-300">{running}</div>
                  <div className="text-[9px] text-gray-500">운행 중</div>
                </div>
                <div className="rounded-md bg-gray-800/60 py-1.5">
                  <div className="text-base font-extrabold tabular-nums text-gray-300">{reserve}</div>
                  <div className="text-[9px] text-gray-500">예비 대기</div>
                </div>
                <div className={`rounded-md py-1.5 ${maint > 0 ? 'bg-amber-500/10' : 'bg-gray-800/60'}`}>
                  <div className={`text-base font-extrabold tabular-nums ${maint > 0 ? 'text-amber-400' : 'text-gray-300'}`}>{maint}</div>
                  <div className="text-[9px] text-gray-500">정비 입고</div>
                </div>
                <div className="rounded-md bg-gray-800/60 py-1.5">
                  <div className="text-base font-extrabold tabular-nums text-emerald-400">0</div>
                  <div className="text-[9px] text-gray-500">결행</div>
                </div>
              </div>
            </div>
          </Panel>
        )}

        {prefs.incidents && (
          <Panel
            title="🚨 돌발정보"
            right={
              <span className="text-[10px] text-gray-500">
                진행 {snap.incidents.filter((i) => i.status !== '완료').length}건
              </span>
            }
          >
            <div className="grid grid-cols-4 gap-1 text-center">
              {(
                [
                  ['사고', '#ef4444'],
                  ['고장', '#f59e0b'],
                  ['공사', '#6b7280'],
                  ['기타', '#6366f1'],
                ] as const
              ).map(([kind, color]) => {
                const occur = snap.incidents.filter((i) => i.kind === kind && i.status === '발생').length
                const doing = snap.incidents.filter((i) => i.kind === kind && i.status === '처리중').length
                return (
                  <div key={kind} className="rounded-md px-1 py-1.5" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
                    <div className="text-[10px] font-bold" style={{ color }}>
                      {kind}
                    </div>
                    <div className="mt-0.5 text-[9px] leading-tight text-gray-400">
                      발생 <b className={occur > 0 ? 'text-red-400' : 'text-gray-300'}>{occur}</b>
                      <br />
                      처리중 <b className="text-gray-300">{doing}</b>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-1.5 space-y-1">
              {snap.incidents
                .filter((i) => i.status !== '완료')
                .slice(0, 4)
                .map((i) => (
                  <button
                    key={i.id}
                    onClick={() => i.lat != null && focusMap(i.lat, i.lng!, `${i.kind} 지점`)}
                    disabled={i.lat == null}
                    className={`flex w-full items-center gap-1.5 rounded-md bg-gray-800/40 px-2 py-1 text-left text-[10px] ${
                      i.lat != null ? 'hover:bg-gray-800' : 'cursor-default'
                    }`}
                    title={i.lat != null ? '클릭하면 지도에서 위치 확인' : undefined}
                  >
                    <span
                      className={`shrink-0 rounded px-1 font-bold ${
                        i.status === '발생' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/15 text-amber-400'
                      }`}
                    >
                      {i.status}
                    </span>
                    <span className="truncate text-gray-300">{i.title}</span>
                    {i.lat != null && <span className="ml-auto shrink-0 text-gray-600">📍</span>}
                  </button>
                ))}
              {snap.incidents.every((i) => i.status === '완료') && (
                <div className="py-1 text-center text-[10px] text-gray-600">진행 중인 돌발상황 없음</div>
              )}
            </div>
          </Panel>
        )}

        {prefs.riders && (
          <Panel title="🧍 이용객 수" right={<span className="text-[10px] text-gray-500">오늘 누적</span>}>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-extrabold tracking-tight tabular-nums text-gray-100">
                {snap.passengers.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-gray-500">명</span>
              </span>
              <span className="pb-1 text-[10px] font-semibold text-emerald-400">▲ 10.5% 전일比*</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[11px]">
              <div className="rounded-md bg-gray-800/50 py-1.5">
                <div className="font-bold tabular-nums text-gray-200">{cardShare.toLocaleString()}</div>
                <div className="text-[9px] text-gray-500">교통카드</div>
              </div>
              <div className="rounded-md bg-gray-800/50 py-1.5">
                <div className="font-bold tabular-nums text-gray-200">{(snap.passengers - cardShare).toLocaleString()}</div>
                <div className="text-[9px] text-gray-500">현금·기타</div>
              </div>
            </div>
            <div className="mt-1.5 text-[9px] text-gray-600">* 전일 대비는 데모 추정치 · 실증 시 AFC 연동</div>
          </Panel>
        )}

        {prefs.alerts && (
          <Panel title="⚠️ 이상 현황" right={<span className="text-[10px] text-gray-500">최근 5분 / 누적</span>}>
            <div className="space-y-1">
              {alertRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between rounded-md bg-gray-800/40 px-2.5 py-1.5 text-[11px]">
                  <span className="flex items-center gap-1.5 text-gray-300">
                    <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
                    {r.label}
                  </span>
                  <span className="tabular-nums text-gray-400">
                    <b className={Number(r.recent) > 0 ? 'text-red-400' : 'text-gray-300'}>{r.recent}</b>
                    <span className="mx-1 text-gray-600">/</span>
                    {r.total}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* 차량 이상 트리아지 — 개별 차량 × OBD·DTG × 심각도 × 경과 (엔진 실집계) */}
        {prefs.triage && (
          <Panel
            title="🩺 차량 이상 트리아지"
            right={
              <span className="text-[10px] text-gray-500">
                {triage.length > 0 ? `${triage.length}건 조치 대상` : '전 차량 정상'}
              </span>
            }
          >
            {triage.length > 0 ? (
              <div className="space-y-1">
                {triage.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md bg-gray-800/40 px-2.5 py-1.5 text-[11px]">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${SEV_CLS[t.sev]}`}>{t.sev}</span>
                    <span className="shrink-0 font-mono text-gray-300">{t.id}호</span>
                    <span className="min-w-0 flex-1 truncate text-gray-400" title={`${t.driver} 기사 · ${t.reason}`}>
                      {t.reason}
                    </span>
                    <span className="shrink-0 rounded bg-gray-900/70 px-1 py-0.5 text-[8px] font-bold text-gray-500">{t.src}</span>
                    <span className="shrink-0 text-[9px] tabular-nums text-gray-600">{t.ago}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 text-center text-[10px] text-gray-600">
                OBD·DTG 실시간 감시 중 — 이상 감지 시 심각도별로 표시돼요
              </div>
            )}
          </Panel>
        )}

        {/* 계통별 가동률 — 도시 전체 준공영제 스케일 (정적) */}
        {prefs.network && (
          <Panel title="🚦 계통별 가동률" right={<span className="text-[10px] text-gray-500">운행/보유 · 도시 전체*</span>}>
            <div className="space-y-2">
              {NETWORK_UTIL.map((n) => (
                <div key={n.name}>
                  <div className="mb-0.5 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-gray-300">
                      <span className="h-2 w-2 rounded-sm" style={{ background: n.color }} />
                      {n.name}
                    </span>
                    <span className="tabular-nums text-gray-400">
                      <b className="text-gray-200">{n.run}</b>
                      <span className="text-gray-600"> / {n.own}대</span>
                      <span className="ml-1 text-[10px] text-gray-500">({Math.round((n.run / n.own) * 100)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <div className="h-full rounded-full" style={{ width: `${(n.run / n.own) * 100}%`, background: n.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 text-[9px] text-gray-600">* 도시 전체 계통 통계(준공영제) · 3노선 실증은 지도·랭킹에서 라이브</div>
          </Panel>
        )}

        {prefs.occ &&
          (() => {
            const occData = snap.occHistory.map((d) => ({
              time: simClock(d.t),
              오늘: d.pct,
              전일: prevDayPct(d.t),
            }))
            const lastPct = snap.occHistory.length ? snap.occHistory[snap.occHistory.length - 1].pct : null
            const [levelLabel, levelCls] = lastPct != null ? occLevel(lastPct) : ['—', 'text-gray-500']
            return (
              <Panel
                title="📈 혼잡 추이"
                right={
                  <button
                    onClick={() => setShowPrevDay((s) => !s)}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      showPrevDay ? 'bg-sky-500/20 text-sky-300' : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    전일 비교 {showPrevDay ? 'ON' : 'OFF'}
                  </button>
                }
              >
                <div className="h-32">
                  {snap.occHistory.length > 2 ? (
                    <ResponsiveContainer>
                      <AreaChart data={occData} margin={{ top: 6, right: 2, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--color-gray-800)" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 9, fill: 'var(--color-gray-600)' }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={32}
                        />
                        <YAxis
                          domain={[0, 100]}
                          ticks={[0, 40, 70, 100]}
                          tick={{ fontSize: 9, fill: 'var(--color-gray-600)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RTooltip
                          contentStyle={{
                            background: 'var(--color-gray-900)',
                            border: '1px solid var(--color-gray-700)',
                            borderRadius: 8,
                            fontSize: 10,
                            padding: '4px 8px',
                          }}
                          labelStyle={{ color: 'var(--color-gray-400)' }}
                        />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.35} />
                        <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.3} />
                        {showPrevDay && (
                          <Area
                            type="monotone"
                            dataKey="전일"
                            unit="%"
                            stroke="#94a3b8"
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            fill="none"
                            dot={false}
                            isAnimationActive={false}
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="오늘"
                          unit="%"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          fill="url(#occFill)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5">
                      <div className="h-1.5 w-2/3 animate-pulse rounded-full bg-gray-800" />
                      <div className="text-[10px] text-gray-600">수집 중 — 30초 간격 평균 재차율 (배속을 올리면 빨라져요)</div>
                    </div>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-2 text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-3 rounded-full bg-sky-400" /> 오늘
                    </span>
                    {showPrevDay && (
                      <span className="flex items-center gap-1">
                        <span className="h-0 w-3 border-t border-dashed border-gray-400" /> 전일*
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-gray-400">
                    현재 <b className="text-gray-200">{lastPct ?? '—'}%</b>{' '}
                    <b className={levelCls}>{levelLabel}</b>
                  </span>
                </div>
              </Panel>
            )
          })()}
      </div>

      {/* ── 중: 지도 ── */}
      <div className="relative min-h-0 max-lg:min-h-[360px]">
        <MapView
          vehicles={snap.vehicles}
          events={snap.events}
          showHeat={showHeat}
          highlightRouteId={highlightRouteId}
          realBuses={filteredReal}
          incidents={snap.incidents}
          focusTarget={focusTarget}
        />
        {/* 날씨 칩 */}
        <div className="absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-md border border-gray-800 bg-gray-900/90 px-3 py-1.5 text-xs text-gray-300">
          {WEATHER_ICON[snap.weather.condition]} {snap.weather.tempC}°C
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">대구광역시 · {simClock(snap.simTime)}</span>
        </div>
        <button
          onClick={() => setShowHeat((s) => !s)}
          className={`absolute right-3 top-3 z-[1000] rounded-md border px-3 py-1.5 text-xs font-semibold shadow-lg ${
            showHeat
              ? 'border-red-500/40 bg-red-500/20 text-red-300'
              : 'border-gray-700 bg-gray-900/90 text-gray-400'
          }`}
        >
          🔥 위험운전 히트맵 {showHeat ? 'ON' : 'OFF'}
        </button>
        {/* 실차 노선 필터 */}
        {bis.status === 'ok' && (
          <div className="absolute right-3 top-12 z-[1000] flex flex-col items-end gap-1">
            {DEFAULT_ROUTES.map((no) => {
              const cnt = bis.buses.filter((b) => b.routeNo === no).length
              const on = routeFilter.has(no)
              return (
                <button
                  key={no}
                  onClick={() => toggleRoute(no)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow ${
                    on ? 'border-sky-500/50 bg-sky-500/20 text-sky-300' : 'border-gray-700 bg-gray-900/90 text-gray-600'
                  }`}
                >
                  실 {no} {cnt}
                </button>
              )
            })}
          </div>
        )}
        <div className="absolute bottom-3 left-3 z-[1000] flex gap-3 rounded-md border border-gray-800 bg-gray-900/90 px-3 py-2 text-[11px]">
          {ROUTES.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5 text-gray-300">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.name}
            </span>
          ))}
        </div>
      </div>

      {/* ── 우: 기존 패널 ── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        {prefs.kpi && (
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="운행 차량" value={String(snap.vehicles.length)} unit="대" sub="3개 노선 실증" />
            <KpiCard
              label="총 주행거리"
              value={kpi.totalDistanceKm.toFixed(1)}
              unit="km"
              sub="오늘 누적"
            />
            <KpiCard
              label="연료 절감률"
              value={kpi.fuelSavedPct.toFixed(1)}
              unit="%"
              sub="기준선 대비 (코칭 효과)"
              accent="text-emerald-400"
            />
            <KpiCard
              label="CO₂ 절감"
              value={kpi.totalCo2SavedKg.toFixed(1)}
              unit="kg"
              sub="탄소중립 기여"
              accent="text-emerald-400"
            />
          </div>
        )}

        {/* AI 3카드 — 운행·안전·정비 맥락 요약 (엔진 파생, 각 카드 해당 화면 딥링크) */}
        {prefs.kpi && (
          <div className="grid grid-cols-3 gap-2">
            {aiCards.map((c) => (
              <button
                key={c.key}
                onClick={c.go}
                className="flex flex-col rounded-xl border border-gray-800 bg-gray-900/60 px-2.5 py-2 text-left transition-colors hover:border-gray-700 hover:bg-gray-800/60"
                title={c.hint}
              >
                <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                  <span className="text-xs">{c.icon}</span>
                  <span className="truncate">{c.label}</span>
                </span>
                <span className={`mt-1 text-[11px] font-semibold leading-tight ${c.tone}`}>{c.body}</span>
                <span className="mt-auto pt-1 text-[9px] leading-tight text-gray-600">{c.hint}</span>
              </button>
            ))}
          </div>
        )}

        {/* BIS 실데이터 연동 (TAGO 오픈API) */}
        {prefs.bis && (
          <Panel
            title="📡 대구 BIS 실데이터"
            right={
              bis.status === 'ok' ? (
                <span className="text-[11px] font-bold text-sky-400">
                  ● 실차 {bis.buses.length}대 수신 중
                </span>
              ) : (
                <span className="text-[11px] text-gray-500">TAGO 오픈API · 15초 갱신</span>
              )
            }
          >
            <div className="space-y-2 text-xs">
              {bis.status === 'idle' &&
                (import.meta.env.DEV ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-gray-500">
                      실제 대구 버스({DEFAULT_ROUTES.join('·')}) 위치를 지도에 오버레이
                    </span>
                    <button
                      onClick={() => (getBisKey() ? startBis() : setShowKeyForm(true))}
                      className="shrink-0 whitespace-nowrap rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-500"
                    >
                      연동 시작
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-gray-500">
                      실제 대구 버스({DEFAULT_ROUTES.join('·')}) 위치를 지도에 오버레이 — 프록시 경유, 키 입력 불필요
                    </span>
                    <button
                      onClick={() => startBis()}
                      className="shrink-0 whitespace-nowrap rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-500"
                    >
                      연동 시작
                    </button>
                  </div>
                ))}
              {bis.status === 'loading' && <div className="text-sky-300">⏳ {bis.message || '연결 중…'}</div>}
              {bis.status === 'ok' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-gray-400">
                    {bis.matchedRoutes.join(' · ')} — 지도에서 <b className="text-sky-400">아웃라인 버스</b>가
                    실차 (시뮬레이션과 나란히 표시)
                  </span>
                  <button
                    onClick={stopBis}
                    className="shrink-0 whitespace-nowrap rounded-md border border-gray-700 px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-200"
                  >
                    중지
                  </button>
                </div>
              )}
              {bis.status === 'error' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-red-400">⚠ {bis.message}</span>
                  {import.meta.env.DEV ? (
                    <button
                      onClick={() => setShowKeyForm(true)}
                      className="shrink-0 rounded-md border border-gray-700 px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-200"
                    >
                      키 설정
                    </button>
                  ) : (
                    <button
                      onClick={() => startBis()}
                      className="shrink-0 rounded-md border border-gray-700 px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-200"
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              )}
              {import.meta.env.DEV && (showKeyForm || (bis.status === 'error' && !getBisKey())) && (
                <div className="flex gap-2">
                  <input
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="공공데이터포털 일반 인증키 (data.go.kr 발급)"
                    className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setBisKey(keyInput)
                      setShowKeyForm(false)
                      startBis()
                    }}
                    className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-500"
                  >
                    저장·시작
                  </button>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* 날씨/행사 기반 수요·지연·사고위험 예측 */}
        {snap.weather.condition !== '맑음' && (
          <Panel
            title={`${snap.weather.condition === '폭우' ? '🌧️' : '🥵'} ${snap.weather.condition} — AI 수요·지연 예측`}
            className="border-indigo-500/30"
          >
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-gray-800/50 py-2">
                <div className="text-lg font-bold text-amber-400">+{snap.weather.delayForecastMin}분</div>
                <div className="text-[10px] text-gray-500">노선 평균 지연 예상</div>
              </div>
              <div className="rounded-md bg-gray-800/50 py-2">
                <div className="text-lg font-bold text-sky-400">
                  {snap.weather.demandDeltaPct > 0 ? '+' : ''}
                  {snap.weather.demandDeltaPct}%
                </div>
                <div className="text-[10px] text-gray-500">수요 변동 예측</div>
              </div>
              <div className="rounded-md bg-gray-800/50 py-2">
                <div className="text-lg font-bold text-red-400">{snap.weather.condition === '폭우' ? '높음' : '보통'}</div>
                <div className="text-[10px] text-gray-500">사고위험 등급</div>
              </div>
            </div>
            {snap.weather.condition === '폭우' && (
              <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-red-300/80">
                ⚠ 사고위험 예측: 18~20시 급행1 반월당~범어 구간 — 사유: 강우 + 정체 + 과거 급감속 빈도.
                해당 구간 기사 태블릿에 감속 지침 자동 표출 · 차고지 예비차 선배정 권고
              </div>
            )}
          </Panel>
        )}

        {/* 민원 처리 — 데모 킬러 장면 */}
        {snap.complaints.length > 0 && (
          <Panel title="📢 시민 민원" className="border-violet-500/30">
            {snap.complaints.map((c) => (
              <div key={c.id} className="mb-2 last:mb-0">
                <div className="text-xs leading-relaxed text-gray-300">"{c.text}"</div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-1">
                    {(['접수', '원인식별', '조치중', '해결'] as const).map((s, i) => {
                      const order = ['접수', '원인식별', '조치중', '해결']
                      const done = order.indexOf(c.status) >= i
                      return (
                        <span
                          key={s}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            done ? 'bg-violet-500/20 text-violet-300' : 'bg-gray-800 text-gray-600'
                          }`}
                        >
                          {s}
                        </span>
                      )
                    })}
                  </div>
                  {c.status !== '해결' && (
                    <button
                      onClick={() => engine.advanceComplaint(c.id)}
                      className="rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-500"
                    >
                      {c.status === '접수' ? '데이터로 원인 확인 →' : '다음 단계 →'}
                    </button>
                  )}
                </div>
                {c.evidence && c.status !== '접수' && (
                  <div className="mt-2 rounded-md border border-violet-500/20 bg-violet-500/5 px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-violet-300">
                        🤖 조사 에이전트 — 증빙 자동매칭
                      </span>
                      <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                        사실 가능성 {c.evidence.aiScore}%
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {c.evidence.timeline.map((t) => (
                        <div key={t.label} className="flex gap-1.5 text-[10px] leading-relaxed">
                          <span className={t.warn ? 'text-red-400' : 'text-emerald-400'}>
                            {t.warn ? '⚠' : '✓'}
                          </span>
                          <span>
                            <b className="text-gray-300">{t.label}</b>
                            <span className="text-gray-500"> — {t.detail}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 text-[10px] text-gray-500">
                      → 차량 <b className="text-gray-300">{c.evidence.vehicleId.slice(-4)}호</b> (
                      {c.evidence.driverName} 기사) 식별 · 기사 앱 실시간 코칭 발송
                    </div>
                    {(c.status === '조치중' || c.status === '해결') && (
                      <div className="mt-1.5 rounded bg-gray-800/60 px-2 py-1.5 text-[10px] leading-relaxed text-gray-400">
                        ✉️ <b className="text-gray-300">답변 초안 (담당자 검토 후 발송)</b>:{' '}
                        {c.evidence.draftReply}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </Panel>
        )}

        {/* 노선 평가 (준공영제 과학행정) */}
        {prefs.routes && (
          <Panel title="노선 평가 · 준공영제 정산 검증" right={<span className="text-[11px] text-gray-500">DTG 실주행 검증 · BMS는 3차 고도화</span>}>
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-[10px] text-gray-500">
                  <th className="pb-1.5 font-medium">노선</th>
                  <th className="pb-1.5 font-medium">정시율</th>
                  <th className="pb-1.5 font-medium">평균 안전점수</th>
                  <th className="pb-1.5 font-medium">위험운전</th>
                </tr>
              </thead>
              <tbody>
                {ROUTES.map((r, ri) => {
                  const buses = snap.vehicles.filter((v) => v.routeId === r.id)
                  const avg = buses.reduce((s, v) => s + v.score, 0) / buses.length
                  const ev = snap.events.filter((e) => buses.some((b) => b.id === e.vehicleId)).length
                  return (
                    <tr key={r.id} className="border-t border-gray-800/50">
                      <td className="py-1.5">
                        <span className="flex items-center gap-1.5 text-gray-300">
                          <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                          {r.name}
                        </span>
                      </td>
                      <td className="py-1.5 tabular-nums text-gray-400">{[96.2, 93.8, 95.1][ri]}%</td>
                      <td className="py-1.5 tabular-nums text-gray-400">{avg.toFixed(1)}점</td>
                      <td className={`py-1.5 tabular-nums ${ev > 8 ? 'text-red-400' : 'text-gray-400'}`}>{ev}건</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {snap.trips.length > 4 && (
              <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-300/80">
                ⚠ 정산 검증 에이전트: 5563호 3회차 — 배차기록상 정상운행, DTG 위치이력상 인가노선{' '}
                <b>87% 운행</b>. 검토 필요 (최종 판단: 담당자)
              </div>
            )}
            <div className="mt-1.5 text-[9px] leading-relaxed text-gray-600">
              정산검증은 <b className="text-gray-500">DTG 실주행 이력(1차 · 오큐브 자산)</b>만으로 인가노선 준수를 증명해요 —
              배차기록(BMS) 실연동은 3차(대구시 소관)에서 고도화. 현재는 로직 시연.
            </div>
          </Panel>
        )}

        {/* 실시간 이벤트 피드 */}
        {prefs.feed && (
          <Panel
            title="위험운전 실시간 피드"
            right={<span className="text-[11px] text-gray-500">공단 409 패킷 · 총 {kpi.totalEvents}건</span>}
            className="min-h-0 flex-1"
          >
            {/* 하단 pb-10: 우하단 AI Q 플로팅 버튼에 마지막 행이 가리지 않도록 여백 확보 */}
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pb-10 pr-1">
              {snap.events.slice(0, 30).map((e, i) => {
                const ok = e.justified
                const fast = e.speedKmh >= 50
                return (
                  <div
                    key={`${e.vehicleId}-${e.simTime}-${i}`}
                    className={`flex items-center gap-2 rounded-md border-l-2 py-1.5 pl-2 pr-2.5 text-[11px] ${
                      ok ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-red-500/60 bg-gray-800/40'
                    }`}
                  >
                    <span className={`flex w-[74px] shrink-0 items-center gap-1 font-semibold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {ok && <span title={e.justifyReason}>🛡</span>}
                      <span className="truncate">{e.eventType}</span>
                    </span>
                    <span className="w-[46px] shrink-0 font-mono text-gray-300">{e.vehicleId.slice(-4)}호</span>
                    <span className={`flex-1 text-right tabular-nums ${fast ? 'font-semibold text-amber-300' : 'text-gray-300'}`}>
                      {e.speedKmh}
                      <span className="text-gray-500"> km/h</span>
                    </span>
                    <span className="w-[38px] shrink-0 text-right font-mono text-gray-500">{simClock(e.simTime)}</span>
                  </div>
                )
              })}
              {snap.events.length === 0 && (
                <div className="py-6 text-center text-xs text-gray-600">
                  아직 위험운전 이벤트가 없어요 — 배속을 올리면 쌓입니다
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>
      </div>
    </div>
  )
}
