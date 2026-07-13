import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { useSim } from '../sim/store'
import { RISK_EVENT_TYPES } from '../sim/types'
import { Panel } from '../components/ui'
import { setOperatorSubtabIntent } from '../sim/navIntent'

/**
 * 🌱 탄소중립 분석 — 대통합 신규 최상위 탭. 전 이해관계자 공용 "탄소중립 성과 증명" 요약판.
 * 탄소 플랫폼 관제 대시보드(dash 2·3)의 탄소·연료·안전 분석을 이식.
 * best-of-both: 탄소의 서사·수식 + proto 엔진 실집계 연결(일간 성과·안전 게이지·이벤트는 라이브).
 * 경유 배출계수 2.68 kgCO₂/L 정합. 전기전환·V2G 시뮬레이터(투자 결정)는 운수사 관제 "경영·투자"로
 * 이관해 손익과 함께 보도록 통합 — 여기서는 교차 링크만 제공.
 */

// ── 기간별 성과 (원본 periodData 이식) — 월/연은 서사값, 일간은 엔진 라이브로 덮어씀 ──
const PERIODS = {
  일간: {
    title: '오늘, 안전운전이 만든 절감', asOf: '금일 운행분 · 실시간 집계',
    km: '129,200', kmSub: '금일 운행 누적', eff: '+4.3%', effSub: '2.42 → 2.52 km/L (경유)',
    fuel: '784', fuelSub: '베이스라인 대비 -4.1%', co2: '2.1', co2Pct: '-4.3%',
    fuelUnit: 'L', labels: ['7/5', '7/6', '7/7', '7/8', '7/9', '7/10', '7/11'],
    trendFuel: [740, 790, 720, 830, 810, 620, 784], trendCo2: [1.98, 2.12, 1.93, 2.22, 2.17, 1.66, 2.1],
  },
  월간: {
    title: '7월, 안전운전이 만든 절감', asOf: '7월 11일 기준 · 412대',
    km: '2,843,000', kmSub: '운행 22일 누적', eff: '+4.5%', effSub: '2.42 → 2.53 km/L (경유)',
    fuel: '27,100', fuelSub: '베이스라인 대비 -4.3%', co2: '72.6', co2Pct: '-4.7%',
    fuelUnit: '천L', labels: ['2월', '3월', '4월', '5월', '6월', '7월'],
    trendFuel: [21.4, 22.8, 24.1, 25.2, 26.3, 27.1], trendCo2: [57.4, 61.1, 64.6, 67.5, 70.5, 72.6],
  },
  연간: {
    title: '2026년, 안전운전이 만든 절감', asOf: '2~7월 누적 · 412대',
    km: '16,240,000', kmSub: '도입 후 6개월 누적', eff: '+4.1%', effSub: '2.43 → 2.53 km/L (기간 평균)',
    fuel: '146,900', fuelSub: '베이스라인 대비 -4.2%', co2: '393.7', co2Pct: '-4.5%',
    fuelUnit: '천L', labels: ['2월', '3월', '4월', '5월', '6월', '7월'],
    trendFuel: [21.4, 44.2, 68.3, 93.5, 119.8, 146.9], trendCo2: [57.4, 118.5, 183.1, 250.6, 321.1, 393.7],
  },
} as const
type PeriodId = keyof typeof PERIODS

// 연비·전비 근거 (도입 전 → 후)
const EFF_CARDS = [
  { fuel: '경유', before: '2.42', after: '2.53', delta: '+4.5%', accent: 'text-emerald-400' },
  { fuel: 'CNG', before: '1.98', after: '2.06', delta: '+4.0%', accent: 'text-emerald-400' },
  { fuel: '전기(전비)', before: '1.05', after: '1.12', delta: '+6.7%', accent: 'text-sky-400' },
  { fuel: '공회전 시간', before: '42분', after: '34분', delta: '-19%', accent: 'text-emerald-400' },
]

const CO_RANKS = [
  { rank: 1, name: '세운버스(주)', buses: '98대', pct: '-5.8%', co2: '18.4t', w: 100 },
  { rank: 2, name: '세진교통(주)', buses: '86대', pct: '-4.9%', co2: '15.2t', w: 84 },
  { rank: 3, name: '경북교통(주)', buses: '84대', pct: '-4.1%', co2: '14.1t', w: 71 },
  { rank: 4, name: '신흥버스(주)', buses: '76대', pct: '-3.6%', co2: '13.0t', w: 62 },
  { rank: 5, name: '동명교통(주)', buses: '68대', pct: '-3.2%', co2: '11.9t', w: 55 },
]

const SYSTEM_CO2 = [
  { name: '급행', t: 18.4 },
  { name: '간선', t: 31.2 },
  { name: '지선', t: 16.8 },
  { name: '순환', t: 6.2 },
]
const ROUTE_CO2 = [
  { name: '급행1', t: 3.9 },
  { name: '간선 401', t: 3.2 },
  { name: '간선 649', t: 2.7 },
  { name: '순환 2-1', t: 1.9 },
  { name: '지선 356', t: 1.6 },
]
const FUEL_MIX = [
  { name: '경유', v: 78, color: '#64748b' },
  { name: 'CNG', v: 19, color: '#34d399' },
  { name: '전기(간접)', v: 3, color: '#38bdf8' },
]

// 위험구간 (안전 대시보드)
const ZONES = [
  { name: '반월당 네거리', type: '급감속 다발', count: '주 96건', tag: 'AI 탐지' },
  { name: '동대구역 앞', type: '급가속·과속', count: '주 71건', tag: 'AI 탐지' },
  { name: '만평네거리', type: '급출발', count: '주 58건', tag: 'AI 탐지' },
]

const chartTheme = {
  grid: '#8899a6',
  tick: { fill: '#8899a6', fontSize: 11, fontWeight: 600 },
  tooltip: {
    contentStyle: { background: '#191f28', border: '1px solid #374151', borderRadius: 8, fontSize: 12, color: '#fff' },
    labelStyle: { color: '#cbd5e1' },
    itemStyle: { color: '#e5e7eb' },
  },
}

const SUBTABS = [
  { id: 'fuel', label: '탄소·연료', sub: '연비 → CO₂ 인과' },
  { id: 'safety', label: '안전운행', sub: '위험운전 진단' },
] as const
type SubId = (typeof SUBTABS)[number]['id']

export default function CarbonAnalysis({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [sub, setSub] = useState<SubId>('fuel')
  const [period, setPeriod] = useState<PeriodId>('월간')
  const snap = useSim()

  // ── 엔진 실집계 (실동작 연결) ──
  const liveCo2 = snap.kpi.totalCo2SavedKg
  const liveFuelPct = snap.kpi.fuelSavedPct
  const liveKm = snap.kpi.totalDistanceKm
  const avgScore = snap.vehicles.length
    ? snap.vehicles.reduce((s, v) => s + v.score, 0) / snap.vehicles.length
    : 0
  // 위험운전 8종을 4계열로 집계 (엔진 eventCounts 합산)
  const evAgg = useMemo(() => {
    const sum = (types: string[]) =>
      snap.vehicles.reduce((s, v) => s + types.reduce((a, t) => a + (v.eventCounts[t as never] || 0), 0), 0)
    return [
      { name: '급가속·출발', v: sum(['급가속', '급출발']), color: '#fb923c' },
      { name: '급감속·정지', v: sum(['급감속', '급정지']), color: '#f59e0b' },
      { name: '급진로·앞지르기', v: sum(['급진로변경', '급앞지르기']), color: '#f87171' },
      { name: '급회전·유턴', v: sum(['급좌우회전', '급유턴']), color: '#2dd4bf' },
    ]
  }, [snap])
  const totalEvents = evAgg.reduce((s, e) => s + e.v, 0)

  const P = PERIODS[period]
  const isLive = period === '일간'

  // 안전점수 ↔ 연비 상관 (r=0.81) — 90개 점 1회 생성
  const corrPts = useMemo(
    () =>
      Array.from({ length: 90 }, () => {
        const score = 55 + Math.random() * 42
        const mpg = 1.95 + (score - 55) * 0.011 + (Math.random() - 0.5) * 0.22
        return { x: Math.round(score * 10) / 10, y: Math.round(mpg * 100) / 100 }
      }),
    [],
  )
  const corrTrend = [
    { x: 55, y: 1.95 },
    { x: 97, y: 2.42 },
  ]

  const trendData = P.labels.map((l, i) => ({ l, fuel: P.trendFuel[i], co2: P.trendCo2[i] }))

  const goInvest = () => {
    setOperatorSubtabIntent('biz')
    onNavigate?.('operator')
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 + 서브탭 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold tracking-widest text-emerald-400">CARBON NEUTRALITY ANALYTICS</div>
          <h2 className="mt-0.5 text-xl font-bold text-gray-100">🌱 탄소중립 분석</h2>
          <div className="mt-0.5 text-xs text-gray-500">
            안전운전 → 연비 → 연료 → CO₂ 인과사슬을 실측·엔진 집계로 증명하고, 전기전환·V2G를 시뮬레이션해요
          </div>
        </div>
        <nav className="flex gap-1 rounded-lg bg-gray-900/60 p-1">
          {SUBTABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`rounded-md px-3 py-1.5 text-left transition-colors ${
                sub === t.id ? 'bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="text-xs font-bold">{t.label}</div>
              <div className="text-[9px] opacity-60">{t.sub}</div>
            </button>
          ))}
        </nav>
      </div>

      {/* 투자 결정(전환·V2G)은 운수사 경영·투자로 통합 — 손익과 함께 봐야 하는 숫자라 그쪽에 있음 */}
      <button
        onClick={goInvest}
        className="flex items-center justify-between rounded-lg border border-violet-500/25 bg-violet-500/5 px-3.5 py-2 text-left text-[12px] text-violet-300 hover:bg-violet-500/10"
      >
        <span>💰 전기전환·V2G 투자 시뮬레이션은 운수사 관제의 <b>경영·투자</b>에서 손익과 함께 볼 수 있어요</span>
        <span className="shrink-0 font-bold">바로가기 →</span>
      </button>

      {/* ============ 탄소·연료 ============ */}
      {sub === 'fuel' && (
        <div className="flex flex-col gap-3">
          {/* 기간 토글 */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-gray-900/60 p-1">
              {(Object.keys(PERIODS) as PeriodId[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setPeriod(k)}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                    period === k ? 'bg-gray-800 text-gray-100 shadow' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                엔진 실집계 연동
              </span>
            )}
          </div>

          {/* 성과 흐름 카드 — 일간은 엔진 라이브 */}
          <Panel title={`${P.title} · ${P.asOf}`}>
            <div className="grid grid-cols-4 gap-3 max-[720px]:grid-cols-2">
              <FlowCard label="DTG 주행거리" value={isLive ? Math.round(liveKm).toLocaleString() : P.km} unit="km" sub={isLive ? '시뮬레이션 누적' : P.kmSub} />
              <FlowCard label="연비 개선" value={isLive ? `+${liveFuelPct.toFixed(1)}` : P.eff} unit={isLive ? '%' : ''} sub={P.effSub} accent="text-emerald-400" arrow />
              <FlowCard label="연료 절감" value={isLive ? Math.round(snap.kpi.totalFuelM3).toLocaleString() : P.fuel} unit={isLive ? 'm³' : P.fuelUnit} sub={P.fuelSub} accent="text-sky-400" arrow />
              <FlowCard label="CO₂ 절감" value={isLive ? (liveCo2 / 1000).toFixed(2) : P.co2} unit="t" sub={`저감률 ${P.co2Pct}`} accent="text-emerald-400" arrow />
            </div>
            <div className="mt-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-2.5 text-[11px] leading-relaxed text-gray-400">
              {isLive ? (
                <>
                  <b className="text-emerald-400">일간 = 엔진 실시간 집계</b> — 시뮬레이터 9대의 실제 코칭 적용/미적용(baseline) 연료 차이로 산출. 배속을 올리면 값이 빠르게 쌓여요.
                </>
              ) : (
                <>산정 기준 — 경유 배출계수 2.68 kgCO₂/L, 도입 전 12개월 노선별 연비 베이스라인 대비 실측 (OBD·DTG 교차 검증)</>
              )}
            </div>
          </Panel>

          {/* 추이 + 상관 */}
          <div className="grid grid-cols-2 gap-3 max-[860px]:grid-cols-1">
            <Panel title={`추이 — 연료 절감 · CO₂ 절감`}>
              <div className="h-56">
                <ResponsiveContainer>
                  <ComposedChart data={trendData} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="l" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="L" tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}${P.fuelUnit}`} />
                    <YAxis yAxisId="R" orientation="right" tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}t`} />
                    <Tooltip {...chartTheme.tooltip} />
                    <Bar yAxisId="L" dataKey="fuel" name={`연료 절감(${P.fuelUnit})`} fill="rgba(56,189,248,.75)" radius={[6, 6, 0, 0]} barSize={22} />
                    <Line yAxisId="R" type="monotone" dataKey="co2" name="CO₂ 절감(t)" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3.5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="안전운전 점수 ↔ 연비 상관" right={<span className="rounded-md bg-emerald-500/12 px-2 py-0.5 text-[11px] font-bold text-emerald-400">r = 0.81</span>}>
              <div className="h-56">
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" domain={[50, 100]} name="안전점수" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                    <YAxis type="number" dataKey="y" domain={[1.8, 2.5]} name="연비" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                    <ZAxis range={[26, 26]} />
                    <Tooltip {...chartTheme.tooltip} cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter data={corrPts} fill="rgba(56,189,248,0.5)" />
                    <Scatter data={corrTrend} line={{ stroke: '#34d399', strokeWidth: 2.5, strokeDasharray: '7 5' }} shape={() => <g />} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">안전점수가 높은 차량일수록 연비가 좋아요 — 코칭이 절감으로 이어지는 구조를 데이터로 증명.</div>
            </Panel>
          </div>

          {/* 연비 근거 4카드 */}
          <div className="grid grid-cols-4 gap-3 max-[720px]:grid-cols-2">
            {EFF_CARDS.map((c) => (
              <div key={c.fuel} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                <div className="text-[11px] font-semibold text-gray-500">{c.fuel}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm text-gray-500 tabular-nums">{c.before}</span>
                  <span className="text-gray-600">→</span>
                  <span className={`text-lg font-extrabold tabular-nums ${c.accent}`}>{c.after}</span>
                </div>
                <div className={`mt-0.5 text-[11px] font-bold ${c.accent}`}>{c.delta}</div>
              </div>
            ))}
          </div>

          {/* 계통·노선·연료 구성 */}
          <div className="grid grid-cols-3 gap-3 max-[860px]:grid-cols-1">
            <Panel title="계통별 CO₂ 절감">
              <div className="h-44">
                <ResponsiveContainer>
                  <BarChart data={SYSTEM_CO2} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                    <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}t`} />
                    <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="t" fill="#38bdf8" radius={[6, 6, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="노선별 절감 TOP5">
              <div className="h-44">
                <ResponsiveContainer>
                  <BarChart data={ROUTE_CO2} layout="vertical" margin={{ top: 4, right: 10, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}t`} />
                    <YAxis type="category" dataKey="name" tick={{ ...chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="t" fill="#34d399" radius={[0, 6, 6, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="연료 구성비">
              <div className="flex h-44 items-center">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={FUEL_MIX} dataKey="v" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                      {FUEL_MIX.map((f) => (
                        <Cell key={f.name} fill={f.color} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTheme.tooltip} formatter={(v, n) => [`${v}%`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 pr-2">
                  {FUEL_MIX.map((f) => (
                    <div key={f.name} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                      <span className="h-2 w-2 rounded-sm" style={{ background: f.color }} />
                      {f.name} <b className="text-gray-200 tabular-nums">{f.v}%</b>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          {/* 운수회사별 절감 랭킹 */}
          <Panel title="운수회사별 절감 성과 (절감률 순)">
            <div className="flex flex-col gap-2">
              {CO_RANKS.map((c) => (
                <div key={c.rank} className="flex items-center gap-3">
                  <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-xs font-bold ${c.rank === 1 ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-300'}`}>{c.rank}</span>
                  <span className="w-28 flex-none text-[13px] font-semibold text-gray-200">{c.name}</span>
                  <span className="w-12 flex-none text-[11px] text-gray-500">{c.buses}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                    <div className="h-full rounded-full" style={{ width: `${c.w}%`, background: c.rank === 1 ? '#34d399' : 'rgba(52,211,153,0.45)' }} />
                  </div>
                  <span className={`w-12 flex-none text-right text-[13px] font-bold tabular-nums ${c.rank === 1 ? 'text-emerald-400' : 'text-gray-300'}`}>{c.pct}</span>
                  <span className="w-12 flex-none text-right text-[11px] text-gray-500 tabular-nums">{c.co2}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ============ 안전운행 ============ */}
      {sub === 'safety' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[240px_1fr] gap-3 max-[720px]:grid-cols-1">
            <Panel title="평균 운전점수" right={<span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold text-emerald-400">LIVE</span>}>
              <Gauge value={avgScore} />
              <div className="mt-1 text-center text-[11px] text-gray-500">시뮬레이터 9대 실시간 평균 (감점·회복 반영)</div>
            </Panel>
            <Panel title="위험운전 이벤트 (엔진 실집계)">
              <div className="h-40">
                <ResponsiveContainer>
                  <BarChart data={evAgg} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ ...chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}건`} />
                    <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="v" radius={[6, 6, 0, 0]} barSize={40}>
                      {evAgg.map((e) => (
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                누적 {totalEvents}건 — 정당판정(맥락융합)된 이벤트는 감점·집계에서 자동 면제돼요.
              </div>
            </Panel>
          </div>

          {/* 차량별 안전 점수 (엔진 실시간) */}
          <Panel title="차량별 안전 점수 (실시간)">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                    <th className="py-2 font-semibold">차량 · 기사</th>
                    <th className="py-2 font-semibold">위험운전 누계</th>
                    <th className="py-2 text-right font-semibold">운전점수</th>
                    <th className="py-2 text-right font-semibold">등급</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snap.vehicles]
                    .sort((a, b) => b.score - a.score)
                    .map((v) => {
                      const ev = RISK_EVENT_TYPES.reduce((s, t) => s + v.eventCounts[t], 0)
                      const s = Math.round(v.score)
                      const cls = s >= 90 ? 'text-emerald-400' : s >= 80 ? 'text-amber-400' : 'text-red-400'
                      const grade = s >= 90 ? '안전' : s >= 80 ? '양호' : '주의'
                      return (
                        <tr key={v.id} className="border-b border-gray-800/50">
                          <td className="py-2 text-gray-200">
                            {v.id} <span className="text-gray-500">· {v.driverName}</span>
                          </td>
                          <td className="py-2 tabular-nums text-gray-400">{ev}건</td>
                          <td className={`py-2 text-right font-bold tabular-nums ${cls}`}>{s}</td>
                          <td className={`py-2 text-right text-[12px] font-semibold ${cls}`}>{grade}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* 위험 구간 */}
          <Panel title="AI 탐지 위험 구간">
            <div className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
              {ZONES.map((z) => (
                <div key={z.name} className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-gray-100">{z.name}</span>
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">{z.tag}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-gray-400">{z.type}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-amber-400 tabular-nums">{z.count}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

    </div>
  )
}

// 성과 흐름 카드 (화살표 플로우)
function FlowCard({ label, value, unit, sub, accent = 'text-gray-100', arrow }: { label: string; value: string; unit?: string; sub?: string; accent?: string; arrow?: boolean }) {
  return (
    <div className="relative rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      {arrow && <div className="absolute -left-2.5 top-1/2 hidden -translate-y-1/2 text-gray-700 max-[720px]:hidden min-[721px]:block">→</div>}
      <div className="text-[11px] font-semibold text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tracking-tight tabular-nums ${accent}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-gray-400">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div>}
    </div>
  )
}

// 반원 게이지 (SVG) — 운전점수 0~100
function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const R = 68
  const cx = 90
  const cy = 90
  const circ = Math.PI * R // 반원 길이
  const dash = (v / 100) * circ
  const color = v >= 90 ? '#34d399' : v >= 80 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative mx-auto" style={{ width: 180, height: 104 }}>
      <svg width="180" height="104" viewBox="0 0 180 104">
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="#374151" strokeWidth="14" strokeLinecap="round" />
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray .4s ease, stroke .3s' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <div className="text-3xl font-extrabold tabular-nums" style={{ color }}>
          {v.toFixed(1)}
        </div>
        <div className="text-[10px] text-gray-500">/ 100점</div>
      </div>
    </div>
  )
}
