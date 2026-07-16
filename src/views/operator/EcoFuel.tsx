import { Panel } from '../../components/ui'
import { useSim } from '../../sim/store'
import { ROUTES } from '../../sim/routes'

/**
 * 연료·에코 AI — 사후 집계가 아닌 "예방형 연료절감".
 * 연료 낭비를 4요인으로 분해하고, 코칭으로 줄일 수 있는 부분을 대구 전 차량 연간으로 환산.
 */

const CNG_PRICE = 1055 // 원/N㎥
const DAEGU_CNG_FLEET = 1513
const OPERATING_DAYS = 330

const WASTE_META = [
  { key: 'habit', label: '운전습관', desc: '급가감속 페널티', color: '#f59e0b', coachable: true },
  { key: 'harsh', label: '급조작', desc: '급가속·급제동 순간 소모', color: '#ef4444', coachable: true },
  { key: 'idle', label: '공회전', desc: '불필요 정차 공회전', color: '#eab308', coachable: true },
  { key: 'ac', label: '냉방부하', desc: '폭염 냉방(환경 요인)', color: '#6366f1', coachable: false },
] as const

export default function EcoFuel() {
  const snap = useSim()

  // 전 차량 낭비 합산
  const agg = snap.vehicles.reduce(
    (a, v) => ({
      idle: a.idle + v.fuelWaste.idle,
      harsh: a.harsh + v.fuelWaste.harsh,
      habit: a.habit + v.fuelWaste.habit,
      ac: a.ac + v.fuelWaste.ac,
    }),
    { idle: 0, harsh: 0, habit: 0, ac: 0 },
  )
  const totalWaste = agg.idle + agg.harsh + agg.habit + agg.ac
  const coachable = agg.idle + agg.harsh + agg.habit // 냉방 제외
  const { kpi } = snap

  // 코칭 가능 낭비를 대구 전 차량 연간으로 환산
  const running = snap.vehicles.length
  const perVehicleCoachable = running > 0 ? coachable / running : 0
  const annualWon = perVehicleCoachable * DAEGU_CNG_FLEET * OPERATING_DAYS * CNG_PRICE
  const annualEok = annualWon / 100_000_000

  // 경제운전 순위
  const ecoRank = [...snap.vehicles].sort((a, b) => b.ecoScore - a.ecoScore)

  const pct = (x: number) => (totalWaste > 0 ? (x / totalWaste) * 100 : 0)

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 요약 */}
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-gray-900/40 px-5 py-4">
        <div className="text-[10px] font-semibold tracking-widest text-emerald-400">ECO-DRIVING AI · 예방형 연료절감</div>
        <div className="mt-1 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-100">연료 절감 AI</h2>
            <div className="mt-0.5 text-[11px] text-gray-500">
              낭비가 일어난 뒤 벌점을 매기는 사후 집계가 아니라, 앞 상황을 예측해 관성주행을 실시간으로
              안내해 낭비를 발생 전에 억제합니다.
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tabular-nums text-emerald-400">{kpi.fuelSavedPct.toFixed(1)}%</div>
            <div className="text-[10px] text-gray-500">현재 코칭 절감률</div>
          </div>
        </div>
      </div>

      {/* 낭비 원인 분해 (waterfall bar) */}
      <Panel title="🔎 연료 낭비 원인 분해 (전 차량 누적)" right={<span className="text-[11px] text-gray-500">코칭 가능분 vs 환경 요인</span>}>
        {totalWaste < 0.05 ? (
          <div className="py-6 text-center text-xs text-gray-600">
            데이터 수집 중 — 배속을 올리면 낭비 요인이 집계됩니다
          </div>
        ) : (
          <>
            <div className="flex h-6 w-full overflow-hidden rounded-md">
              {WASTE_META.map((w) => (
                <div
                  key={w.key}
                  className="h-full transition-all"
                  style={{ width: `${pct(agg[w.key])}%`, background: w.color }}
                  title={`${w.label} ${pct(agg[w.key]).toFixed(0)}%`}
                />
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {WASTE_META.map((w) => (
                <div key={w.key} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: w.color }} />
                  <span className="w-16 font-semibold text-gray-300">{w.label}</span>
                  <span className="w-28 text-gray-500">{w.desc}</span>
                  <span className="w-10 text-right tabular-nums text-gray-400">{pct(agg[w.key]).toFixed(0)}%</span>
                  {w.coachable ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                      코칭 가능
                    </span>
                  ) : (
                    <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[9px] text-gray-500">환경 요인</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      {/* AI 절감 시뮬레이션 */}
      <Panel title="💡 AI 절감 시뮬레이션" right={<span className="text-[11px] text-gray-500">코칭 가능분 → 대구 전 차량 연간</span>}>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-gray-800/50 px-3 py-3">
            <div className="text-xl font-extrabold tabular-nums text-gray-100">
              {totalWaste > 0 ? Math.round((coachable / totalWaste) * 100) : 0}%
            </div>
            <div className="mt-0.5 text-[10px] text-gray-500">낭비 중 코칭으로 개선 가능</div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 px-3 py-3">
            <div className="text-xl font-extrabold tabular-nums text-emerald-400">약 {annualEok.toFixed(1)}억원</div>
            <div className="mt-0.5 text-[10px] text-gray-500">연간 재정 절감 여력 (1,513대)</div>
          </div>
          <div className="rounded-lg bg-gray-800/50 px-3 py-3">
            <div className="text-xl font-extrabold tabular-nums text-gray-100">{kpi.totalCo2SavedKg.toFixed(1)}kg</div>
            <div className="mt-0.5 text-[10px] text-gray-500">현재 CO₂ 절감</div>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-emerald-300/80">
          🤖 AI 제안: 낭비 1위 요인({WASTE_META.slice().sort((a, b) => agg[b.key] - agg[a.key])[0].label})부터 4주
          집중 코칭 시 절감률 추가 개선 예상. 예측형 에코 코칭(정류장 전 관성주행 안내)은 급조작·공회전을
          발생 전에 억제합니다.
          <br />
          <span className="text-gray-600">
            * 환산은 금일 실측 코칭가능 낭비 × 운행일수 × CNG 단가(1,055원/N㎥) 단순 선형 — 실증 시 실측 대체
          </span>
        </div>
      </Panel>

      {/* 차량별 경제운전 순위 */}
      <Panel title="🌿 경제운전(관성주행) 순위" right={<span className="text-[11px] text-gray-500">정류장 전 발 떼기 비율</span>}>
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-gray-800 text-[10px] text-gray-500">
              <th className="pb-1.5 font-medium">순위</th>
              <th className="pb-1.5 font-medium">차량</th>
              <th className="pb-1.5 font-medium">기사</th>
              <th className="pb-1.5 font-medium">노선</th>
              <th className="pb-1.5 font-medium">경제운전</th>
              <th className="pb-1.5 font-medium">연비</th>
              <th className="pb-1.5 font-medium">낭비 1위</th>
            </tr>
          </thead>
          <tbody>
            {ecoRank.map((v, i) => {
              const route = ROUTES.find((r) => r.id === v.routeId)!
              const eff = v.fuelM3 > 0 ? v.distanceKm / v.fuelM3 : 0
              const top = [
                ['운전습관', v.fuelWaste.habit],
                ['공회전', v.fuelWaste.idle],
                ['급조작', v.fuelWaste.harsh],
                ['냉방', v.fuelWaste.ac],
              ].sort((a, b) => (b[1] as number) - (a[1] as number))[0]
              return (
                <tr key={v.id} className="border-b border-gray-800/40 last:border-0">
                  <td className="py-1.5 tabular-nums text-gray-400">{i + 1}</td>
                  <td className="py-1.5 font-mono text-gray-300">{v.id.slice(-4)}호</td>
                  <td className="py-1.5 text-gray-400">{v.driverName}</td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <span className="h-2 w-2 rounded-full" style={{ background: route.color }} />
                      {route.name}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`font-bold tabular-nums ${
                        v.ecoScore >= 85 ? 'text-emerald-400' : v.ecoScore >= 70 ? 'text-amber-400' : 'text-red-400'
                      }`}
                    >
                      {Math.round(v.ecoScore)}
                    </span>
                  </td>
                  <td className="py-1.5 tabular-nums text-gray-400">{eff.toFixed(2)}km/m³</td>
                  <td className="py-1.5 text-gray-500">{(top[1] as number) > 0.02 ? String(top[0]) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
