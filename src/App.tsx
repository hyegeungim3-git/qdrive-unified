import { useEffect, useState } from 'react'
import DemoControls from './components/DemoControls'
import Copilot from './components/Copilot'
import { toggleTheme, useTheme } from './theme'
import { useSim } from './sim/store'
import CityDashboard from './views/CityDashboard'
import OperatorView from './views/OperatorView'
import DriverApp from './views/DriverApp'
import PassengerApp from './views/PassengerApp'
import CarbonAnalysis from './views/CarbonAnalysis'
import PerformanceProof from './views/PerformanceProof'
import ReportView from './views/ReportView'
import TeaserView from './views/TeaserView'
import CitizenPublic from './views/CitizenPublic'

const TABS = [
  { id: 'city', label: '시티 대시보드', sub: '대구시 (지자체)' },
  { id: 'operator', label: '운수사 관제', sub: '버스회사' },
  { id: 'driver', label: '기사 앱', sub: '운전자' },
  { id: 'passenger', label: '승객 앱', sub: '시민·승객' },
  { id: 'carbon', label: '🌱 탄소중립 분석', sub: '탄소·연료·안전·전환' },
  { id: 'proof', label: '🔬 성과 검증', sub: '신뢰도·성과 증명' },
  { id: 'report', label: '실증 리포트', sub: '도입 전 → 후 비교' },
  { id: 'roadmap', label: '로드맵', sub: '플랫폼 확장' },
] as const

type TabId = (typeof TABS)[number]['id']

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
                대구 시내버스 통합 운영 플랫폼
              </span>
            </div>
            <div
              className="text-[10px] text-gray-500"
              title="공단 표준 DTG 패킷(409 위험운전 / 521 운행기록) 스키마 기반 실증 데모"
            >
              안전운전 · 연료절감 · 탄소중립을 한 화면에서
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
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
            className="whitespace-nowrap rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
            title="시민에게 공개되는 탄소 절감 리포트 (SNS·메신저로 공유 가능한 별도 링크)"
          >
            📊 시민 탄소 리포트
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
        {tab === 'city' && <CityDashboard onNavigate={(t) => setTab(t as TabId)} />}
        {tab === 'operator' && <OperatorView />}
        {tab === 'driver' && <DriverApp />}
        {tab === 'passenger' && <PassengerApp />}
        {tab === 'carbon' && <CarbonAnalysis onNavigate={(t) => setTab(t as TabId)} />}
        {tab === 'proof' && <PerformanceProof />}
        {tab === 'report' && <ReportView />}
        {tab === 'roadmap' && <TeaserView />}
      </main>

      {/* AI Q — 공통 AI 도우미, 어느 탭에서든 호출 */}
      <Copilot onNavigate={(t) => setTab(t as TabId)} />
    </div>
  )
}
