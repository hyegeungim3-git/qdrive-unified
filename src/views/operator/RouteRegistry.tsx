import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Panel, KpiCard } from '../../components/ui'
import { useSim } from '../../sim/store'
import { ROUTES } from '../../sim/routes'

/**
 * 🛣️ 노선 관리 — 원본 탄소 플랫폼 「노선 관리(dash R)」 이식.
 * B그룹(🚌 차량 관리)·C그룹(👥 기사 관리)과 대칭인 세 번째 자산 렌즈 — 감사 시 누락됐던 항목을
 * 사용자 지적으로 복원. 정책 제안(policyProps)은 이미 시티 대시보드 AI 정책 보고서로 이관돼
 * 있으므로 여기서 재현하지 않는다.
 * 스케일 분리: 대구시 노선망(예시 데이터, 정적) ⊃ 실증 3개 노선(엔진 라이브).
 */

const chartTheme = {
  grid: 'var(--color-gray-800)',
  tick: { fill: 'var(--color-gray-500)', fontSize: 11, fontWeight: 600 },
  tooltip: {
    contentStyle: { background: '#191f28', border: '1px solid #374151', borderRadius: 8, fontSize: 12, color: '#fff' },
    labelStyle: { color: '#cbd5e1' },
    itemStyle: { color: '#e5e7eb' },
  },
}

/** 도시 전체 노선망 KPI (정적 예시 — 원본 대장 그대로) */
const NETWORK_KPI = {
  totalRoutes: 128,
  byType: '급행 12 · 간선 58 · 지선 46 · 순환 12',
  dailyTrips: 4820,
  dailyKm: 68400,
  onTimeRate: 87.2,
  onTimeDelta: '+0.8%p',
  lowEfficiency: 9,
} as const

/** 노선별 통계 예시 대장(정적 6행) — 원본 그대로, 실증 3노선과 노선명이 겹치지 않는 표본 포함 */
type RouteRow = { no: string; seg: string; trips: string; pax: string; eff: string; co2: string; grade: 'A' | 'B' | 'C' }
const ROUTE_STATS: RouteRow[] = [
  { no: '간선 401', seg: '반월당 ↔ 칠곡경대병원', trips: '118회', pax: '14,260명', eff: '34.8L', co2: '0.92kg', grade: 'A' },
  { no: '간선 649', seg: '성서공단 ↔ 대구역', trips: '96회', pax: '11,830명', eff: '38.1L', co2: '1.03kg', grade: 'B' },
  { no: '순환 3-1', seg: '범어네거리 순환', trips: '88회', pax: '7,940명', eff: '41.5L', co2: '1.12kg', grade: 'B' },
  { no: '지선 356', seg: '두류역 ↔ 시지지구', trips: '74회', pax: '5,210명', eff: '46.9L', co2: '1.28kg', grade: 'C' },
  { no: '급행 5', seg: '대구공항 ↔ 계명대', trips: '64회', pax: '4,080명', eff: '49.3L', co2: '1.34kg', grade: 'C' },
]
const GRADE_CLS: Record<RouteRow['grade'], string> = {
  A: 'bg-emerald-500/15 text-emerald-400',
  B: 'bg-sky-500/15 text-sky-300',
  C: 'bg-amber-500/15 text-amber-400',
}

/** 실증 3노선 정시율(정적) — CityDashboard '노선 평가·정산' 패널과 동일 값으로 정합(단일 소스 재사용) */
const LIVE_ON_TIME = [96.2, 93.8, 95.1]

/** 계통별 월간 수송 인원(정적, 만명) — 원본 그대로. 엔진은 급행·순환만 존재하고 간선·지선이 없어
 *  4계통 전체를 라이브로 못 만듦(스케일 불일치) — VehicleRegistry/DriverRegistry와 동일 원칙으로 정적 유지 */
const RIDERSHIP = [
  { name: '급행', v: 128.4, color: '#38bdf8' },
  { name: '간선', v: 214.6, color: '#38bdf8' },
  { name: '지선', v: 96.2, color: '#38bdf8' },
  { name: '순환', v: 42.8, color: '#38bdf8' },
]

function StaticChip() {
  return <span className="shrink-0 rounded bg-gray-700/60 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">대구시 노선망 · 예시 데이터</span>
}
function LiveChip() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      실증 {ROUTES.length}개 노선 · 실시간
    </span>
  )
}

export default function RouteRegistry() {
  const snap = useSim()

  // 실증 3노선 라이브 파생 — 기존 필드만(엔진/타입 확장 0)
  const liveRoutes = ROUTES.map((r, ri) => {
    const buses = snap.vehicles.filter((v) => v.routeId === r.id)
    const avgScore = buses.length ? buses.reduce((s, v) => s + v.score, 0) / buses.length : 0
    const evCount = snap.events.filter((e) => buses.some((b) => b.id === e.vehicleId)).length
    const distanceKm = buses.reduce((s, v) => s + v.distanceKm, 0)
    const fuelM3 = buses.reduce((s, v) => s + v.fuelM3, 0)
    const effKmPerM3 = fuelM3 > 0 ? distanceKm / fuelM3 : 0
    return { route: r, onTime: LIVE_ON_TIME[ri] ?? 95, avgScore, evCount, distanceKm, fuelM3, effKmPerM3, busCount: buses.length }
  })
  const liveAvgOnTime = liveRoutes.reduce((s, r) => s + r.onTime, 0) / (liveRoutes.length || 1)
  const worstEff = [...liveRoutes].sort((a, b) => a.effKmPerM3 - b.effKmPerM3)[0]

  const effChartData = liveRoutes.map((r) => ({ name: r.route.name, eff: +r.effKmPerM3.toFixed(2), color: r.route.color }))

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-gray-100">🛣️ 노선 관리</div>
          <div className="text-xs text-gray-500">노선 정보와 운행 데이터, 노선 효율을 분석해요 · 정책 제안은 시티 대시보드 AI 정책 보고서에서</div>
        </div>
        <span className="text-[10px] text-gray-600">
          대구시 노선망 128개(예시) · <b className="text-emerald-400">실증 {ROUTES.length}개 노선 라이브</b>
        </span>
      </div>

      {/* A. 노선망 KPI 4카드 — 정적 헤드라인 + 실증 라이브 각주 */}
      <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        <KpiCard label="운영 노선" value={String(NETWORK_KPI.totalRoutes)} unit="개" sub={`${NETWORK_KPI.byType} · 실증 ${ROUTES.length}개 라이브`} />
        <KpiCard label="일 평균 운행" value={NETWORK_KPI.dailyTrips.toLocaleString()} unit="회" sub={`일 주행 ${NETWORK_KPI.dailyKm.toLocaleString()}km · 실증 ${snap.kpi.totalDistanceKm.toFixed(1)}km`} />
        <KpiCard label="평균 정시율" value={NETWORK_KPI.onTimeRate.toFixed(1)} unit="%" accent="text-emerald-400" sub={`전월대비 ${NETWORK_KPI.onTimeDelta} · 실증 ${liveAvgOnTime.toFixed(1)}%`} />
        <KpiCard label="저효율 노선" value={String(NETWORK_KPI.lowEfficiency)} unit="개" accent="text-amber-400" sub={worstEff ? `AI 개편 검토 권장 · 실증 최저 ${worstEff.route.name}` : 'AI 개편 검토 권장'} />
      </div>

      {/* B. 실증 3노선 라이브 브리지 */}
      <Panel title="실증 노선 · 실시간 운행 현황" right={<LiveChip />}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-[11px] text-gray-500">
              <th className="pb-2 pr-3 font-medium">노선</th>
              <th className="pb-2 pr-3 font-medium">배차 차량</th>
              <th className="pb-2 pr-3 font-medium">정시율</th>
              <th className="pb-2 pr-3 font-medium">평균 안전점수</th>
              <th className="pb-2 pr-3 font-medium">연비 효율</th>
              <th className="pb-2 font-medium">위험운전</th>
            </tr>
          </thead>
          <tbody>
            {liveRoutes.map((r) => (
              <tr key={r.route.id} className="border-b border-gray-800/50 last:border-0">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5 font-semibold text-gray-200">
                    <span className="h-2 w-2 rounded-full" style={{ background: r.route.color }} />
                    {r.route.name}
                  </span>
                </td>
                <td className="py-2 pr-3 tabular-nums text-gray-400">{r.busCount}대</td>
                <td className="py-2 pr-3 tabular-nums text-gray-400">{r.onTime.toFixed(1)}%</td>
                <td className="py-2 pr-3 tabular-nums text-gray-400">{r.avgScore.toFixed(1)}점</td>
                <td className="py-2 pr-3 tabular-nums text-gray-400">{r.effKmPerM3 > 0 ? `${r.effKmPerM3.toFixed(1)} km/m³` : '집계 중'}</td>
                <td className={`py-2 tabular-nums ${r.evCount > 8 ? 'font-semibold text-red-400' : 'text-gray-400'}`}>{r.evCount}건</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1.5 text-[10px] text-gray-600">정시율은 노선 평가·정산 패널과 동일 기준값 · 연비 효율 = 누적 주행거리 ÷ 누적 연료(CNG m³), 배속을 올리면 집계가 쌓여요</div>
      </Panel>

      {/* C. 노선 효율(라이브) + 계통별 수송 인원(정적) — 원본 dash R의 2-차트 나란히 */}
      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="노선 효율 (연비)" right={<LiveChip />}>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={effChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
                <Tooltip {...chartTheme.tooltip} formatter={(v) => [`${v} km/m³`, '연비 효율']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="eff" radius={[7, 7, 0, 0]} barSize={40} isAnimationActive={false}>
                  {effChartData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="계통별 수송 인원 (월)" right={<StaticChip />}>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={RIDERSHIP} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}만`} />
                <Tooltip {...chartTheme.tooltip} formatter={(v) => [`${v}만명`, '월 수송']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="v" radius={[7, 7, 0, 0]} barSize={40} isAnimationActive={false}>
                  {RIDERSHIP.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[10px] text-gray-600">대구시 4계통 월간 수송 인원(예시) · 엔진 실증은 급행·순환 2계통만 운행</div>
        </Panel>
      </div>

      {/* D. 노선별 통계 예시 대장(정적, 전폭) */}
      <Panel title="노선별 통계" right={<StaticChip />}>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                  <th className="pb-2 pr-3 font-medium">노선</th>
                  <th className="pb-2 pr-3 font-medium">구간</th>
                  <th className="pb-2 pr-3 font-medium">일 운행</th>
                  <th className="pb-2 pr-3 font-medium">일 수송</th>
                  <th className="pb-2 pr-3 font-medium">연비</th>
                  <th className="pb-2 font-medium">등급</th>
                </tr>
              </thead>
              <tbody>
                {ROUTE_STATS.map((r) => (
                  <tr key={r.no} className="border-b border-gray-800/50 last:border-0">
                    <td className="py-2 pr-3 font-semibold text-gray-200">{r.no}</td>
                    <td className="py-2 pr-3 text-gray-500">{r.seg}</td>
                    <td className="py-2 pr-3 tabular-nums text-gray-400">{r.trips}</td>
                    <td className="py-2 pr-3 tabular-nums text-gray-400">{r.pax}</td>
                    <td className="py-2 pr-3 tabular-nums text-gray-400">{r.eff}</td>
                    <td className="py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${GRADE_CLS[r.grade]}`}>{r.grade}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[10px] text-gray-600">대구시 노선망 예시 데이터 · 실증 3개 노선은 위 라이브 표에서</div>
        </Panel>
    </div>
  )
}
