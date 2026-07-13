import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard, Panel } from '../../components/ui'
import { useSim } from '../../sim/store'

/**
 * 운수사 경영·투자 — 대통합에서 OperatorView에 추가한 서브탭.
 * 탄소 플랫폼 「운수사 경영 대시보드」의 손익 요약 + 「AI Planning」의 전환·V2G 시뮬레이터를
 * 한 화면으로 합쳤다 — 경영진이 같은 회의에서 보는 숫자(이번 달 손익 + 다음 투자 결정)가
 * 서로 다른 탭에 흩어져 있던 것을 하나로. 손익은 월간 서사값(98대 스케일) + 엔진 실시간 병기,
 * 시뮬레이터는 What-if 계산. 경유 1,550원/L 정합.
 */

const SAVE_TREND = [
  { m: '2월', v: 612 },
  { m: '3월', v: 705 },
  { m: '4월', v: 798 },
  { m: '5월', v: 872 },
  { m: '6월', v: 963 },
  { m: '7월', v: 1065 },
]
const DIST = [
  { name: '우수', v: 21, color: '#34d399' },
  { name: '일반', v: 85, color: '#38bdf8' },
  { name: '교육 대상', v: 9, color: '#fb923c' },
]
const BENCH = [
  { name: '세운버스(주)', pct: '-5.8%', w: 100, me: true },
  { name: '세진교통(주)', pct: '-4.9%', w: 84 },
  { name: '경북교통(주)', pct: '-4.1%', w: 71 },
  { name: '신흥버스(주)', pct: '-3.6%', w: 62 },
  { name: '동명교통(주)', pct: '-3.2%', w: 55 },
]
const INSIGHTS = [
  { title: '인센티브 ROI', accent: 'text-sky-400', body: '인센티브 1원당 절감 효과 3.4원 — 지급 확대가 남는 투자예요.' },
  { title: '보험료 협상 카드', accent: 'text-sky-400', body: '위험 이벤트 28% 감소 — DTG 데이터로 갱신 시 보험료 인하 협상이 가능해요.' },
  { title: 'ESG 실적', accent: 'text-emerald-400', body: '연 감축 실적은 시 평가·재정지원 가점과 KOC 크레딧 수익으로 이어져요.' },
]

// AI 선정 전환 대상 TOP5
const PLAN_TARGETS = [
  { rank: 1, no: '세진 1812호', detail: '차령 11년 · 연비 2.08 km/L · 일 244km', co2: '36.2t/년' },
  { rank: 2, no: '세운 2290호', detail: '차령 10년 · 연비 2.15 km/L · 일 238km', co2: '35.9t/년' },
  { rank: 3, no: '경북 3117호', detail: '차령 9년 · 연비 2.21 km/L · 일 231km', co2: '35.6t/년' },
  { rank: 4, no: '동명 0912호', detail: '차령 9년 · 연비 2.24 km/L · 일 226km', co2: '35.3t/년' },
  { rank: 5, no: '세진 2044호', detail: '차령 8년 · 연비 급감(인젝터) · 일 229km', co2: '35.0t/년' },
]

// 전환 시뮬레이터 — AI가 효과 큰 차량부터 선정 → 한계 체감 (k번째 = 36.5 − 0.3k tCO₂/년)
function planCalc(n: number) {
  const co2 = 36.5 * n - 0.15 * n * (n + 1)
  const fuelEok = (co2 * 1148000) / 1e8
  const investEok = n * 1.1
  return { co2: Math.round(co2), fuelEok, investEok, roi: investEok / fuelEok }
}

const chartTheme = {
  grid: '#8899a6',
  tick: { fill: '#8899a6', fontSize: 11, fontWeight: 600 },
  tooltip: {
    contentStyle: { background: '#191f28', border: '1px solid #374151', borderRadius: 8, fontSize: 12, color: '#fff' },
    labelStyle: { color: '#cbd5e1' },
  },
}

export default function BizSummary() {
  const snap = useSim()
  const liveCo2 = snap.kpi.totalCo2SavedKg
  const liveFuelPct = snap.kpi.fuelSavedPct

  const [planN, setPlanN] = useState(12)
  const [v2gN, setV2gN] = useState(40)
  const plan = planCalc(planN)
  const planCurve = useMemo(() => Array.from({ length: 50 }, (_, i) => ({ x: i + 1, y: planCalc(i + 1).co2 })), [])

  const demand = [65, 60, 57, 55, 54, 55, 60, 70, 78, 84, 88, 91, 93, 95, 97, 99, 100, 98, 93, 88, 82, 76, 72, 68]
  const v2gData = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const isCharge = h >= 23 || h <= 5
        const isDisch = h >= 14 && h <= 17
        const val = isCharge ? -((v2gN * 80) / 7 / 1000) : isDisch ? (v2gN * 20) / 1000 : 0
        return { h: `${h}시`, e: Math.round(val * 100) / 100, d: demand[h], charge: isCharge, disch: isDisch }
      }),
    [v2gN],
  )

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-gray-100">세운버스(주) 경영·투자</div>
          <div className="text-xs text-gray-500">2026년 7월 · 보유 98대 · 기사 115명 · 이번 달 손익과 다음 투자 결정을 한 화면에</div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-3 py-1.5 text-[13px] font-bold text-emerald-400">
          🏆 절감률 5개사 중 1위
        </span>
      </div>

      {/* ============ 이번 달 손익 ============ */}
      <div className="text-[11px] font-semibold tracking-widest text-gray-500">이번 달 손익</div>
      <div className="rounded-2xl border border-gray-700 bg-gray-950 px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-gray-100">안전운전이 만든 손익 효과</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            실시간 감축 {(liveCo2 / 1000).toFixed(2)}t · 연료 −{liveFuelPct.toFixed(1)}% (시뮬레이션)
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.1fr] items-center gap-3 max-[860px]:grid-cols-2 max-[860px]:gap-4">
          <PnlItem label="연료비 절감" value="1,065" unit="만원" sub="6,870L · CO₂ 18.4t" />
          <Op>+</Op>
          <PnlItem label="예지정비 회피 비용" value="420" unit="만원" sub="돌발 결행 3건 예방" />
          <Op>−</Op>
          <PnlItem label="기사 인센티브 지급" value="310" unit="만원" sub="우수 기사 21명" />
          <div className="hidden max-[860px]:hidden min-[861px]:block" />
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-4 py-3.5 max-[860px]:col-span-2">
            <div className="text-xs font-bold text-emerald-300">월 순 효과</div>
            <div className="mt-1 text-[27px] font-extrabold tabular-nums text-emerald-300">
              +1,175<span className="ml-1 text-sm font-semibold">만원</span>
            </div>
            <div className="mt-0.5 text-[11.5px] font-semibold text-emerald-200/70">연 환산 약 1.4억원</div>
          </div>
        </div>
      </div>

      {/* 추이 + 기사 분포 */}
      <div className="grid grid-cols-[1.6fr_1fr] gap-3 max-[860px]:grid-cols-1">
        <Panel title="월별 연료비 절감액" right={<span className="text-[11px] text-gray-500">도입(2월) 후 6개월 연속 증가</span>}>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={SAVE_TREND} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}만`} />
                <Tooltip {...chartTheme.tooltip} formatter={(v) => [`${Number(v).toLocaleString()}만원`, '연료비 절감']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="v" fill="#38bdf8" radius={[7, 7, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="기사 성과 분포">
          <div className="flex h-40 items-center justify-center">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={DIST} dataKey="v" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} strokeWidth={0}>
                  {DIST.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip {...chartTheme.tooltip} formatter={(v, n) => [`${v}명`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-around text-[12px] font-semibold">
            {DIST.map((d) => (
              <span key={d.name} style={{ color: d.color }}>
                ● {d.name} {d.v}
              </span>
            ))}
          </div>
          <div className="mt-2.5 border-t border-gray-800 pt-2.5 text-[12px] font-semibold leading-relaxed text-gray-500">
            교육 대상 9명이 맞춤 교육을 마치면 월 절감액이 약 <b className="text-gray-300">96만원</b> 더 늘어요.
          </div>
        </Panel>
      </div>

      <Panel title="5개사 절감률 벤치마크" right={<span className="text-[11px] text-gray-500">베이스라인 대비 · 7월</span>}>
        <div className="flex flex-col gap-2.5">
          {BENCH.map((b) => (
            <div key={b.name} className="flex items-center gap-2.5">
              <span className="w-24 flex-none text-[13px] font-bold text-gray-200">
                {b.name}
                {b.me && <span className="ml-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">우리</span>}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                <div className="h-full rounded-full" style={{ width: `${b.w}%`, background: b.me ? '#34d399' : 'rgba(52,211,153,0.4)' }} />
              </div>
              <span className="w-12 flex-none text-right text-[13px] font-bold tabular-nums text-emerald-400">{b.pct}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 border-t border-gray-800 pt-2.5 text-[12px] font-semibold text-gray-500">
          에코 드라이빙 실천율 91% — 격차의 핵심은 기사 참여율이에요.
        </div>
      </Panel>

      {/* ============ 다음 투자 결정 ============ */}
      <div className="mt-1 text-[11px] font-semibold tracking-widest text-gray-500">다음 투자 결정</div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-[12px] leading-relaxed text-gray-400">
        보유 차량 <b className="text-gray-200">경유 58 · CNG 18 · 전기 22</b>대 — 노후 경유 2대(세운 2290호·0091호)는 전환 시 대당 연 35.7tCO₂ 감축, 보조금 반영 회수 2.7년. 아래 시뮬레이터로 규모를 조절해 비교해 보세요.
      </div>

      <Panel title="전기버스 전환 시뮬레이터" right={<span className="text-[11px] text-gray-500">AI가 효과순 선정 → 한계 체감</span>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-400">전환 대수</span>
          <span className="text-2xl font-extrabold tabular-nums text-violet-400">
            {planN}
            <span className="ml-0.5 text-sm text-gray-400">대</span>
          </span>
          <div className="ml-2 flex gap-1">
            {[
              { label: '보수 6대', n: 6 },
              { label: '균형 12대', n: 12 },
              { label: '공격 24대', n: 24 },
            ].map((s) => (
              <button
                key={s.n}
                onClick={() => setPlanN(s.n)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${planN === s.n ? 'border-violet-500 bg-violet-500/15 text-violet-300' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <input type="range" min={1} max={50} value={planN} onChange={(e) => setPlanN(Number(e.target.value))} className="h-6 w-full cursor-pointer" style={{ accentColor: '#8b5cf6' }} aria-label="전환 대수" />
        <div className="mt-3 grid grid-cols-5 gap-2 max-[720px]:grid-cols-2">
          <KpiCard label="연 CO₂ 감축" value={plan.co2.toLocaleString()} unit="t" accent="text-emerald-400" />
          <KpiCard label="연료비 절감" value={plan.fuelEok.toFixed(1)} unit="억원" accent="text-sky-400" />
          <KpiCard label="실투자 (보조금 후)" value={plan.investEok.toFixed(1)} unit="억원" accent="text-gray-100" />
          <KpiCard label="투자 회수" value={plan.roi.toFixed(1)} unit="년" accent="text-amber-400" />
          <KpiCard label="KOC 크레딧" value={Math.round((plan.co2 * 8900) / 10000).toLocaleString()} unit="만원" accent="text-emerald-400" />
        </div>
        <div className="mt-3 h-52">
          <ResponsiveContainer>
            <LineChart data={planCurve} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
              <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
              <XAxis type="number" dataKey="x" domain={[1, 50]} tick={chartTheme.tick} axisLine={false} tickLine={false} label={{ value: '전환 대수', position: 'insideBottom', offset: -2, fill: '#8899a6', fontSize: 11 }} />
              <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}t`} />
              <Tooltip {...chartTheme.tooltip} formatter={(v) => [`${v}t/년`, 'CO₂ 감축']} labelFormatter={(l) => `${l}대 전환`} />
              <Line type="monotone" dataKey="y" stroke="#38bdf8" strokeWidth={2.5} dot={false} fill="rgba(56,189,248,.06)" />
              <ReferenceDot x={planN} y={plan.co2} r={6} fill="#34d399" stroke="#fff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-[11px] text-gray-500">대당 실투자 1.1억(차량가 3.9억 − 보조금 2.8억) · 감축량 = 36.5n − 0.15n(n+1) · KOC 8,900원/t</div>
      </Panel>

      <Panel title="V2G (전기버스 → 전력망) 시뮬레이터" right={<span className="text-[11px] text-gray-500">심야 충전 · 피크 방전</span>}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-gray-400">V2G 참여</span>
          <span className="text-2xl font-extrabold tabular-nums text-violet-400">
            {v2gN}
            <span className="ml-0.5 text-sm text-gray-400">대</span>
          </span>
          <input type="range" min={5} max={68} value={v2gN} onChange={(e) => setV2gN(Number(e.target.value))} className="h-6 max-w-xs flex-1 cursor-pointer" style={{ accentColor: '#8b5cf6' }} aria-label="V2G 참여 대수" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <KpiCard label="월 수익" value={Math.round(v2gN * 14.4).toLocaleString()} unit="만원" accent="text-violet-400" />
          <KpiCard label="연 환산" value={Math.round(v2gN * 14.4 * 12).toLocaleString()} unit="만원" accent="text-violet-400" />
          <KpiCard label="피크 기여" value={(v2gN * 0.1).toFixed(1)} unit="MW" accent="text-amber-400" />
        </div>
        <div className="mt-1 text-[12.5px] font-semibold text-violet-300">
          22대 전 보유 전기차 참여 시 월 순 효과가 1,175만 → <b>1,492만원</b>으로 늘어나요.
        </div>
        <div className="mt-3 h-52">
          <ResponsiveContainer>
            <ComposedChart data={v2gData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="h" tick={{ ...chartTheme.tick, fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis yAxisId="E" tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
              <YAxis yAxisId="D" orientation="right" domain={[40, 110]} tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip {...chartTheme.tooltip} />
              <Bar yAxisId="E" dataKey="e" name="충·방전(MWh)" radius={[2, 2, 0, 0]}>
                {v2gData.map((d, i) => (
                  <Cell key={i} fill={d.charge ? 'rgba(56,189,248,0.75)' : d.disch ? 'rgba(52,211,153,0.85)' : '#475569'} />
                ))}
              </Bar>
              <Line yAxisId="D" type="monotone" dataKey="d" name="전력수요(%)" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          월 수익 = 대당 일 방전 80kWh × 차익 60원 × 30일 = 14.4만원/대 · 심야(23~05시) 충전, 피크(14~17시) 방전
        </div>
      </Panel>

      <Panel title="AI 선정 전환 대상 TOP5" right={<span className="text-[11px] text-gray-500">차령·연비·일주행 기반</span>}>
        <div className="flex flex-col gap-2">
          {PLAN_TARGETS.map((t) => (
            <div key={t.rank} className="flex items-center gap-3 rounded-lg bg-gray-900/40 px-3 py-2">
              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-xs font-bold ${t.rank <= 3 ? 'bg-violet-500 text-white' : 'bg-gray-800 text-gray-300'}`}>{t.rank}</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-gray-100">{t.no}</div>
                <div className="text-[11px] text-gray-500">{t.detail}</div>
              </div>
              <span className="text-[13px] font-bold tabular-nums text-emerald-400">{t.co2}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* AI 경영 인사이트 */}
      <div className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
        {INSIGHTS.map((i) => (
          <div key={i.title} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3.5">
            <div className={`text-xs font-bold ${i.accent}`}>{i.title}</div>
            <div className="mt-1 text-[13px] font-semibold leading-relaxed text-gray-400">{i.body}</div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div className="pb-1 text-[11.5px] font-medium text-gray-600">
        산정 기준 — 경유 1,550원/L · 절감량은 도입 전 12개월 베이스라인 대비 실측 (OBD·DTG 교차 검증) · 상단 실시간 감축은 시뮬레이터 9대 엔진 집계 · 전환·V2G는 What-if 계산
      </div>
    </div>
  )
}

function PnlItem({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-gray-100">
        {value}
        <span className="ml-0.5 text-[13px] font-semibold text-gray-400">{unit}</span>
      </div>
      <div className="mt-0.5 text-[11.5px] font-semibold text-gray-500">{sub}</div>
    </div>
  )
}

function Op({ children }: { children: string }) {
  return <span className="text-lg font-bold text-gray-600 max-[860px]:hidden">{children}</span>
}
