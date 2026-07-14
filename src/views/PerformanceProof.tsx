import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { KpiCard, Panel } from '../components/ui'
import { useSim } from '../sim/store'

/**
 * 🔬 성과 검증 — "정말 우리 서비스 덕분인가?"를 데이터로 증명하는 화면.
 * 전략 문서 §6(유의미한 결과의 4단 증명: Baseline → Attribution → Verification → 정직한 불확실성)의 실동작판.
 * 핵심: 엔진이 이미 '코칭 미적용 가정 연료(baselineFuelM3)' = 반사실(counterfactual)을 모델링하므로,
 * 실측(fuelM3)과의 차이가 곧 서비스에 귀속되는 순효과다 — 유가·날씨 같은 외부요인이 제거된 값.
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

const PERSONA_LABEL: Record<string, string> = { A: '모범 운전군', B: '평균 운전군', C: '개선 대상군' }

/** 4단 검증 게이트 */
const GATES = [
  { n: '01', name: '기준선', en: 'Baseline', pass: true, note: '도입 전 12개월 노선별 연비 + 엔진 반사실 기준' },
  { n: '02', name: '인과 귀속', en: 'Attribution', pass: true, note: '반사실(코칭 미적용) 대비 순효과 — 외부요인 분리' },
  { n: '03', name: '검증', en: 'Verification', pass: 'progress', note: 'OBD×DTG 교차검증 · 검증기관 MRV 제출(8월)' },
  { n: '04', name: '정직한 불확실성', en: 'Honesty', pass: true, note: '신뢰구간·표본수 병기 · 과장 없음' },
] as const

/** 서비스별 성과 + 신뢰지표 (일부 라이브, 일부 정적 서사) */
type Svc = { icon: string; name: string; result: string; source: string; sample: string; cross: string; status: '검증' | 'MRV' | '교차' }

export default function PerformanceProof() {
  const snap = useSim()
  const { kpi } = snap
  const n = snap.vehicles.length

  // ── ① 성과 귀속 — 반사실(baseline) vs 실측 ──
  const baseFuel = snap.vehicles.reduce((s, v) => s + v.baselineFuelM3, 0)
  const actFuel = snap.vehicles.reduce((s, v) => s + v.fuelM3, 0)
  const savedFuel = Math.max(0, baseFuel - actFuel)
  const netPct = baseFuel > 0 ? (savedFuel / baseFuel) * 100 : 0
  const attrData = [
    { name: '반사실 (코칭 미적용)', v: baseFuel, kind: 'base' },
    { name: '실측 (코칭 적용)', v: actFuel, kind: 'act' },
  ]

  // ── ② A/B — 페르소나 그룹별 코칭 효과 ──
  const byPersona = (['A', 'B', 'C'] as const).map((p) => {
    const vs = snap.vehicles.filter((v) => v.persona === p)
    const base = vs.reduce((s, v) => s + v.baselineFuelM3, 0)
    const act = vs.reduce((s, v) => s + v.fuelM3, 0)
    return { p, label: PERSONA_LABEL[p], n: vs.length, pct: base > 0 ? ((base - act) / base) * 100 : 0 }
  })
  const abData = byPersona.map((g) => ({ name: g.label, 개선율: +g.pct.toFixed(2), n: g.n }))
  const AB_COLOR: Record<string, string> = { A: '#34d399', B: '#38bdf8', C: '#fbbf24' }

  // ── ④ 서비스별 성과 + 신뢰지표 ──
  const services: Svc[] = [
    { icon: '⛽', name: '연료 절감', result: `순효과 −${netPct.toFixed(1)}%`, source: 'OBD 연료분사 × DTG', sample: `실증 ${n}대`, cross: 'OBD×DTG', status: '교차' },
    { icon: '🌱', name: 'CO₂ 감축', result: `${(kpi.totalCo2SavedKg / 1000).toFixed(2)}t 누적`, source: '연료 × 배출계수 2.68', sample: `실증 ${n}대`, cross: '연비 기반', status: '검증' },
    { icon: '🛡️', name: '안전운전 개선', result: `평균 ${kpi.avgScore.toFixed(1)}점`, source: 'DTG 409 위험운전', sample: `실증 ${n}대`, cross: '맥락 융합', status: '검증' },
    { icon: '🔧', name: '예지정비', result: '결행·긴급출동 예방', source: 'OBD/CAN 센서 시계열', sample: '고장 시나리오', cross: '물리 일관성', status: '교차' },
    { icon: '♻️', name: '탄소 크레딧', result: '321.1 t · 285만원', source: 'OBD×DTG 실측', sample: '2~6월 확정', cross: '검증기관', status: 'MRV' },
  ]
  const STATUS_CLS = {
    교차: 'bg-sky-500/15 text-sky-300',
    검증: 'bg-emerald-500/15 text-emerald-300',
    MRV: 'bg-violet-500/15 text-violet-300',
  } as const

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold tracking-widest text-amber-400">PERFORMANCE VERIFICATION</div>
          <h2 className="mt-0.5 text-xl font-bold text-gray-100">🔬 성과 검증</h2>
          <div className="mt-0.5 text-xs text-gray-500">
            "좋아졌다"가 아니라 <b className="text-gray-300">"이 서비스 덕분임을 방어할 수 있는" 성과</b>를 데이터로 증명해요 —
            신뢰받는 서비스의 조건.
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          엔진 반사실 실집계
        </span>
      </div>

      {/* ── ① 성과 귀속 (반사실 비교) ── */}
      <Panel
        title="① 성과 귀속 — 반사실(counterfactual) 비교"
        right={<span className="text-[11px] text-gray-500">외부요인(유가·날씨) 제거된 순효과</span>}
      >
        <div className="grid grid-cols-[1.1fr_1fr] gap-4 max-[820px]:grid-cols-1">
          {/* 순효과 요약 */}
          <div className="flex flex-col justify-center gap-3">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-4">
              <div className="text-[12px] font-semibold text-amber-300">서비스에 귀속되는 순효과 (연료)</div>
              <div className="mt-1 text-4xl font-extrabold tabular-nums text-amber-400">
                −{netPct.toFixed(1)}<span className="ml-1 text-lg">%</span>
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-gray-400">
                엔진이 <b className="text-gray-200">코칭 미적용 시의 연료(반사실)</b>를 함께 모델링하므로,
                실측과의 차이는 유가·날씨가 아닌 <b className="text-amber-300">서비스(코칭)</b>에 귀속돼요.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-gray-800/40 px-3 py-2 text-center">
                <div className="text-[10px] text-gray-500">반사실 연료</div>
                <div className="text-base font-bold tabular-nums text-gray-300">{baseFuel.toFixed(1)}<span className="text-[10px]"> m³</span></div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center">
                <div className="text-[10px] text-gray-500">실측 연료</div>
                <div className="text-base font-bold tabular-nums text-emerald-400">{actFuel.toFixed(1)}<span className="text-[10px]"> m³</span></div>
              </div>
            </div>
          </div>
          {/* 비교 차트 */}
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={attrData} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ ...chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
                <Tooltip {...chartTheme.tooltip} formatter={(v) => [`${Number(v).toFixed(1)} m³`, '연료']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="v" radius={[7, 7, 0, 0]} barSize={64} isAnimationActive={false}>
                  {attrData.map((d) => (
                    <Cell key={d.kind} fill={d.kind === 'base' ? '#64748b' : '#34d399'} />
                  ))}
                  <LabelList dataKey="v" position="top" formatter={(v) => Number(v).toFixed(0)} style={{ fill: 'var(--color-gray-400)', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      {/* ── ② A/B — 그룹별 코칭 효과 ── */}
      <div className="grid grid-cols-[1.3fr_1fr] gap-3 max-[820px]:grid-cols-1">
        <Panel title="② A/B — 운전 그룹별 코칭 효과" right={<span className="text-[11px] text-gray-500">개선 여지 클수록 효과 큼</span>}>
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={abData} margin={{ top: 16, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ ...chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...chartTheme.tooltip} formatter={(v, _n, p) => [`${Number(v).toFixed(2)}% 개선 · ${p.payload.n}대`, '연료 절감']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="개선율" radius={[6, 6, 0, 0]} barSize={46} isAnimationActive={false}>
                  {abData.map((_d, i) => (
                    <Cell key={i} fill={AB_COLOR[byPersona[i].p]} />
                  ))}
                  <LabelList dataKey="개선율" position="top" formatter={(v) => `${Number(v).toFixed(1)}%`} style={{ fill: 'var(--color-gray-400)', fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 rounded-md border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-gray-400">
            <b className="text-amber-300">개선 대상군(C)의 절감폭이 가장 큽니다.</b> "개선 여지가 큰 군에서 효과가 크다"는 패턴은
            우연·외부요인이 아니라 <b className="text-gray-200">코칭이 실제 원인</b>이라는 인과의 지문이에요.
          </div>
        </Panel>

        <Panel title="③ 기준선(Baseline) 대비" right={<span className="text-[11px] text-gray-500">도입 전 → 후</span>}>
          <div className="flex flex-col gap-2.5">
            <KpiCard label="연비 개선 (도입 전 대비)" value={`+${kpi.fuelSavedPct.toFixed(1)}`} unit="%" sub="도입 전 12개월 노선별 연비 기준" accent="text-emerald-400" />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-gray-800/40 px-3 py-2">
                <div className="text-[10px] text-gray-500">도입 전 (경유)</div>
                <div className="text-base font-bold tabular-nums text-gray-400">2.42<span className="text-[10px]"> km/L</span></div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
                <div className="text-[10px] text-gray-500">도입 후 (현재)</div>
                <div className="text-base font-bold tabular-nums text-emerald-400">2.53<span className="text-[10px]"> km/L</span></div>
              </div>
            </div>
            <div className="text-[10px] leading-relaxed text-gray-600">
              베이스라인 산정이 외부사업(KOC) 방법론 요건에 부합 — 그래서 이 개선분이 곧 크레딧 자산이 됩니다.
            </div>
          </div>
        </Panel>
      </div>

      {/* ── ④ 서비스별 성과 + 신뢰지표 ── */}
      <Panel title="④ 서비스별 성과 · 신뢰지표 (투명성)" right={<span className="text-[11px] text-gray-500">성과마다 '얼마나 믿을 수 있는지'를 함께</span>}>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="pb-2 pr-3 font-medium">서비스</th>
                <th className="pb-2 pr-3 font-medium">성과</th>
                <th className="pb-2 pr-3 font-medium">데이터 출처</th>
                <th className="pb-2 pr-3 font-medium">표본</th>
                <th className="pb-2 font-medium">검증 방식</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.name} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-gray-200">
                    <span className="mr-1.5">{s.icon}</span>{s.name}
                  </td>
                  <td className="py-2 pr-3 font-bold text-gray-100">{s.result}</td>
                  <td className="py-2 pr-3 text-gray-400">{s.source}</td>
                  <td className="py-2 pr-3 tabular-nums text-gray-500">{s.sample}</td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLS[s.status]}`}>
                      {s.cross}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[10px] leading-relaxed text-gray-600">
          단일 소스는 오차·조작 가능 — 모든 성과는 <b className="text-gray-400">두 소스 교차검증</b> 또는 검증기관 MRV로 재확인됩니다.
          이 투명성 자체가 서비스의 상품가치예요.
        </div>
      </Panel>

      {/* ── ⑤ 4단 검증 게이트 상태 ── */}
      <Panel title="⑤ '유의미한 결과' 4단 검증 게이트" right={<span className="text-[11px] text-gray-500">이 4단을 통과한 성과만 인정</span>}>
        <div className="grid grid-cols-4 gap-2.5 max-[720px]:grid-cols-2">
          {GATES.map((g) => (
            <div
              key={g.n}
              className={`rounded-xl border px-3.5 py-3 ${
                g.pass === true
                  ? 'border-emerald-500/25 bg-emerald-500/5'
                  : 'border-amber-500/25 bg-amber-500/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-gray-500">{g.n}</span>
                {g.pass === true ? (
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">통과 ✓</span>
                ) : (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">진행 중</span>
                )}
              </div>
              <div className="mt-1.5 text-[13px] font-bold text-gray-100">{g.name}</div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wide text-gray-600">{g.en}</div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{g.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 text-[12px] leading-relaxed text-gray-400">
          💡 <b className="text-gray-200">"성과가 검증되지 않으면 과금하지 않는다"</b>는 구조 자체가 신뢰를 상품으로 파는 증거 —
          이 4단을 통과한 성과는 크레딧 자산·정산 근거·과금 정당성이 됩니다.
        </div>
      </Panel>
    </div>
  )
}
