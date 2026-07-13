import { useEffect, useRef, useState } from 'react'
import { engine } from '../sim/store'
import type { SimSnapshot } from '../sim/types'
import { simClock } from './ui'

const SPEEDS = [1, 5, 20, 60]

interface Toast {
  msg: string
  targetTab?: string
  targetLabel?: string
}

export default function DemoControls({
  snap,
  onNavigate,
}: {
  snap: SimSnapshot
  onNavigate?: (tab: string) => void
}) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = (t: Toast) => {
    setToast(t)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 4500)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const go = () => {
    if (toast?.targetTab && onNavigate) onNavigate(toast.targetTab)
    setToast(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 font-mono text-sm text-emerald-400">
        {simClock(snap.simTime)}
      </span>

      <div className="flex overflow-hidden rounded-md border border-gray-800">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => engine.setSpeed(s)}
            className={`px-2 py-1 text-xs font-semibold transition-colors ${
              snap.speedMultiplier === s
                ? 'bg-sky-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-gray-200'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <button
        onClick={() => engine.togglePause()}
        className="whitespace-nowrap rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:text-gray-100"
      >
        {snap.running ? '⏸ 일시정지' : '▶ 재생'}
      </button>

      {/* 데모 트리거 — 발표 중 시나리오 구동용 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-gray-700/70 py-1 pl-2 pr-1.5">
        <span className="shrink-0 whitespace-nowrap text-[9px] font-bold tracking-widest text-gray-600">시연</span>
        <button
          onClick={() => {
            engine.triggerRiskEvent('급감속')
            show({ msg: '⚡ 3742호 급감속 발생 — 기사 태블릿에 경고 표출 중', targetTab: 'driver', targetLabel: '기사 앱' })
          }}
          className="whitespace-nowrap rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
          title="주인공 차량(3742)에 급감속 이벤트 발생"
        >
          ⚡ 급감속
        </button>
        <button
          onClick={() => {
            engine.triggerFault()
            show({
              msg: '🔧 3742호 냉각수온 상승 시작 — 약 3분(시뮬레이션) 후 예측 알림',
              targetTab: 'operator',
              targetLabel: '운수사 관제',
            })
          }}
          className="whitespace-nowrap rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20"
          title="냉각수온 상승 → 고장예측 시나리오 시작 (재클릭 시 처음부터 재시연)"
        >
          🔧 고장
        </button>
        <button
          onClick={() => {
            engine.fileComplaint()
            show({ msg: '📢 시민 민원 접수됨 — 증빙 자동매칭 대기', targetTab: 'city', targetLabel: '시티 대시보드' })
          }}
          className="whitespace-nowrap rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-400 hover:bg-violet-500/20"
          title="시민 민원 접수 → 증빙 자동매칭 스토리"
        >
          📢 민원
        </button>
        <button
          onClick={() => {
            const r = engine.forceRecommendation()
            show(
              r === 'created'
                ? { msg: '🚌 배차간격 권고 생성 — 승인 대기 중', targetTab: 'operator', targetLabel: '운수사 관제' }
                : { msg: '🚌 이미 대기 중인 권고가 있어요 — 먼저 승인해 주세요', targetTab: 'operator', targetLabel: '운수사 관제' },
            )
          }}
          className="whitespace-nowrap rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 hover:bg-sky-500/20"
          title="순환2 배차간격 분석 → AI 권고 생성 (운수사 탭에서 승인)"
        >
          🚌 배차
        </button>
        <button
          onClick={() => {
            engine.triggerAccident()
            show({ msg: '🚨 접촉사고 발생 — 돌발정보·지도에 표시, 90초 후 처리중 전환', targetTab: 'city', targetLabel: '시티 대시보드' })
          }}
          className="whitespace-nowrap rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-400 hover:bg-orange-500/20"
          title="주인공 차량 위치에 접촉사고 발생 (발생→처리중→완료 자동 전이)"
        >
          🚨 사고
        </button>
        <button
          onClick={() => {
            engine.cycleWeather()
            show({ msg: '🌦 날씨 전환 — 시티·기사·승객·차고지 4개 화면에 동시 반영', targetTab: 'city', targetLabel: '시티 대시보드' })
          }}
          className="whitespace-nowrap rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
          title="날씨 전환 (맑음 → 폭우 → 폭염) — 수요·지연 예측, 운행 지침, 예비차 권고 연동"
        >
          {snap.weather.condition === '맑음' ? '☀️' : snap.weather.condition === '폭우' ? '🌧️' : '🥵'}{' '}
          {snap.weather.condition}
        </button>
      </div>

      {/* 트리거 피드백 토스트 */}
      {toast && (
        <div className="toast-in fixed right-4 top-14 z-[2000] flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 shadow-2xl">
          <span className="text-xs font-semibold text-gray-100">{toast.msg}</span>
          {toast.targetTab && onNavigate && (
            <button
              onClick={go}
              className="whitespace-nowrap rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-500"
            >
              {toast.targetLabel}으로 이동 →
            </button>
          )}
          <button onClick={() => setToast(null)} className="text-gray-500 hover:text-gray-300">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
