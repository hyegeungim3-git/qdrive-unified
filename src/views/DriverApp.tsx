import { useEffect, useRef, useState } from 'react'
import { engine, useSim } from '../sim/store'
import { DEMO_VEHICLE_ID } from '../sim/engine'
import { ROUTES } from '../sim/routes'
import { indexPolyline } from '../sim/geo'
import { RISK_EVENT_TYPES } from '../sim/types'
import { simClock } from '../components/ui'

const ROUTE_TOTAL_M = new Map(ROUTES.map((r) => [r.id, indexPolyline(r.points).totalM]))

const FRAME_W = 1020 // 12.3" 태블릿 프레임 고정폭
const FRAME_H = 596 // 프레임 총 높이 (베젤 포함 근사)

/** 컨테이너가 프레임보다 좁으면 잘리는 대신 비율 축소 */
function useFrameScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(Math.min(1, el.clientWidth / FRAME_W))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, scale }
}

/**
 * 운전석 인포테인먼트 — 12.3인치 차량 거치 태블릿 상시 표출용.
 * 원칙: 주행 중 조작 없음(글랜스 UI), 큰 글씨·고대비, 경고는 화면 전체로.
 */

function ScoreGauge({ score }: { score: number }) {
  const s = Math.round(score)
  const pct = s / 100
  const r = 74
  const circ = 2 * Math.PI * r
  const color = s >= 90 ? '#34d399' : s >= 80 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative flex items-center justify-center">
      <svg width="190" height="190" viewBox="0 0 190 190">
        <circle cx="95" cy="95" r={r} fill="none" stroke="#1f2937" strokeWidth="14" />
        <circle
          cx="95"
          cy="95"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ}`}
          transform="rotate(-90 95 95)"
          style={{ transition: 'stroke-dasharray 0.5s' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-6xl font-black tabular-nums" style={{ color }}>
          {s}
        </div>
        <div className="mt-1 text-xs text-gray-500">오늘의 운전점수</div>
      </div>
    </div>
  )
}

const WEATHER_ICON = { 맑음: '☀️', 폭우: '🌧️', 폭염: '🥵' } as const

/** 실시간 에코·안전 코칭 — 차량 상태에서 파생 */
/**
 * 예측형 에코 코칭 — 낭비가 일어난 뒤 벌점을 주는 게 아니라, 앞 상황을 보고 미리 안내한다.
 * 다음 정류장 거리·앞차 간격·현재 속도를 종합해 "지금 발을 떼라(관성주행)"를 예측 제시.
 */
function coaching(
  v: { dwellRemaining: number; rpm: number; speedKmh: number; nextStopDistM: number },
  recentWarn: boolean,
  bunching: boolean,
) {
  if (recentWarn)
    return { icon: '🛡️', msg: '방금 급조작이 감지됐어요 — 차간거리를 여유 있게 확보하세요', tone: 'warn' as const, eco: false }
  if (v.dwellRemaining > 0)
    return { icon: '🚏', msg: '승하차 중 — 출발 시 완만하게 가속하면 점수·연비 모두 좋아져요', tone: 'ok' as const, eco: false }
  // 🌿 예측형: 정류장 접근 구간에서 미리 발 떼기(관성주행) 권장
  if (v.nextStopDistM < 160 && v.nextStopDistM > 20 && v.speedKmh > 18)
    return {
      icon: '🌿',
      msg: `${Math.round(v.nextStopDistM)}m 앞 정류장 — 지금 가속 페달을 떼고 관성으로 진입하면 연료가 절약됩니다`,
      tone: 'eco' as const,
      eco: true,
    }
  // 🌿 예측형: 앞차 근접 시 가속 불필요
  if (bunching && v.speedKmh > 25)
    return { icon: '🌿', msg: '앞차가 가깝습니다 — 가속 대신 관성 유지가 연료·간격 모두 유리합니다', tone: 'eco' as const, eco: true }
  if (v.rpm > 2200)
    return { icon: '⚙️', msg: 'RPM이 높아요 — 정속 유지 시 연료 소모가 줄어듭니다', tone: 'warn' as const, eco: false }
  if (v.speedKmh > 52)
    return { icon: '🚦', msg: '속도가 높습니다 — 여유 운행으로 안전점수를 지키세요', tone: 'warn' as const, eco: false }
  return { icon: '👍', msg: '정속 주행 중 — 연비 최적 구간입니다. 좋아요!', tone: 'ok' as const, eco: false }
}

export default function DriverApp() {
  const snap = useSim()
  const v = snap.vehicles.find((x) => x.id === DEMO_VEHICLE_ID)!
  const route = ROUTES.find((r) => r.id === v.routeId)!
  // 정당 판정 배너는 6초, 미판정(소명 가능) 배너는 15초 유지 — 소명 조작 시간 확보
  const warnActive =
    !!v.lastEvent && !!v.lastEventWall && Date.now() - v.lastEventWall < (v.lastEvent.justified ? 6000 : 15000)

  /* 소명 (음성 우선, 미지원 시 버튼 폴백) */
  const [pleaState, setPleaState] = useState<'idle' | 'listening' | 'sent'>('idle')
  useEffect(() => setPleaState('idle'), [v.lastEventWall]) // 새 이벤트마다 초기화
  const startPlea = () => {
    const w = window as unknown as Record<string, any>
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    const submit = (note: string, method: '음성' | '버튼') => {
      engine.submitPlea(v.id, note, method)
      setPleaState('sent')
    }
    if (!SR) return submit('방어 운전 상황 설명 (음성 미지원 환경 — 버튼 접수)', '버튼')
    try {
      const rec = new SR()
      rec.lang = 'ko-KR'
      rec.interimResults = false
      setPleaState('listening')
      let done = false
      const finish = (note: string, method: '음성' | '버튼') => {
        if (done) return
        done = true
        submit(note, method)
      }
      rec.onresult = (e: any) => finish(e.results[0][0].transcript, '음성')
      rec.onerror = () => finish('방어 운전 상황 설명 (음성 인식 실패 — 버튼 접수)', '버튼')
      rec.onend = () => finish('방어 운전 상황 설명 (음성 무입력 — 버튼 접수)', '버튼')
      rec.start()
      setTimeout(() => {
        try {
          rec.stop()
        } catch {
          /* noop */
        }
      }, 5000)
    } catch {
      submit('방어 운전 상황 설명 (버튼 접수)', '버튼')
    }
  }
  const co2Saved = Math.max(0, (v.baselineFuelM3 - v.fuelM3) * 2.2)
  const w = snap.weather
  const restDue = snap.simTime > 5400
  const isFaulty = snap.fault?.predicted && snap.fault.vehicleId === v.id
  const rank = [...snap.vehicles].sort((a, b) => b.score - a.score).findIndex((x) => x.id === v.id) + 1

  // 노선 진행 현황 (기점→종점, 방향 반영)
  const totalM = ROUTE_TOTAL_M.get(v.routeId)!
  const rawPct = Math.max(0, Math.min(1, v.odoOnRoute / totalM))
  const pct = route.loop || v.dir === 1 ? rawPct : 1 - rawPct
  const fromStop = route.loop ? route.stops[0].name : (v.dir === 1 ? route.stops[0] : route.stops[route.stops.length - 1]).name
  const toStop = route.loop ? '' : (v.dir === 1 ? route.stops[route.stops.length - 1] : route.stops[0]).name

  // 앞차·뒤차 배차 간격 + 진행 바에 표시할 동일 방향 이웃 버스 위치
  const hw = v.headway
  const progPct = (o: (typeof snap.vehicles)[number]) =>
    route.loop || o.dir === 1 ? o.odoOnRoute / totalM : 1 - o.odoOnRoute / totalM
  const peerBuses = hw
    ? snap.vehicles
        .filter((o) => o.id === hw.frontId || o.id === hw.rearId)
        .map((o) => ({ id: o.id, pct: Math.max(0, Math.min(1, progPct(o))), rel: o.id === hw.frontId ? '앞차' : '뒤차' }))
    : []

  const coach = coaching(v, warnActive, hw?.status === 'bunching')
  // 오늘 연료 낭비 요인 (m³) — 큰 순
  const waste = v.fuelWaste
  const wasteTotal = waste.idle + waste.harsh + waste.habit + waste.ac
  const wasteTop = [
    ['운전습관', waste.habit],
    ['공회전', waste.idle],
    ['급조작', waste.harsh],
    ['냉방부하', waste.ac],
  ].sort((a, b) => (b[1] as number) - (a[1] as number))[0]

  const { ref: scaleRef, scale } = useFrameScale()

  return (
    <div className="flex h-full flex-col items-center justify-start gap-4 overflow-y-auto py-1">
      {/* 12.3" 태블릿 프레임 (가로형, 차량 거치) — 좁은 화면에서는 비율 축소 */}
      <div ref={scaleRef} className="w-full" style={{ height: Math.round(FRAME_H * scale) }}>
      <div
        className="relative mx-auto w-[1020px] shrink-0 rounded-[22px] border-[10px] border-gray-800 bg-black shadow-2xl"
        style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top center', marginLeft: 'calc((100% - 1020px) / 2)' } : undefined}
      >
        <div className="absolute left-1/2 top-[3px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gray-700" />
        <div className="relative h-[560px] overflow-hidden rounded-[12px] bg-gray-950">
          {/* 상단 상태바 */}
          <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-5 py-2.5">
            <div className="flex items-center gap-4">
              <span className="text-lg font-black text-gray-50">
                Q<span className="text-sky-400">drive</span>
              </span>
              <span className="flex items-center gap-2 text-sm text-gray-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: route.color }} />
                <b>{route.name}</b>
                <span className="text-sky-300">
                  {route.loop ? '순환' : `${(v.dir === 1 ? route.stops[route.stops.length - 1] : route.stops[0]).name} 방면`}
                </span>
                · {v.id.slice(-4)}호 · {v.driverName} 기사님
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {v.bellPressed && (
                <span className="animate-pulse whitespace-nowrap rounded-md border border-red-500/50 bg-red-500/20 px-2.5 py-0.5 text-xs font-black text-red-300">
                  🔔 하차벨
                </span>
              )}
              <span className="text-gray-400">
                {WEATHER_ICON[w.condition]} {w.condition} {w.tempC}°C
                {w.condition === '폭우' && <b className="ml-1 text-sky-300">노면 주의</b>}
              </span>
              <span className={`text-xs font-bold ${v.etasSubmitted ? 'text-emerald-400' : 'text-gray-600'}`}>
                eTAS {v.etasSubmitted ? '제출완료 ✓' : '자동제출 대기'}
              </span>
              <span className="font-mono text-lg font-bold text-emerald-400">{simClock(snap.simTime)}</span>
            </div>
          </div>

          {/* 본문 3열 */}
          <div className="grid h-[calc(100%-52px)] grid-cols-[250px_1fr_270px] gap-3 p-3">
            {/* 좌: 점수 + 오늘 누계 */}
            <div className="flex flex-col items-center justify-between rounded-2xl bg-gray-900/60 py-3">
              <div className="flex flex-col items-center">
                <ScoreGauge score={v.score} />
                <div className="px-3 text-center text-[10px] leading-relaxed text-gray-600">
                  ⚖ 노선 난이도·시간대·날씨 보정 적용
                </div>
              </div>
              <div className="grid w-full grid-cols-4 gap-1 px-3">
                {RISK_EVENT_TYPES.map((t) => (
                  <div key={t} className="rounded-md bg-gray-800/60 py-1 text-center">
                    <div className="text-[8px] text-gray-500">{t}</div>
                    <div className={`text-sm font-bold tabular-nums ${v.eventCounts[t] > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                      {v.eventCounts[t]}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid w-full grid-cols-2 gap-1 px-3">
                <div className="rounded-md bg-gray-800/60 py-1.5 text-center">
                  <div className="text-[9px] text-gray-500">오늘 주행</div>
                  <div className="text-base font-bold tabular-nums text-gray-200">{v.distanceKm.toFixed(1)}<span className="ml-0.5 text-[9px] font-medium text-gray-500">km</span></div>
                </div>
                <div className="rounded-md bg-gray-800/60 py-1.5 text-center">
                  <div className="text-[9px] text-gray-500">CNG 사용</div>
                  <div className="text-base font-bold tabular-nums text-gray-200">{v.fuelM3.toFixed(1)}<span className="ml-0.5 text-[9px] font-medium text-gray-500">m³</span></div>
                </div>
              </div>
            </div>

            {/* 중앙: 속도 + 다음 정류장 */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-1 flex-col rounded-2xl bg-gray-900/60">
                <div className="flex flex-1 items-center justify-center gap-10">
                  <div className="text-center">
                    <div className="text-[88px] font-black leading-none tracking-tighter tabular-nums text-gray-50">
                      {Math.round(v.speedKmh)}
                    </div>
                    <div className="mt-1 whitespace-nowrap text-sm text-gray-500">km/h · 차량속도 (내부)</div>
                  </div>
                  <div className="space-y-3 text-center">
                    <div>
                      <div className="text-3xl font-bold tabular-nums text-gray-300">{v.rpm}</div>
                      <div className="text-[10px] text-gray-600">RPM</div>
                    </div>
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-800">
                      <div
                        className={`h-full transition-all ${v.rpm > 2200 ? 'bg-red-500' : v.rpm > 1700 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (v.rpm / 2800) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-600">
                      {v.rpm > 2200 ? '고RPM — 연비 저하' : '경제운전 구간'}
                    </div>
                  </div>
                </div>
                {/* 재차율 스트립 */}
                <div className="flex items-center gap-3 border-t border-gray-800/60 px-6 py-2.5">
                  <span className="whitespace-nowrap text-[11px] text-gray-500">🧍 재차율</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className={`h-full transition-all duration-500 ${v.occupancy >= 0.7 ? 'bg-red-500' : v.occupancy >= 0.4 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.round(v.occupancy * 100)}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-gray-300">
                    {Math.round(v.occupancy * 100)}% ·{' '}
                    {v.occupancy >= 0.7 ? '혼잡' : v.occupancy >= 0.4 ? '보통' : '여유'}
                  </span>
                </div>
              </div>

              {/* 노선 진행 현황 */}
              <div className="rounded-2xl bg-gray-900/60 px-6 py-3">
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>🚏 {fromStop}</span>
                  <span className="font-semibold text-sky-400">
                    {route.loop ? '순환 운행 중' : `${toStop} 방면 ${Math.round(pct * 100)}%`}
                  </span>
                  <span>{route.loop ? '↻' : `🏁 ${toStop}`}</span>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-gray-800">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-sky-600/50 transition-all duration-500"
                    style={{ width: `${pct * 100}%` }}
                  />
                  {route.stops.map((s) => (
                    <span
                      key={s.name}
                      className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-600"
                      style={{ left: `${(route.loop || v.dir === 1 ? s.at : 1 - s.at) * 100}%` }}
                    />
                  ))}
                  {/* 뒤차·앞차 위치 (같은 방향, 반투명 회색 버스) */}
                  {hw &&
                    peerBuses.map((p) => (
                      <span
                        key={p.id}
                        title={`${p.rel} ${p.id.slice(-4)}호`}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm leading-none opacity-45 transition-all duration-500"
                        style={{ left: `${p.pct * 100}%`, transform: `translate(-50%,-50%)${v.dir === -1 && !route.loop ? '' : ' scaleX(-1)'}` }}
                      >
                        🚌
                      </span>
                    ))}
                  <span
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-base leading-none transition-all duration-500"
                    style={{ left: `${pct * 100}%`, transform: `translate(-50%,-50%)${v.dir === -1 && !route.loop ? '' : ' scaleX(-1)'}` }}
                  >
                    🚌
                  </span>
                </div>
              </div>

              {/* 앞차·뒤차 배차 간격 */}
              {hw && hw.peers >= 2 && (
                <div
                  className={`rounded-2xl border px-5 py-3 ${
                    hw.status === 'bunching'
                      ? 'border-amber-500/40 bg-amber-500/10'
                      : hw.status === 'gap'
                        ? 'border-sky-500/30 bg-sky-500/10'
                        : 'border-gray-800 bg-gray-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">🔗 앞·뒤차 배차 간격</span>
                    <span
                      className={`font-bold ${
                        hw.status === 'bunching'
                          ? 'text-amber-300'
                          : hw.status === 'gap'
                            ? 'text-sky-300'
                            : 'text-emerald-400'
                      }`}
                    >
                      {hw.status === 'bunching'
                        ? '⚠ 앞차 근접 — 몰림 주의'
                        : hw.status === 'gap'
                          ? '뒤차와 벌어짐'
                          : '정상 간격 유지'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-stretch gap-2 text-center">
                    <div className="flex-1 rounded-lg bg-gray-800/50 py-1.5">
                      <div className="text-[9px] text-gray-500">뒤차 {hw.rearId ? `${hw.rearId.slice(-4)}호` : '없음'}</div>
                      <div className="text-lg font-extrabold tabular-nums text-gray-200">
                        {hw.rearId ? `${hw.rearGapMin.toFixed(1)}` : '—'}
                        {hw.rearId && <span className="text-[10px] font-medium text-gray-500">분</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center px-1">
                      <span className="text-[9px] text-gray-500">이상</span>
                      <span className="text-xs font-bold tabular-nums text-gray-400">{hw.idealMin.toFixed(1)}분</span>
                    </div>
                    <div
                      className={`flex-1 rounded-lg py-1.5 ${hw.status === 'bunching' ? 'bg-amber-500/15' : 'bg-gray-800/50'}`}
                    >
                      <div className="text-[9px] text-gray-500">앞차 {hw.frontId ? `${hw.frontId.slice(-4)}호` : '없음'}</div>
                      <div
                        className={`text-lg font-extrabold tabular-nums ${hw.status === 'bunching' ? 'text-amber-300' : 'text-gray-200'}`}
                      >
                        {hw.frontId ? `${hw.frontGapMin.toFixed(1)}` : '—'}
                        {hw.frontId && <span className="text-[10px] font-medium text-gray-500">분</span>}
                      </div>
                    </div>
                  </div>
                  {hw.status === 'bunching' && (
                    <div className="mt-1.5 text-[10px] leading-relaxed text-amber-200/80">
                      앞차와 간격이 좁습니다 — 정류장에서 잠시 여유를 두면 배차가 고르게 유지됩니다 (관제 배차
                      권고와 연동)
                    </div>
                  )}
                </div>
              )}

              {/* 다음 정류장 */}
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-gray-900/60 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    다음 정류장
                    {snap.reservation?.vehicleId === v.id && (
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                        🔔 {snap.reservation.stopName} 하차 예약 1명
                      </span>
                    )}
                  </div>
                  <div className="truncate text-2xl font-extrabold text-gray-100">
                    🚏 {v.nextStopName || '—'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="whitespace-nowrap text-3xl font-extrabold tabular-nums text-sky-300">
                    {v.dwellRemaining > 0 ? '정차 중' : `${Math.max(0, Math.round(v.nextStopDistM))}m`}
                  </div>
                  <div className="whitespace-nowrap text-[10px] text-gray-600">
                    {v.dwellRemaining > 0 ? '승하차 진행' : '감속 준비 130m 전'}
                  </div>
                </div>
              </div>
            </div>

            {/* 우: 코칭·랭킹·알림 스택 */}
            <div className="flex flex-col gap-2.5 overflow-y-auto">
              {isFaulty && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <div className="text-xs font-bold text-amber-300">🔧 차량 점검 예정</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
                    냉각계통 예방정비 — 금일 2회차 종료 후 차고지 입고. 무리한 운행 없이 정상 주행하세요.
                  </div>
                </div>
              )}
              {w.condition !== '맑음' && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
                  <div className="text-xs font-bold text-sky-300">
                    {WEATHER_ICON[w.condition]} {w.condition} 운행 지침
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-sky-200/70">
                    {w.condition === '폭우'
                      ? '제동거리 1.5배 — 차간거리 확보, 정류장 접근 시 조기 감속하세요.'
                      : '냉방부하 증가 — 공회전 최소화, 승객 안내방송이 자동 송출됩니다.'}
                  </div>
                </div>
              )}

              {/* 실시간 코칭 (예측형 에코 코칭 포함) */}
              <div
                className={`flex flex-1 flex-col justify-center rounded-xl border px-4 py-3 ${
                  coach.tone === 'warn'
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : coach.tone === 'eco'
                      ? 'border-emerald-500/50 bg-emerald-500/15'
                      : 'border-emerald-500/25 bg-emerald-500/5'
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    coach.tone === 'warn' ? 'text-amber-300' : 'text-emerald-400'
                  }`}
                >
                  {coach.icon} {coach.eco ? '실시간 에코 코칭 (예측)' : '실시간 코칭'}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-gray-300">{coach.msg}</div>
              </div>

              {/* 경제운전(관성주행) 점수 + 오늘 연료 낭비 1위 */}
              <div className="rounded-xl bg-gray-900/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">🌿 경제운전 점수</span>
                  <span
                    className={`text-lg font-extrabold tabular-nums ${
                      v.ecoScore >= 85 ? 'text-emerald-400' : v.ecoScore >= 70 ? 'text-amber-400' : 'text-red-400'
                    }`}
                  >
                    {Math.round(v.ecoScore)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      v.ecoScore >= 85 ? 'bg-emerald-500' : v.ecoScore >= 70 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${v.ecoScore}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
                  관성주행(정류장 전 발 떼기) 비율 기준 ·{' '}
                  {wasteTotal > 0.05 ? (
                    <>
                      오늘 연료 낭비 1위 <b className="text-amber-400">{wasteTop[0]}</b>
                    </>
                  ) : (
                    <b className="text-emerald-400">낭비 요인 거의 없음 — 우수</b>
                  )}
                </div>
              </div>

              {/* 사내 랭킹 (게이미피케이션) */}
              <div className="rounded-xl bg-gray-900/60 px-4 py-3">
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>🏆 오늘 사내 안전운전 순위</span>
                  {v.defenseCredits > 0 && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-400">
                      🛡 방어 +{v.defenseCredits}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <span className="text-2xl font-extrabold tabular-nums text-gray-100">
                    {rank}
                    <span className="text-sm font-medium text-gray-500">위 / {snap.vehicles.length}명</span>
                  </span>
                  <span className="shrink-0 pb-0.5 text-[10px] text-gray-500">
                    {rank <= 3 ? '리워드 구간 🎖️' : `3위까지 ${rank - 3}계단`}
                  </span>
                </div>
              </div>

              {/* 휴게·교대 (상시 표시, 시간 경과 시 강조) */}
              <div
                className={`rounded-xl px-4 py-3 ${
                  restDue ? 'border border-amber-500/30 bg-amber-500/10' : 'bg-gray-900/60'
                }`}
              >
                <div className={`text-[11px] font-bold ${restDue ? 'text-amber-300' : 'text-gray-500'}`}>
                  ☕ 휴게·교대
                </div>
                <div className={`mt-1 text-xs leading-relaxed ${restDue ? 'text-amber-200/80' : 'text-gray-400'}`}>
                  {restDue
                    ? `연속운행 ${Math.floor(snap.simTime / 3600)}시간 ${Math.floor((snap.simTime % 3600) / 60)}분 — 휴게 권장`
                    : '다음 휴게 회차 종료 후 15분'}
                  <br />
                  교대 14:00 · 성서차고지
                </div>
              </div>

              {/* 절감 기여 */}
              <div className="rounded-xl bg-gray-900/60 px-4 py-3">
                <div className="text-[11px] text-gray-500">🌱 오늘 절감 기여</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <span className="text-2xl font-extrabold tabular-nums text-emerald-400">{co2Saved.toFixed(2)}</span>
                  <span className="shrink-0 pb-0.5 text-[10px] text-gray-500">kg CO₂ 리워드</span>
                </div>
              </div>
            </div>
          </div>

          {/* 위험운전 경고 — 상단 드롭 토스트 (테마 무관 고정 색상) */}
          {warnActive && v.lastEvent && v.lastEvent.justified && (
            /* 정당 판정: 감점 없음 인정 배너 */
            <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center">
              <div
                className="warn-drop flex items-center gap-4 rounded-2xl px-7 py-3.5 shadow-2xl"
                style={{ background: 'rgba(6, 78, 59, 0.96)', border: '1px solid rgba(52, 211, 153, 0.5)' }}
              >
                <span className="text-3xl">🛡️</span>
                <div>
                  <div className="text-2xl font-black leading-tight" style={{ color: '#a7f3d0' }}>
                    회피 기동 인정 — 감점 없음
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(167, 243, 208, 0.8)' }}>
                    {v.lastEvent.eventType} · {v.lastEvent.justifyReason} · 방어운전 +1
                  </div>
                </div>
              </div>
            </div>
          )}
          {warnActive && v.lastEvent && !v.lastEvent.justified && (
            <div className="absolute inset-x-0 top-14 z-20 flex justify-center">
              <div
                className="warn-drop flex items-center gap-4 rounded-2xl px-6 py-3 shadow-2xl"
                style={{ background: 'rgba(127, 29, 29, 0.96)', border: '1px solid rgba(248, 113, 113, 0.5)' }}
              >
                <span className="text-3xl">⚠️</span>
                <div>
                  <div className="text-2xl font-black leading-tight" style={{ color: '#fecaca' }}>
                    {v.lastEvent.eventType} 감지
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(254, 202, 202, 0.75)' }}>
                    {v.lastEvent.speedKmh} km/h · 안전운전 부탁드립니다
                  </div>
                </div>
                {/* 소명 — 방어 운전이었다면 음성으로 즉시 기록 */}
                {pleaState === 'idle' && (
                  <button
                    onClick={startPlea}
                    className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-black"
                    style={{ background: 'rgba(254, 202, 202, 0.95)', color: '#7f1d1d' }}
                  >
                    🎙 상황 설명하기
                  </button>
                )}
                {pleaState === 'listening' && (
                  <span className="shrink-0 animate-pulse rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'rgba(254,202,202,0.25)', color: '#fecaca' }}>
                    🎙 듣고 있어요 — 상황을 말씀하세요
                  </span>
                )}
                {pleaState === 'sent' && (
                  <span className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'rgba(52,211,153,0.2)', color: '#a7f3d0' }}>
                    ✓ 설명 전달됨 — 관제 확인 후 반영
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* 설명 */}
      <div className="flex max-w-4xl gap-8 text-[11px] leading-relaxed text-gray-500">
        <span>
          <b className="text-gray-300">12.3" 차량 거치 인포테인먼트</b> — 주행 중 조작 없는 상시 표출
          글랜스 UI. 위험운전 경고는 화면 전체로 (운전석에서 즉시 인지)
        </span>
        <span>
          점수·다음 정류장·날씨 지침·차량 점검 예정까지 <b className="text-gray-300">기사에게 필요한 모든
          정보가 한 화면</b>. ⚡ 급감속 / 🌧 날씨 / 🔧 고장 버튼으로 시연하세요
        </span>
      </div>

      {/* 내 운행 리포트 — 배지·퍼스널 인사이트 (운행 후 자발적 개선 유도) */}
      <DriverReport rank={rank} score={v.score} co2Saved={co2Saved} driverName={v.driverName} />
    </div>
  )
}

/** 운행 후 리포트 — 게이미피케이션(배지 6종) + AI 퍼스널 인사이트. 월간 MVP 배지는 엔진 실시간 순위 연동. */
function DriverReport({ rank, score, co2Saved, driverName }: { rank: number; score: number; co2Saved: number; driverName: string }) {
  const badges = [
    { icon: '🌿', name: '에코 마스터', cond: '월 연비 상위 10%', got: true },
    { icon: '🛡️', name: '무사고 500일', cond: '537일 달성 중', got: true },
    { icon: '⏱️', name: '정시의 달인', cond: '월 정시율 98% 이상', got: true },
    { icon: '🌊', name: '부드러운 발', cond: '예측 감속 1,000회', got: true },
    { icon: '💤', name: '공회전 제로', cond: '주 5일 무공회전 · 4/5일째', got: false },
    // 월간 MVP — 사내 실시간 순위에 연동 (rank===1이면 획득)
    {
      icon: '🏆',
      name: '월간 MVP',
      cond: rank === 1 ? '월 종합 1위 달성 🎉' : `월 종합 1위 · 현재 ${rank}위 도전 중`,
      got: rank === 1,
    },
  ]
  const gotCount = badges.filter((b) => b.got).length

  const insights = [
    { icon: '⚠', title: '취약 시간대', head: '오후 2~4시', body: '급가속이 다른 시간대의 1.8배예요 — 점심 후 첫 회차를 여유 있게 시작해 보세요.', cls: 'border-amber-500/20 bg-amber-500/5', accent: 'text-amber-400' },
    { icon: '★', title: '나의 최고 조건', head: '비 오는 화요일 96.8점', body: '궂은 날 예측 감속이 몸에 배어 있어요 — 이 습관을 맑은 날에도.', cls: 'border-emerald-500/20 bg-emerald-500/5', accent: 'text-emerald-400' },
    { icon: '↗', title: '3개월 성장', head: '+4.2점 · 연비 +0.3', body: '전사 486명 중 성장 폭 상위 8% — 이 속도면 다음 달 사내 신기록이에요.', cls: 'border-sky-500/20 bg-sky-500/5', accent: 'text-sky-400' },
  ]

  return (
    <div className="w-full max-w-5xl px-2 pb-4">
      {/* 라이브 요약 스트립 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-3">
        <div className="text-sm font-bold text-gray-100">📋 {driverName} 기사님 오늘의 리포트</div>
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          <span className="text-gray-400">오늘 점수 <b className="tabular-nums text-gray-100">{Math.round(score)}</b></span>
          <span className="text-gray-400">사내 순위 <b className="tabular-nums text-sky-300">{rank}위</b></span>
          <span className="text-gray-400">오늘 절감 <b className="tabular-nums text-emerald-400">{co2Saved.toFixed(2)}kg</b></span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />LIVE
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[860px]:grid-cols-1">
        {/* 배지 */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-100">🎖️ 내 배지</span>
            <span className="text-[12px] font-semibold text-gray-500">{gotCount}/6 획득</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {badges.map((b) => (
              <div
                key={b.name}
                className={`rounded-xl border px-3 py-3 text-center transition ${
                  b.got ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-gray-800 bg-gray-900/40 opacity-55 grayscale'
                }`}
              >
                <div className="text-2xl">{b.icon}</div>
                <div className="mt-1 text-[12px] font-bold text-gray-100">{b.name}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-gray-500">{b.cond}</div>
                {b.got && <div className="mt-1 text-[10px] font-bold text-emerald-400">획득 ✓</div>}
              </div>
            ))}
          </div>
        </div>

        {/* 퍼스널 인사이트 */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-bold text-gray-100">AI가 발견한 나의 패턴</span>
            <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-bold text-violet-300">3개월 데이터 분석</span>
          </div>
          <div className="mb-3 text-[12px] font-semibold text-gray-500">운행 264회를 학습해 찾아냈어요 — 데이터가 쌓일수록 코칭이 정확해져요.</div>
          <div className="flex flex-col gap-2.5">
            {insights.map((i) => (
              <div key={i.title} className={`rounded-xl border px-4 py-3 ${i.cls}`}>
                <div className={`text-[12px] font-bold ${i.accent}`}>{i.icon} {i.title}</div>
                <div className="mt-1 text-sm font-bold text-gray-100">{i.head}</div>
                <div className="mt-1 text-[11.5px] font-semibold leading-relaxed text-gray-400">{i.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
