import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Panel } from '../../components/ui'
import { useSim } from '../../sim/store'

/**
 * 운수사 경영 요약 — 대통합에서 OperatorView에 추가한 서브탭.
 * 탄소 플랫폼 「운수사 경영 대시보드」를 React로 이식 — 관제실(운영)과 다른 경영진 시점(손익).
 * 손익 리본은 월간 서사값(98대 스케일)을 유지하되, proto 엔진 실시간 감축을 라이브 스트립으로 병기해
 * "지금도 쌓이는 실측"으로 그라운딩(목업→실동작 연결). 경유 1,550원/L 정합.
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

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-gray-100">세운버스(주) 경영 리포트</div>
          <div className="text-xs text-gray-500">2026년 7월 · 보유 98대 · 기사 115명 · Qdrive 자동 집계</div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-3 py-1.5 text-[13px] font-bold text-emerald-400">
          🏆 절감률 5개사 중 1위
        </span>
      </div>

      {/* 손익 효과 리본 */}
      <div className="rounded-2xl border border-gray-700 bg-gray-950 px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-gray-100">이번 달 안전운전이 만든 손익 효과</span>
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

      {/* V2G 잠재 수익 */}
      <div className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-violet-500/25 bg-violet-500/6 px-5 py-3.5">
        <span className="flex-none rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-bold text-violet-300">다음 수익원 · V2G</span>
        <span className="min-w-60 flex-1 text-[13px] font-semibold leading-relaxed text-gray-300">
          보유 전기 22대가 V2G(심야 충전·피크 방전)에 참여하면 <b className="text-violet-300">월 +317만원</b>이 더해져요 — 월 순 효과가 1,175만 → <b className="text-gray-100">1,492만원</b>. 대당 월 14.4만원, 운행 대기 시간만 사용해요.
        </span>
        <span className="flex-none text-[12.5px] font-bold text-violet-300">🌱 탄소중립 분석 탭에서 시뮬레이션 →</span>
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

      {/* 벤치마크 + 전환 검토 */}
      <div className="grid grid-cols-2 gap-3 max-[860px]:grid-cols-1">
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
        <Panel title="보유 차량 · 전환 검토" right={<span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-bold text-sky-400">AI Planning 연동</span>}>
          <div className="mb-3.5 flex gap-2.5">
            {[
              ['58', '경유', 'text-gray-100'],
              ['18', 'CNG', 'text-gray-100'],
              ['22', '전기', 'text-emerald-400'],
            ].map(([n, l, cls]) => (
              <div key={l} className={`flex-1 rounded-lg px-3 py-2.5 text-center ${l === '전기' ? 'bg-emerald-500/8' : 'bg-gray-800/50'}`}>
                <div className={`text-lg font-extrabold tabular-nums ${cls}`}>{n}</div>
                <div className="mt-0.5 text-[11.5px] font-semibold text-gray-500">{l}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-800 px-4 py-3">
            <div className="text-[13px] font-bold text-gray-100">AI 추천 — 노후 경유 2대 우선 전환</div>
            <div className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-gray-400">
              세운 2290호·세운 0091호는 차령 10년 이상, 연비 하위 15%예요. 전환 시 대당 연 35.7tCO₂ 감축, 보조금 반영 회수 2.7년.
            </div>
            <div className="mt-2 text-[12px] font-semibold text-gray-500">2026년 시 보조금 잔여 28대 · 신청 마감 9월</div>
          </div>
        </Panel>
      </div>

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
        산정 기준 — 경유 1,550원/L · 절감량은 도입 전 12개월 베이스라인 대비 실측 (OBD·DTG 교차 검증) · 상단 실시간 감축은 시뮬레이터 9대 엔진 집계
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
