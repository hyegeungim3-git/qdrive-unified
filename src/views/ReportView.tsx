import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard, Panel } from '../components/ui'

/**
 * 도입 전 4주 / 후 4주 비교 데이터 (실증 리포트 형식 목업).
 * 실증 단계에서 실측치로 교체 — 이 리포트 포맷 자체가 MRV 설계의 산출물.
 */
const WEEKLY = [
  { week: 'W-4', phase: '도입 전', kmPerM3: 1.71, events: 44, score: 70 },
  { week: 'W-3', phase: '도입 전', kmPerM3: 1.74, events: 41, score: 71 },
  { week: 'W-2', phase: '도입 전', kmPerM3: 1.72, events: 43, score: 70 },
  { week: 'W-1', phase: '도입 전', kmPerM3: 1.73, events: 42, score: 72 },
  { week: 'W+1', phase: '도입 후', kmPerM3: 1.79, events: 33, score: 78 },
  { week: 'W+2', phase: '도입 후', kmPerM3: 1.85, events: 26, score: 83 },
  { week: 'W+3', phase: '도입 후', kmPerM3: 1.9, events: 21, score: 86 },
  { week: 'W+4', phase: '도입 후', kmPerM3: 1.93, events: 18, score: 88 },
]

const before = WEEKLY.filter((w) => w.phase === '도입 전')
const after = WEEKLY.filter((w) => w.phase === '도입 후')
const avgBefore = before.reduce((s, w) => s + w.kmPerM3, 0) / before.length
const avgAfter = after.reduce((s, w) => s + w.kmPerM3, 0) / after.length
const improvement = ((avgAfter - avgBefore) / avgBefore) * 100

const chartTheme = {
  grid: '#1f2937',
  tick: { fill: '#6b7280', fontSize: 11 },
  tooltip: {
    contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 },
  },
}

export default function ReportView() {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto pr-1">
      {/* 리포트 헤더 */}
      <div className="rounded-xl border border-gray-800 bg-gradient-to-r from-gray-900 to-gray-900/40 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-widest text-sky-400">
              MRV MEASUREMENT · REPORTING · VERIFICATION
            </div>
            <h2 className="mt-1 text-xl font-bold text-gray-100">
              Qdrive 실증 효과 리포트 — 도입 전후 연비 실측 비교
            </h2>
            <div className="mt-1 text-xs text-gray-500">
              대상: 급행1 노선 3대 (CNG) · 기간: 도입 전 4주 / 후 4주 · 측정: 주유량 대사 + DTG 주행거리
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-gray-700 px-3 py-2 text-center text-[10px] text-gray-500">
            제3자 검증
            <br />
            (공인기관)
            <br />
            <span className="text-gray-600">실증 시 확보</span>
          </div>
        </div>
      </div>

      {/* 핵심 수치 */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="연비 개선"
          value={`+${improvement.toFixed(1)}`}
          unit="%"
          sub={`${avgBefore.toFixed(2)} → ${avgAfter.toFixed(2)} km/m³`}
          accent="text-emerald-400"
        />
        <KpiCard label="위험운전 감소" value="−57" unit="%" sub="1,000km당 42.5 → 18.0건" accent="text-emerald-400" />
        <KpiCard label="운전점수" value="70.8 → 88" unit="점" sub="4주 코칭 효과" accent="text-sky-400" />
        <KpiCard
          label="연간 환산 (1,513대)"
          value="약 2.1"
          unit="억원"
          sub="연료비 절감 추정 · CNG 단가 기준"
          accent="text-amber-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="주간 연비 추이 (km/m³)">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={WEEKLY} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <YAxis domain={[1.6, 2.0]} tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <Tooltip {...chartTheme.tooltip} />
                <ReferenceLine x="W+1" stroke="#38bdf8" strokeDasharray="4 3" label={{ value: '도입', fill: '#38bdf8', fontSize: 11, position: 'top' }} />
                <ReferenceLine y={avgBefore} stroke="#4b5563" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="kmPerM3" name="연비" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="위험운전 발생 (건 / 1,000km)">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={WEEKLY} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="events" name="위험운전 이벤트" radius={[4, 4, 0, 0]}
                  fill="#f87171"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* 탄소 환산 */}
      <Panel title="🌍 탄소 절감 환산 — 대구 전체 확대 시나리오">
        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            {
              n: '실증 3대',
              co2: '4.2 톤/년',
              note: '본 실증 실측 기반',
              cls: 'border-emerald-500/30',
            },
            {
              n: '1개 운수사 60대',
              co2: '84 톤/년',
              note: '실측치 선형 환산',
              cls: 'border-sky-500/30',
            },
            {
              n: '대구 CNG 1,513대',
              co2: '약 2,100 톤/년',
              note: '연료비 절감 ~2.1억 + 배출권*',
              cls: 'border-amber-500/30',
            },
          ].map((c) => (
            <div key={c.n} className={`rounded-xl border bg-gray-900/60 px-4 py-4 text-center ${c.cls}`}>
              <div className="text-xs text-gray-500">{c.n}</div>
              <div className="mt-1 text-2xl font-black text-gray-100">{c.co2}</div>
              <div className="mt-1 text-[11px] text-gray-500">{c.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] leading-relaxed text-gray-600">
          * 배출권 수익은 전기버스 전환분 한정·방법론 검토단계로 보수적으로 표기 (KAU 시세 2026.6 기준
          약 2만원/톤). 본 수치는 데모용 목업이며, 실증 단계에서 실측 데이터로 대체됩니다.
        </div>
      </Panel>

      {/* 탄소배출권 — qdrive.co.kr 탄소배출권 페이지 반영 */}
      <Panel title="♻️ 탄소중립과 배출권 — 실측이 자산이 되는 구조" right={<span className="text-[11px] text-gray-500">qdrive.co.kr 서비스 연계</span>}>
        <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs leading-relaxed text-gray-300">
          <b className="text-emerald-400">탄소중립이란</b> — "인간의 활동으로 인해 발생하는
          온실가스(특히 이산화탄소)를 최대한 줄이고, 남은 배출량은 흡수하거나 제거해서 실질적인
          배출량을 <b>0</b>으로 맞추는 것" — 탄소의 순배출량을 '0'으로.
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            ['1. 감축 활동', '에코드라이빙 코칭으로 연료 절감 (본 플랫폼)', 'text-sky-400'],
            ['2. MRV 실측', '측정·보고·검증 — 실증 리포트 포맷 그대로', 'text-sky-400'],
            ['3. 인증', '외부사업 방법론 승인·감축량 인증 (6~12개월)', 'text-amber-400'],
            ['4. 거래·리워드', '배출권 판매 수익 → 운수사·기사 리워드 환원', 'text-emerald-400'],
          ].map(([step, desc, cls]) => (
            <div key={step as string} className="rounded-lg bg-gray-800/50 px-3 py-2.5">
              <div className={`text-[11px] font-bold ${cls}`}>{step}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-gray-500">{desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-gray-600">
          담당 기관: 환경부·한국환경공단(배출권등록부) · 국토교통부·한국교통안전공단(운행 데이터 표준)
        </div>
      </Panel>
    </div>
  )
}
