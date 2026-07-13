import { useMemo, useState } from 'react'
import { Panel, simClock } from '../../components/ui'
import MapView from '../../components/MapView'
import { useSim } from '../../sim/store'
import { ROUTES } from '../../sim/routes'
import { indexPolyline, pointAt, haversine } from '../../sim/geo'
import { RISK_EVENT_TYPES, type RiskEventType } from '../../sim/types'

/** 이벤트 좌표 → 최근접 정류장 이름 */
const ALL_STOPS = ROUTES.flatMap((r) => {
  const idx = indexPolyline(r.points)
  return r.stops.map((s) => ({ name: s.name, pos: pointAt(idx, s.at * idx.totalM).pos }))
})
function nearestStop(lat: number, lng: number): string {
  let best = ALL_STOPS[0]
  let bd = Infinity
  for (const s of ALL_STOPS) {
    const d = haversine([lat, lng], s.pos)
    if (d < bd) {
      bd = d
      best = s
    }
  }
  return `${best.name} 인근`
}

/**
 * 운행 이력 — qdrive.co.kr의 "운행 이력 한눈에 보기 / 안전운전 리포트" 반영.
 * 회차별 운행 시작·종료 시간, 이동 거리, 연비, 탄소 절감량 조회 (공단 521 패킷 기반).
 */
export default function TripsLog() {
  const snap = useSim()
  const [vehicleFilter, setVehicleFilter] = useState('전체')
  const [typeFilter, setTypeFilter] = useState<RiskEventType | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const trips = snap.trips.filter((t) => vehicleFilter === '전체' || t.vehicleId === vehicleFilter)
  const totals = trips.reduce(
    (a, t) => ({ dist: a.dist + t.distanceKm, fuel: a.fuel + t.fuelM3, co2: a.co2 + t.co2Kg }),
    { dist: 0, fuel: 0, co2: 0 },
  )

  const v = vehicleFilter === '전체' ? null : snap.vehicles.find((x) => x.id === vehicleFilter)
  const riskTotal = v ? RISK_EVENT_TYPES.reduce((s, t) => s + v.eventCounts[t], 0) : null

  const typeEvents =
    v && typeFilter
      ? snap.events.filter((e) => e.vehicleId === v.id && e.eventType === typeFilter).slice(0, 8)
      : []

  // 열린 이벤트의 좌표는 과거 기록이라 안정적 — openKey만으로 memo (매 틱 flyTo 방지)
  const focusTarget = useMemo(() => {
    if (!openKey || !v || !typeFilter) return null
    const e = snap.events.find(
      (x) => x.vehicleId === v.id && x.eventType === typeFilter && String(x.simTime) === openKey,
    )
    if (!e) return null
    return {
      lat: e.lat,
      lng: e.lng,
      label: `${v.id.slice(-4)}호 ${e.eventType} · ${simClock(e.simTime)}`,
      nonce: e.simTime,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Panel
        title="🗂️ 운행 이력 — 차량 데이터를 한눈에, 실시간으로"
        right={
          <select
            value={vehicleFilter}
            onChange={(e) => {
              setVehicleFilter(e.target.value)
              setTypeFilter(null)
            }}
            className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] font-semibold text-gray-200"
          >
            <option value="전체">전체 차량</option>
            {snap.vehicles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}
              </option>
            ))}
          </select>
        }
      >
        {/* 합계 요약 */}
        <div className="mb-3 grid grid-cols-4 gap-2 text-center">
          {[
            ['운행 회차', `${trips.length}회`, 'text-gray-100'],
            ['이동 거리', `${totals.dist.toFixed(1)}km`, 'text-gray-100'],
            ['연료 사용', `${totals.fuel.toFixed(1)}m³`, 'text-gray-100'],
            ['탄소 배출', `${totals.co2.toFixed(1)}kg`, 'text-emerald-400'],
          ].map(([k, val, cls]) => (
            <div key={k as string} className="rounded-lg bg-gray-800/50 py-2">
              <div className={`text-lg font-extrabold tabular-nums ${cls}`}>{val}</div>
              <div className="text-[10px] text-gray-500">{k}</div>
            </div>
          ))}
        </div>

        {/* 회차 테이블 */}
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-gray-800 text-[10px] text-gray-500">
              <th className="pb-1.5 font-medium">차량</th>
              <th className="pb-1.5 font-medium">노선</th>
              <th className="pb-1.5 font-medium">운행 시작</th>
              <th className="pb-1.5 font-medium">운행 종료</th>
              <th className="pb-1.5 font-medium">거리</th>
              <th className="pb-1.5 font-medium">연료</th>
              <th className="pb-1.5 font-medium">연비</th>
              <th className="pb-1.5 font-medium">CO₂</th>
            </tr>
          </thead>
          <tbody>
            {trips.slice(0, 20).map((t, i) => (
              <tr key={i} className="border-b border-gray-800/40 last:border-0">
                <td className="py-1.5 font-mono text-gray-300">{t.vehicleId.slice(-4)}호</td>
                <td className="py-1.5 text-gray-400">{t.routeName}</td>
                <td className="py-1.5 font-mono text-gray-400">{simClock(t.startSimTime)}</td>
                <td className="py-1.5 font-mono text-gray-400">{simClock(t.endSimTime)}</td>
                <td className="py-1.5 tabular-nums text-gray-300">{t.distanceKm}km</td>
                <td className="py-1.5 tabular-nums text-gray-400">{t.fuelM3}m³</td>
                <td className="py-1.5 tabular-nums text-gray-300">
                  {t.fuelM3 > 0 ? (t.distanceKm / t.fuelM3).toFixed(2) : '—'}km/m³
                </td>
                <td className="py-1.5 tabular-nums text-gray-400">{t.co2Kg}kg</td>
              </tr>
            ))}
          </tbody>
        </table>
        {trips.length === 0 && (
          <div className="py-6 text-center text-xs text-gray-600">
            아직 완료된 회차가 없습니다 — 배속을 올리면 운행기록이 쌓입니다
          </div>
        )}
      </Panel>

      {/* 안전운전 리포트 (차량 선택 시) */}
      {v && (
        <Panel title={`🛡️ 안전운전 리포트 — ${v.id} (${v.driverName} 기사)`} right={<span className="text-[11px] text-gray-500">위험 운전 패턴</span>}>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className={`text-3xl font-extrabold tabular-nums ${v.score >= 90 ? 'text-emerald-400' : v.score >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                {Math.round(v.score)}
              </div>
              <div className="text-[10px] text-gray-500">운전점수</div>
            </div>
            <div className="grid flex-1 grid-cols-4 gap-1">
              {RISK_EVENT_TYPES.map((t) => {
                const occurred = snap.events.some((e) => e.vehicleId === v.id && e.eventType === t)
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setTypeFilter(typeFilter === t ? null : t)
                      setOpenKey(null)
                    }}
                    disabled={!occurred}
                    title={occurred ? '클릭하면 발생 위치·상황을 확인합니다' : '발생 없음'}
                    className={`rounded-md py-1.5 text-center transition-colors ${
                      typeFilter === t
                        ? 'bg-sky-500/20 ring-1 ring-sky-500/50'
                        : occurred
                          ? 'bg-gray-800/50 hover:bg-gray-800'
                          : 'cursor-default bg-gray-800/50'
                    }`}
                  >
                    <div className="text-[9px] text-gray-500">{t}</div>
                    <div className={`text-sm font-bold tabular-nums ${v.eventCounts[t] > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                      {v.eventCounts[t]}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 항목 클릭 → 발생 내역, 행 클릭 시 지도 아코디언 펼침 */}
          {typeFilter && (
            <div className="mt-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between text-[10px]">
                <span className="font-bold text-sky-300">
                  📍 {typeFilter} 발생 내역 (정당 판정 포함) — 행을 클릭하면 지도가 펼쳐집니다
                </span>
                <button
                  onClick={() => {
                    setTypeFilter(null)
                    setOpenKey(null)
                  }}
                  className="text-gray-600 hover:text-gray-400"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {typeEvents.map((e) => {
                  const key = String(e.simTime)
                  const open = openKey === key
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setOpenKey(open ? null : key)}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[10px] transition-colors ${
                          open ? 'bg-sky-500/20 ring-1 ring-sky-500/40' : 'bg-gray-800/50 hover:bg-gray-800'
                        }`}
                      >
                        <span className="shrink-0 text-gray-500">{open ? '▾' : '▸'}</span>
                        <span className="font-mono text-gray-400">{simClock(e.simTime)}</span>
                        <span className="tabular-nums text-gray-500">
                          {e.speedKmh}km/h · {e.rpm}rpm
                        </span>
                        <span className="truncate text-gray-300">{nearestStop(e.lat, e.lng)}</span>
                        {e.justified ? (
                          <span
                            className="ml-auto shrink-0 rounded bg-emerald-500/15 px-1 font-bold text-emerald-400"
                            title={e.justifyReason}
                          >
                            🛡 {e.justifyReason}
                          </span>
                        ) : (
                          <span className="ml-auto shrink-0 rounded bg-red-500/15 px-1 font-bold text-red-400">감점</span>
                        )}
                        <span className="shrink-0 text-gray-600">🗺</span>
                      </button>

                      {open && (
                        <div className="mt-1 overflow-hidden rounded-md border border-gray-800">
                          <div className="h-[300px] w-full">
                            <MapView
                              vehicles={[]}
                              events={[]}
                              showHeat={false}
                              focusTarget={focusTarget}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-900/70 px-3 py-2 text-[10px] text-gray-400">
                            <span>
                              🕑 <b className="text-gray-200">{simClock(e.simTime)}</b>
                            </span>
                            <span>
                              📍 <b className="text-gray-200">{nearestStop(e.lat, e.lng)}</b>
                            </span>
                            <span className="tabular-nums">
                              차량속도 <b className="text-gray-200">{e.speedKmh}km/h</b> · RPM{' '}
                              <b className="text-gray-200">{e.rpm}</b>
                            </span>
                            <span>
                              판정{' '}
                              {e.justified ? (
                                <b className="text-emerald-400">🛡 {e.justifyReason} — 감점 제외</b>
                              ) : (
                                <b className="text-red-400">감점 반영</b>
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-2 rounded-md bg-gray-800/40 px-3 py-2 text-[11px] leading-relaxed text-gray-400">
            오늘 위험운전 총 <b className="text-gray-200">{riskTotal}건</b> · 주행{' '}
            <b className="text-gray-200">{v.distanceKm.toFixed(1)}km</b> · 탄소 절감{' '}
            <b className="text-emerald-400">{Math.max(0, (v.baselineFuelM3 - v.fuelM3) * 2.2).toFixed(2)}kg</b>{' '}
            — 기사 앱과 동일 데이터 (탄소 배출과 주행 습관을 시각화한 맞춤 리포트)
          </div>
        </Panel>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2 text-[10px] leading-relaxed text-gray-500">
        💡 qdrive.co.kr 클라우드 관리 기능 매핑: 차량관리·운전 성과 및 안전(관제 현황) · 운행 데이터
        조회(본 화면) · 연비 및 연료 관리(차고지·충전) · 운송사/사용자 관리(3계층 권한 — 실증 시 계정
        체계로 제공)
      </div>
    </div>
  )
}
