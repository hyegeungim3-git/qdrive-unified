import { useState } from 'react'
import { engine, useSim } from '../sim/store'
import { DEMO_VEHICLE_ID } from '../sim/engine'
import { ROUTES } from '../sim/routes'
import { indexPolyline } from '../sim/geo'
import type { SimSnapshot, VehicleState } from '../sim/types'
import { simClock } from '../components/ui'

/** 반월당 — 3개 노선이 모두 지나는 데모 기준 정류장 */
const STOP_NAME = '반월당'
const ROUTE_IDX = new Map(ROUTES.map((r) => [r.id, indexPolyline(r.points)]))
const STOP_M = new Map(
  ROUTES.map((r) => {
    const idx = ROUTE_IDX.get(r.id)!
    const stop = r.stops.find((s) => s.name === STOP_NAME)!
    return [r.id, stop.at * idx.totalM]
  }),
)

/** 차량의 특정 지점(targetM)까지 잔여거리(m) — 왕복/순환 모두 처리 */
function remainingToPoint(v: VehicleState, loop: boolean, totalM: number, targetM: number): number {
  if (loop) {
    return ((targetM - v.odoOnRoute) % totalM + totalM) % totalM
  }
  if (v.dir === 1) {
    return targetM >= v.odoOnRoute ? targetM - v.odoOnRoute : totalM - v.odoOnRoute + (totalM - targetM)
  }
  return targetM <= v.odoOnRoute ? v.odoOnRoute - targetM : v.odoOnRoute + targetM
}

function etaMinutes(v: VehicleState, loop: boolean, totalM: number): number {
  const rem = remainingToPoint(v, loop, totalM, STOP_M.get(v.routeId)!)
  const speedMPerMin = (Math.max(v.speedKmh, 16) / 3.6) * 60
  return rem / speedMPerMin
}

/** 노선 내 정류장 이름 → 폴리라인 상 거리(m) */
function stopM(routeId: string, name: string): number {
  const route = ROUTES.find((r) => r.id === routeId)!
  const idx = ROUTE_IDX.get(routeId)!
  const s = route.stops.find((x) => x.name === name)!
  return s.at * idx.totalM
}

function CongestionBadge({ occupancy }: { occupancy: number }) {
  const [label, cls] =
    occupancy >= 0.7
      ? ['혼잡', 'bg-red-500/20 text-red-400 border-red-500/40']
      : occupancy >= 0.4
        ? ['보통', 'bg-amber-500/20 text-amber-400 border-amber-500/40']
        : ['여유', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40']
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
}

/** 시민안내 에이전트 — 운영 데이터를 시민용 문장으로 변환 */
function cityNotice(snap: SimSnapshot): { text: string; tone: 'info' | 'ok' } {
  const accident = snap.incidents.find((i) => i.kind === '사고' && i.status !== '완료')
  if (accident)
    return {
      text: `${accident.title.split(' — ')[0]}가 발생해 해당 구간이 일시 지연될 수 있습니다. 안전 조치 중이니 양해 부탁드립니다.`,
      tone: 'info',
    }
  if (snap.weather.condition === '폭우')
    return {
      text: `호우로 전 노선이 평소보다 약 ${snap.weather.delayForecastMin}분 지연될 수 있습니다. 버스가 안전 속도로 운행 중이니 양해 부탁드립니다.`,
      tone: 'info',
    }
  if (snap.weather.condition === '폭염')
    return { text: '폭염 특보 — 정류장 그늘막·냉방 쉼터를 이용해 주세요. 차내 냉방을 강화 운영 중입니다.', tone: 'info' }
  const wo = snap.workOrders.find((w) => w.status === '발행됨')
  if (wo)
    return {
      text: `급행1 노선 일부 차량이 예방 정비에 들어가 배차 간격이 일시 조정될 수 있습니다. (사전 점검으로 고장 운휴를 예방하고 있어요)`,
      tone: 'info',
    }
  const reco = snap.recommendations.find((r) => r.status !== '실행완료')
  if (reco)
    return { text: '순환2 노선의 배차 간격을 실시간 조정 중입니다. 잠시만 기다려 주세요.', tone: 'info' }
  const c = snap.complaints.find((x) => x.status === '조치중' || x.status === '원인식별')
  if (c) return { text: '접수하신 시민 의견을 데이터로 확인하여 개선 조치 중입니다.', tone: 'info' }
  return { text: '전 노선 정상 운행 중입니다.', tone: 'ok' }
}

export default function PassengerApp() {
  const snap = useSim()
  const notice = cityNotice(snap)
  const myComplaint = snap.complaints[0]

  const [filed, setFiled] = useState(false) // 불편사항 접수 직후 인라인 확인 + 중복 방지

  /* ── 하차 예약 (졸음·놓침 방지) — 예약 정보는 엔진에 저장되어 탭 전환에도 유지 ── */
  const [pickRoute, setPickRoute] = useState<string | null>(null)
  const [destSel, setDestSel] = useState('')
  const [autoSel, setAutoSel] = useState(true) // 기본: 하차벨 자동 예약

  const riding = snap.reservation
  const ridingBus = riding ? snap.vehicles.find((x) => x.id === riding.vehicleId) : null
  const ridingRoute = ridingBus ? ROUTES.find((r) => r.id === ridingBus.routeId)! : null
  const atDest = !!ridingBus && !!riding && ridingBus.nextStopName === riding.stopName
  const arrivedNow = atDest && ridingBus!.dwellRemaining > 0 && ridingBus!.nextStopDistM < 30
  const alarmNow = atDest && !arrivedNow
  const destRemainM =
    ridingBus && riding && ridingRoute
      ? remainingToPoint(
          ridingBus,
          ridingRoute.loop,
          ROUTE_IDX.get(ridingBus.routeId)!.totalM,
          stopM(ridingBus.routeId, riding.stopName),
        )
      : 0

  const board = () => {
    if (!pickRoute || !destSel) return
    const route = ROUTES.find((r) => r.id === pickRoute)!
    const idx = ROUTE_IDX.get(pickRoute)!
    // 급행1은 데모 주인공 차량(3742)에 탑승 — 하차벨이 기사 태블릿 시연으로 이어지도록.
    // 그 외 노선은 반월당에 가장 먼저 도착하는 버스.
    const bus =
      pickRoute === 'R1'
        ? snap.vehicles.find((v) => v.id === DEMO_VEHICLE_ID)
        : snap.vehicles
            .filter((v) => v.routeId === pickRoute)
            .sort((a, b) => etaMinutes(a, route.loop, idx.totalM) - etaMinutes(b, route.loop, idx.totalM))[0]
    if (!bus) return
    engine.setReservation(bus.id, destSel, autoSel)
    setPickRoute(null)
    setDestSel('')
  }

  // 노선별 가장 가까운 버스 1~2대
  const arrivals = ROUTES.map((r) => {
    const idx = ROUTE_IDX.get(r.id)!
    const buses = snap.vehicles
      .filter((v) => v.routeId === r.id)
      .map((v) => ({ v, eta: etaMinutes(v, r.loop, idx.totalM) }))
      .sort((a, b) => a.eta - b.eta)
    return { route: r, buses: buses.slice(0, 2) }
  })

  return (
    <div className="flex h-full items-start justify-center gap-10 overflow-y-auto py-2">
      {/* 폰 프레임 */}
      <div className="relative w-[340px] shrink-0 rounded-[36px] border-4 border-gray-700 bg-black p-2 shadow-2xl">
        <div className="mx-auto mb-1 h-5 w-28 rounded-b-2xl bg-gray-800" />
        <div className="flex h-[620px] flex-col overflow-hidden rounded-[26px] bg-gray-950">
          {/* 헤더 */}
          <div className="bg-gray-900 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-gray-50">
                Q<span className="text-sky-400">drive</span>
                <span className="ml-1.5 text-[10px] font-semibold text-gray-500">시민</span>
              </div>
              <div className="font-mono text-xs text-emerald-400">{simClock(snap.simTime)}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-lg">🚏</span>
              <div>
                <div className="text-base font-bold text-gray-100">{STOP_NAME}</div>
                <div className="text-[10px] text-gray-500">00420 · 도시철도 1·2호선 환승</div>
              </div>
            </div>
          </div>

          {/* 본문 — 스크롤 영역 (하단 액션과 겹침 방지) */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {/* 도착 정보 (탑승 중에는 숨김) */}
          {!riding && (
            <div className="space-y-2 px-3 pt-3">
              {arrivals.map(({ route, buses }) => (
                <div key={route.id} className="rounded-xl bg-gray-900 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-gray-100">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: route.color }} />
                      {route.name}
                    </span>
                    {buses[0] && <CongestionBadge occupancy={buses[0].v.occupancy} />}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {buses.map(({ v, eta }, i) => (
                      <div key={v.id} className="flex items-center justify-between text-[11px]">
                        <span className={i === 0 ? 'font-bold text-sky-300' : 'text-gray-500'}>
                          {eta < 1.2 ? '곧 도착' : `${Math.round(eta)}분 후`}
                          <span className="ml-1.5 font-normal text-gray-600">
                            신뢰도 {v.speedKmh > 12 ? '높음 ●●●' : '보통 ●●○'}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 text-gray-500">
                          {v.occupancy < 0.7 && <span title="휠체어 공간 이용 가능">♿ 가능</span>}
                          <span className="font-mono">{v.id.slice(-4)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 🔔 하차 알림 — 졸아도 놓치지 않게 */}
          <div className="px-3 pt-2">
            {!riding && !pickRoute && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-300">🔔 하차 알림</span>
                  <span className="text-[9px] text-gray-600">깜빡 졸아도 놓치지 않게</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {ROUTES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setPickRoute(r.id)
                        setDestSel('')
                      }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-800 py-1.5 text-[11px] font-bold text-gray-200 hover:bg-gray-700"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                      {r.name} 탑승
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!riding && pickRoute && (
              <div className="rounded-xl border border-sky-500/30 bg-gray-900 px-3 py-2.5">
                <div className="text-[11px] font-bold text-sky-300">
                  🔔 {ROUTES.find((r) => r.id === pickRoute)!.name} — 어디서 내리세요?
                </div>
                <div className="mt-2 flex gap-1.5">
                  <select
                    value={destSel}
                    onChange={(e) => setDestSel(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-gray-200"
                  >
                    <option value="">목적지 정류장 선택</option>
                    {ROUTES.find((r) => r.id === pickRoute)!.stops
                      .filter((s) => s.name !== STOP_NAME)
                      .map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={board}
                    disabled={!destSel}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-500 disabled:opacity-40"
                  >
                    {autoSel ? '예약' : '시작'}
                  </button>
                  <button
                    onClick={() => setPickRoute(null)}
                    className="rounded-lg border border-gray-700 px-2 py-1.5 text-[11px] text-gray-500"
                  >
                    ✕
                  </button>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[10px] text-gray-400">
                  <input
                    type="checkbox"
                    checked={autoSel}
                    onChange={(e) => setAutoSel(e.target.checked)}
                    className="h-3 w-3 accent-sky-500"
                  />
                  <b className="text-gray-300">하차벨 자동 예약</b> — 깜빡 졸아도 도착 전에 기사님께 자동
                  전달돼요
                </label>
              </div>
            )}

            {riding && ridingBus && ridingRoute && (
              <div
                className={`rounded-xl border px-3 py-3 ${
                  arrivedNow
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : alarmNow
                      ? 'animate-pulse border-red-500/60 bg-red-500/15'
                      : 'border-gray-800 bg-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-200">
                    <span className="h-2 w-2 rounded-full" style={{ background: ridingRoute.color }} />
                    {ridingRoute.name} {ridingBus.id.slice(-4)}호 탑승 중 →{' '}
                    <b className="text-sky-300">{riding.stopName}</b>
                    {riding.auto && (
                      <span className="rounded bg-sky-500/20 px-1 py-0.5 text-[9px] font-bold text-sky-300">
                        자동예약
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => engine.cancelReservation()}
                    className="text-[10px] text-gray-600 hover:text-gray-400"
                  >
                    해제 ✕
                  </button>
                </div>

                {arrivedNow ? (
                  <div className="mt-2 text-center">
                    <div className="text-lg font-black text-emerald-400">🚏 {riding.stopName} 도착!</div>
                    <div className="text-[11px] text-emerald-300/80">안녕히 가세요 👋 소지품을 확인하세요</div>
                  </div>
                ) : alarmNow ? (
                  <div className="mt-2 text-center">
                    <div className="text-lg font-black text-red-300">⏰ 다음 정류장에서 내리세요!</div>
                    <div className="mb-2 text-[11px] tabular-nums text-red-200/80">
                      {riding.stopName}까지 약 {Math.max(0, Math.round(ridingBus.nextStopDistM))}m
                    </div>
                    {riding.auto ? (
                      <div
                        className={`w-full rounded-xl py-2.5 text-sm font-black ${
                          ridingBus.bellPressed
                            ? 'bg-emerald-600/30 text-emerald-300'
                            : 'bg-sky-600/30 text-sky-200'
                        }`}
                      >
                        {ridingBus.bellPressed
                          ? '✓ 하차벨 자동 전달 완료 — 편히 내리세요'
                          : '🔔 예약됨 — 곧 하차벨이 자동 전달돼요'}
                      </div>
                    ) : (
                      <button
                        onClick={() => engine.pressBell(ridingBus.id)}
                        disabled={ridingBus.bellPressed}
                        className={`w-full rounded-xl py-2.5 text-sm font-black ${
                          ridingBus.bellPressed
                            ? 'bg-emerald-600/30 text-emerald-300'
                            : 'bg-red-600 text-white hover:bg-red-500'
                        }`}
                      >
                        {ridingBus.bellPressed ? '✓ 하차벨 눌림 — 기사님께 전달됨' : '🔴 하차벨 누르기'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-gray-400">
                      {riding.auto ? (
                        <>
                          😴 편히 주무세요 — 하차벨까지 <b className="text-gray-200">자동으로 처리돼요</b>
                        </>
                      ) : (
                        <>
                          😴 편히 가세요 — 도착 전에 <b className="text-gray-200">진동·소리로 깨워드려요</b>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-500">
                      남은 거리 {(destRemainM / 1000).toFixed(1)}km
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 시민안내 */}
          <div
            className={`mx-3 mt-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
              notice.tone === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-sky-500/20 bg-sky-500/5 text-sky-200'
            }`}
          >
            📣 {notice.text}
          </div>

          {/* 내 민원 추적 */}
          {myComplaint && (
            <div className="mx-3 mt-2 rounded-xl bg-gray-900 px-3 py-2.5">
              <div className="text-[10px] font-semibold text-gray-500">내 의견 처리 현황</div>
              <div className="mt-1 flex gap-1">
                {(['접수', '원인식별', '조치중', '해결'] as const).map((s, i) => {
                  const order = ['접수', '원인식별', '조치중', '해결']
                  const done = order.indexOf(myComplaint.status) >= i
                  return (
                    <span
                      key={s}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                        done ? 'bg-violet-500/25 text-violet-300' : 'bg-gray-800 text-gray-600'
                      }`}
                    >
                      {s === '원인식별' ? '확인' : s}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          </div>

          {/* 하단 액션 — 고정 푸터 (본문과 겹치지 않음) */}
          <div className="shrink-0 space-y-2 px-3 pb-3 pt-1">
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2">
              <span className="text-[10px] text-emerald-300">🌱 오늘 대구 버스가 아낀 탄소</span>
              <span className="text-xs font-bold tabular-nums text-emerald-400">
                {snap.kpi.totalCo2SavedKg.toFixed(1)} kg
              </span>
            </div>
            <button
              onClick={() => {
                if (filed) return
                engine.fileComplaint()
                setFiled(true)
                setTimeout(() => setFiled(false), 3000)
              }}
              disabled={filed}
              className={`w-full rounded-xl py-2.5 text-xs font-bold text-white transition-colors ${
                filed ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-500'
              }`}
            >
              {filed ? '✓ 접수됐어요 — 위 처리 현황에서 추적할 수 있어요' : '📢 불편사항 접수하기'}
            </button>
          </div>
        </div>
      </div>

      {/* 설명 패널 */}
      <div className="max-w-md space-y-4 pt-6">
        <h2 className="text-lg font-bold text-gray-100">승객 앱 — 시민이 체감하는 데이터</h2>
        <ul className="space-y-3 text-sm leading-relaxed text-gray-400">
          <li>
            <b className="text-gray-200">도착예측 + 신뢰도 표시</b> — "3분 후"가 얼마나 믿을 만한지까지
            보여줌. 차량속도·운행상태 기반 (GTFS Realtime 표준 지향)
          </li>
          <li>
            <b className="text-gray-200">실시간 혼잡도 (여유/보통/혼잡)</b> — 재차율 기반. 휠체어·유모차
            공간 이용 가능 여부 표시 (교통약자 배려)
          </li>
          <li>
            <b className="text-gray-200">시민안내 에이전트</b> — 정비·배차조정 등 운영 데이터를 시민용
            문장으로 자동 변환. "왜 늦는지"를 알려주는 투명한 안내
          </li>
          <li>
            <b className="text-gray-200">하차 예약</b> — 목적지를 정해두면 도착 직전 진동·소리로 깨워주고,{' '}
            <b className="text-gray-200">하차벨은 자동으로 기사님께 전달</b>(예약 모드). 기사 태블릿에는
            하차 예약이 미리 표시되어 무정차 통과도 예방 (졸음·하차 놓침 방지 + 교통약자 배려)
          </li>
          <li>
            <b className="text-gray-200">민원 접수 → 처리 추적</b> — 여기서 접수한 민원이 시티
            대시보드의 증빙 자동매칭으로 이어짐 (승객 → 대구시 → 버스회사 → 운전자 순환 시연)
          </li>
        </ul>
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
          💡 데모 동선: 여기서 <b className="text-violet-400">불편사항 접수</b> → 시티 대시보드에서 증빙
          자동매칭 → 운수사에서 코칭 → 기사 앱에 경고 → 다시 이 화면에서 처리 현황 확인
        </div>
      </div>
    </div>
  )
}
