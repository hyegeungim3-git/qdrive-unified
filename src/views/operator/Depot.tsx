import { Panel } from '../../components/ui'
import { useSim } from '../../sim/store'
import { ROUTES } from '../../sim/routes'

/** CNG 잔량 추정 (데모: 만충 기준 소모량 차감) */
function fuelLevel(fuelM3: number): number {
  return Math.max(8, Math.round(100 - fuelM3 * 2.4))
}

export default function Depot() {
  const snap = useSim()
  const inMaintenance = snap.workOrders.filter((w) => w.status === '발행됨').length
  const dispatchable = snap.vehicles.length - inMaintenance
  const rainy = snap.weather.condition === '폭우'

  const byFuel = [...snap.vehicles].map((v) => ({ v, level: fuelLevel(v.fuelM3) })).sort((a, b) => a.level - b.level)

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 차고지 운영 에이전트 요약 */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-bold text-sky-300">🏭 차고지 운영 에이전트 — 내일 첫차 기준</div>
        <div className="mt-1.5 text-xs leading-relaxed text-gray-400">
          출고 필요 차량 <b className="text-gray-200">{snap.vehicles.length}대</b> · 현재 출고 가능{' '}
          <b className={dispatchable < snap.vehicles.length ? 'text-amber-400' : 'text-emerald-400'}>
            {dispatchable}대
          </b>
          {inMaintenance > 0 && (
            <>
              {' '}
              · 정비대기 <b className="text-amber-400">{inMaintenance}대</b> (3742호 냉각계통 — 작업지시
              발행됨)
            </>
          )}
          {' · '}충전미완료 <b className="text-gray-200">{byFuel.filter((x) => x.level < 40).length}대</b> ·
          충전기 3번 점검중으로 충전 순서 자동 조정
          {(rainy || inMaintenance > 0) && (
            <span className="text-sky-300">
              {' '}
              → <b>예비차 {rainy && inMaintenance > 0 ? 2 : 1}대 선배정 권고</b>
              {rainy && ' (폭우 — 지연·수요 변동 대비)'}
            </span>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 min-[900px]:grid-cols-2">
        {/* 충전 스케줄 */}
        <Panel title="⛽ CNG 충전 스케줄 (심야 자동 편성)" right={<span className="text-[11px] text-gray-500">단가 유리 시간대 우선</span>}>
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-[10px] text-gray-500">
                <th className="pb-1.5 font-medium">차량</th>
                <th className="pb-1.5 font-medium">잔량</th>
                <th className="pb-1.5 font-medium">충전 예약</th>
                <th className="pb-1.5 font-medium">슬롯</th>
              </tr>
            </thead>
            <tbody>
              {byFuel.map(({ v, level }, i) => (
                <tr key={v.id} className="border-t border-gray-800/50">
                  <td className="py-1.5 font-mono text-gray-300">{v.id.slice(-4)}호</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className={`h-full ${level < 30 ? 'bg-red-500' : level < 55 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${level}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-gray-400">{level}%</span>
                    </div>
                  </td>
                  <td className="py-1.5 font-mono text-gray-400">
                    {['23:00', '23:40', '00:20', '01:00', '01:40', '02:20', '03:00', '03:40', '04:20'][i] ?? '—'}
                  </td>
                  <td className="py-1.5 text-gray-400">{['1번', '2번', '4번', '1번', '2번', '4번', '1번', '2번', '4번'][i] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[10px] leading-relaxed text-gray-600">
            ※ 전기버스 전환 시 SOC·배터리 열화(SOH)·동절기 성능저하를 반영한 충전계획으로 확장 예정 (2차 로드맵)
          </div>
        </Panel>

        <div className="flex flex-col gap-3">
          {/* 충전기 상태 */}
          <Panel title="충전기 상태">
            <div className="grid grid-cols-4 gap-2">
              {[
                ['1번', '정상', 'emerald'],
                ['2번', '정상', 'emerald'],
                ['3번', '점검중', 'red'],
                ['4번', '정상', 'emerald'],
              ].map(([n, s, c]) => (
                <div
                  key={n as string}
                  className={`rounded-lg border px-2 py-2.5 text-center ${
                    c === 'red' ? 'border-red-500/30 bg-red-500/10' : 'border-gray-800 bg-gray-800/40'
                  }`}
                >
                  <div className="text-xs font-bold text-gray-200">{n}</div>
                  <div className={`mt-0.5 text-[10px] font-semibold ${c === 'red' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {s}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* 예비차 */}
          <Panel title="예비차 운영" className="flex-1">
            <div className="space-y-2 text-xs">
              {[
                { id: '대구70자8801', status: rainy || inMaintenance > 0 ? '선배정 — 대기 중' : '차고지 대기', active: rainy || inMaintenance > 0 },
                { id: '대구70자8802', status: rainy && inMaintenance > 0 ? '선배정 — 대기 중' : '차고지 대기', active: rainy && inMaintenance > 0 },
              ].map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md bg-gray-800/40 px-3 py-2">
                  <span className="font-mono text-gray-300">{r.id}</span>
                  <span className={`text-[10px] font-semibold ${r.active ? 'text-sky-300' : 'text-gray-500'}`}>
                    {r.active ? '🔵 ' : '⚪ '}
                    {r.status}
                  </span>
                </div>
              ))}
              <div className="rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2 text-[10px] leading-relaxed text-gray-500">
                투입 판단 요소: 정비대기 대수 · 날씨(폭우/폭염) · 행사/재난 수요 예측 · 노선별 결행 위험.
                투입은 <b className="text-gray-300">관제 승인 후 실행</b>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* 노선별 출고 배정 */}
      <Panel title="내일 출고 배정 (자동 생성 초안)">
        <div className="grid grid-cols-1 gap-2 text-[11px] min-[480px]:grid-cols-2 min-[720px]:grid-cols-3">
          {ROUTES.map((r) => {
            const buses = snap.vehicles.filter((v) => v.routeId === r.id)
            return (
              <div key={r.id} className="rounded-lg bg-gray-800/40 px-3 py-2">
                <div className="flex items-center gap-1.5 font-bold text-gray-200">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.name} — {buses.length}대
                </div>
                <div className="mt-1 text-gray-500">
                  첫차 05:30 · {buses.map((b) => b.id.slice(-4)).join(' · ')}
                  {inMaintenance > 0 && buses.some((b) => b.id === '대구70자3742') && (
                    <span className="text-amber-400"> (3742 → 예비차 8801 대체)</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
