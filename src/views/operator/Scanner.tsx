import { useState } from 'react'
import { useSim } from '../../sim/store'
import { buildSensorRows, type SensorRow } from '../../sim/sensors'
import { DEMO_VEHICLE_ID } from '../../sim/engine'
import { ROUTES } from '../../sim/routes'
import { simClock } from '../../components/ui'

function MiniBars({ row }: { row: SensorRow }) {
  return (
    <div className="flex h-4 items-end gap-[3px]">
      {row.history.map((h, i) => (
        <span
          key={i}
          className={`w-[7px] rounded-[1px] ${row.warn ? 'bg-red-500/70' : 'bg-sky-600/60'}`}
          style={{ height: `${Math.max(12, h * 100)}%`, opacity: 0.45 + (i / 12) * 0.55 }}
        />
      ))}
    </div>
  )
}

const GROUP_ORDER = ['ADC', 'ECU', 'GPS', 'SCR'] as const

export default function Scanner() {
  const snap = useSim()
  const [vehicleId, setVehicleId] = useState(DEMO_VEHICLE_ID)
  const v = snap.vehicles.find((x) => x.id === vehicleId) ?? snap.vehicles[0]
  const route = ROUTES.find((r) => r.id === v.routeId)!
  const rows = buildSensorRows(v, snap.fault, snap.simTime)
  const warnCount = rows.filter((r) => r.warn).length
  const aiScore = Math.max(55, Math.round(v.score - warnCount * 6))

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 차량 헤더 — 광주 완료보고 '진단 스캐너' 헤더 재현 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
        <div className="flex items-center gap-4">
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-200"
          >
            {snap.vehicles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500">
            <span className="mr-1 rounded bg-gray-800 px-1.5 py-0.5 font-bold text-gray-300">CNG</span>
            {route.name} · {v.driverName} 기사 · 운행거리 {v.distanceKm.toFixed(2)}km
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="whitespace-nowrap font-mono text-xs text-gray-500">
            ↻ 실시간 조회 {simClock(snap.simTime)} · 1초 단위
          </span>
          <span
            className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold ${
              aiScore >= 85
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                : aiScore >= 75
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                  : 'border-red-500/40 bg-red-500/15 text-red-400'
            }`}
          >
            ● AI 안전점수 {aiScore}점{aiScore < 80 ? ' — 정비 필요' : ''}
          </span>
        </div>
      </div>

      {/* 센서 테이블 */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900/60">
        {GROUP_ORDER.map((g) => (
          <div key={g}>
            <div className="sticky top-0 z-10 border-y border-gray-800 bg-gray-900 px-4 py-1.5 text-[11px] font-bold text-gray-400 first:border-t-0">
              {g}
              <span className="ml-2 font-normal text-gray-600">
                {g === 'ADC' ? '단말기 전원·신호' : g === 'ECU' ? '엔진 제어 계통' : g === 'GPS' ? '위성 항법' : '배기 후처리 (질소산화물)'}
              </span>
            </div>
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <div
                  key={r.name}
                  className={`flex items-center justify-between border-b border-gray-800/40 px-4 py-1.5 ${
                    r.warn ? 'bg-red-500/5' : ''
                  }`}
                >
                  <span className={`w-64 text-xs ${r.warn ? 'font-semibold text-red-300' : 'text-gray-300'}`}>
                    {r.warn && '⚠ '}
                    {r.name} <span className="text-gray-600">({r.unit})</span>
                  </span>
                  <MiniBars row={r} />
                  <span
                    className={`w-24 text-right font-mono text-xs tabular-nums ${
                      r.warn ? 'font-bold text-red-400' : 'text-gray-200'
                    }`}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2 text-[11px] text-gray-500">
        💡 GPS 속도와 <b className="text-gray-300">내부 차량속도</b>의 차이가 표시됩니다 — Qdrive는 점수
        산출에 GPS가 아닌 차량 내부속도를 사용해, 터널·고층 사이 등 GPS 음영·오차 구간에서도 운전점수가
        일관되게 유지됩니다. 냉각수온이 상승하면 해당 행이 붉게 강조됩니다.
      </div>
    </div>
  )
}
