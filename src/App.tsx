import { useEffect, useState } from 'react'
import DemoControls from './components/DemoControls'
import { toggleTheme, useTheme } from './theme'
import { useSim } from './sim/store'
import CityDashboard from './views/CityDashboard'
import OperatorView from './views/OperatorView'
import DriverApp from './views/DriverApp'
import PassengerApp from './views/PassengerApp'
import ReportView from './views/ReportView'
import TeaserView from './views/TeaserView'
import CitizenPublic from './views/CitizenPublic'

/** 해시 라우트 구독 — 시민 공개 페이지(#citizen)는 앱 셸 밖 독립 진입점 */
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

const TABS = [
  { id: 'city', label: '시티 대시보드', sub: '대구시 (지자체)' },
  { id: 'operator', label: '운수사 관제', sub: '버스회사' },
  { id: 'driver', label: '기사 앱', sub: '운전자' },
  { id: 'passenger', label: '승객 앱', sub: '시민·승객' },
  { id: 'report', label: '실증 리포트', sub: 'As-Is → To-Be' },
  { id: 'roadmap', label: '로드맵', sub: '플랫폼 확장' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('city')
  const snap = useSim()
  const theme = useTheme()
  const hash = useHashRoute()

  // 시민 공개 페이지 — 독립 진입점(공유·배포용), 앱 셸 없이 전체화면 렌더
  if (hash === '#citizen') return <CitizenPublic />

  return (
    <div className="flex h-svh flex-col">
      {/* 헤더 */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 bg-gray-950 px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="whitespace-nowrap">
            <div className="text-lg font-black tracking-tight text-gray-50">
              Q<span className="text-sky-400">drive</span>
              <span className="ml-2 hidden text-[10px] font-semibold tracking-widest text-gray-500 xl:inline">
                EMSP · 차량용 탄소중립 서비스 플랫폼
              </span>
            </div>
            <div className="text-[10px] text-gray-600">
              대구 시내버스 실증 데모 — 공단 SDK 패킷(409/521) 시뮬레이션
            </div>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-left transition-colors ${
                  tab === t.id
                    ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/40'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`}
              >
                <div className="text-xs font-bold">{t.label}</div>
                <div className="text-[9px] opacity-60">{t.sub}</div>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DemoControls snap={snap} onNavigate={(t) => setTab(t as TabId)} />
          <button
            onClick={() => {
              window.location.hash = 'citizen'
            }}
            className="whitespace-nowrap rounded-md border border-emerald-800 bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
            title="시민 탄소 공개 페이지 (별도 진입점)"
          >
            🌱 시민 공개
          </button>
          <button
            onClick={toggleTheme}
            className="whitespace-nowrap rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:text-gray-100"
            title="라이트/다크 모드 전환"
          >
            {theme === 'dark' ? '☀️ 밝게' : '🌙 다크'}
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="min-h-0 flex-1 p-4">
        {tab === 'city' && <CityDashboard />}
        {tab === 'operator' && <OperatorView />}
        {tab === 'driver' && <DriverApp />}
        {tab === 'passenger' && <PassengerApp />}
        {tab === 'report' && <ReportView />}
        {tab === 'roadmap' && <TeaserView />}
      </main>
    </div>
  )
}
