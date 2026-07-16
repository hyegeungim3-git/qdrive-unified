import { useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Panel, PersonaChip, ScoreBadge, simClock } from '../components/ui'
import { engine, useSim } from '../sim/store'
import { ROUTES } from '../sim/routes'
import { RISK_EVENT_TYPES } from '../sim/types'
import { resolveRequest, useAgentRequests } from '../sim/agentRequests'
import { ActionCenterList, actionOwnerReadyCount } from '../components/ActionCenter'
import { consumeOperatorSubtabIntent } from '../sim/navIntent'
import Scanner from './operator/Scanner'
import MaintChat from './operator/MaintChat'
import Depot from './operator/Depot'
import TripsLog from './operator/TripsLog'
import AiReport from './operator/AiReport'
import EcoFuel from './operator/EcoFuel'
import BizSummary from './operator/BizSummary'
import VehicleRegistry from './operator/VehicleRegistry'
import DriverRegistry from './operator/DriverRegistry'
import RouteRegistry from './operator/RouteRegistry'

const SUB_TABS = [
  { id: 'ops', label: '관제 현황' },
  { id: 'biz', label: '💰 경영·투자' },
  { id: 'trips', label: '운행 이력' },
  { id: 'report', label: 'AI 운영 리포트' },
  { id: 'eco', label: '연료 절감 AI' },
  { id: 'scanner', label: '진단 스캐너' },
  { id: 'chat', label: 'AI+ 정비도우미' },
  { id: 'depot', label: '차고지·충전' },
  { id: 'vehicles', label: '🚌 차량 관리' },
  { id: 'drivers', label: '👥 기사 관리' },
  { id: 'routes', label: '🛣️ 노선 관리' },
] as const

type SubTab = (typeof SUB_TABS)[number]['id']

const REQ_ICON = { 휴가: '🏖️', 상황설명: '🎙', 교육문의: '🎓', 근무변경: '🔁' } as const

export default function OperatorView() {
  const [sub, setSub] = useState<SubTab>(() => (consumeOperatorSubtabIntent() as SubTab | null) ?? 'ops')
  const snap = useSim()
  const fault = snap.fault

  const sorted = [...snap.vehicles].sort((a, b) => b.score - a.score)
  const pendingActions =
    snap.recommendations.filter((r) => r.status !== '실행완료').length +
    snap.workOrders.filter((w) => w.status === '초안').length
  const requests = useAgentRequests()
  const pendingRequests = requests.filter((r) => r.status === '승인 대기')
  const [showActionCenter, setShowActionCenter] = useState(false)
  const actionReady = actionOwnerReadyCount('버스회사', snap)

  // 관제 로스터 검색 — 차량번호·기사·노선 부분일치(라이브 9대). 대규모 플릿 확장성 시연
  const [rosterQ, setRosterQ] = useState('')
  const rq = rosterQ.trim()
  const rosterRows = rq
    ? sorted.filter(
        (v) =>
          v.id.includes(rq) ||
          v.driverName.includes(rq) ||
          (ROUTES.find((r) => r.id === v.routeId)?.name.includes(rq) ?? false),
      )
    : sorted

  const subNav = (
    <div className="flex flex-wrap gap-1">
      {SUB_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setSub(t.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            sub === t.id ? 'bg-sky-600 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
          }`}
        >
          {t.label}
          {t.id === 'scanner' && fault?.predicted && <span className="ml-1 text-red-400">●</span>}
        </button>
      ))}
    </div>
  )

  if (sub !== 'ops') {
    return (
      <div className="flex h-full flex-col gap-3">
        {subNav}
        <div className="min-h-0 flex-1">
          {sub === 'biz' && <BizSummary />}
          {sub === 'trips' && <TripsLog />}
          {sub === 'report' && <AiReport />}
          {sub === 'eco' && <EcoFuel />}
          {sub === 'scanner' && <Scanner />}
          {sub === 'chat' && <MaintChat />}
          {sub === 'depot' && <Depot />}
          {sub === 'vehicles' && <VehicleRegistry onSub={setSub} />}
          {sub === 'drivers' && <DriverRegistry onSub={setSub} />}
          {sub === 'routes' && <RouteRegistry />}
        </div>
      </div>
    )
  }

  const coachTargets = snap.vehicles.filter((v) => v.score < 78).length
  const glanceCards = [
    { icon: '⚡', label: '전기 전환', body: '노후 경유 2대 우선', hint: '전환 시 35.7t CO₂/년 · 회수 2.7년', go: 'biz' as const, tone: 'text-sky-300' },
    { icon: '🔌', label: '충전 최적화', body: '야간 충전 스케줄', hint: '피크시간 회피로 전력비 절감', go: 'depot' as const, tone: 'text-emerald-300' },
    { icon: '🌱', label: '공회전 코칭', body: `코칭 대상 ${coachTargets}명`, hint: '공회전·급가속 교육으로 연비 개선', go: 'eco' as const, tone: 'text-amber-300' },
    {
      icon: '🔧',
      label: '정비 진단',
      body: fault?.predicted ? `${fault.vehicleId.slice(-4)}호 ${fault.kind}` : '예지정비 정상',
      hint: fault?.predicted ? 'AI+ 정비도우미에서 진단 →' : '전 차량 예측 이상 없음',
      go: 'chat' as const,
      tone: fault?.predicted ? 'text-red-300' : 'text-gray-300',
    },
  ]

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {subNav}

      {/* 지금 AI가 추천하는 4가지 — 교차도메인 실행 제안 글랜스 (각 카드 해당 서브탭 딥링크) */}
      <div className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-2">
        {glanceCards.map((c) => (
          <button
            key={c.label}
            onClick={() => setSub(c.go)}
            className="flex flex-col rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5 text-left transition-colors hover:border-sky-600/50 hover:bg-gray-800/60"
            title={c.hint}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
              <span className="text-sm">{c.icon}</span>
              {c.label}
              <span className="ml-auto text-gray-600">→</span>
            </span>
            <span className={`mt-1 text-[13px] font-bold leading-tight ${c.tone}`}>{c.body}</span>
            <span className="mt-1 text-[9.5px] leading-tight text-gray-600">{c.hint}</span>
          </button>
        ))}
      </div>

      {/* Agentic — AI 추천 조치 (승인 기반 실행) */}
      {(snap.recommendations.length > 0 || snap.workOrders.length > 0) && (
        <Panel
          title={
            <span>
              🤖 AI 추천 조치{' '}
              <span className="ml-1 text-[10px] font-normal text-gray-500">
                예측 → 조치안 생성 → <b className="text-sky-400">담당자 승인</b> → 실행 → 검증
              </span>
            </span>
          }
          right={
            pendingActions > 0 ? (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                대기 {pendingActions}건
              </span>
            ) : (
              <span className="text-[11px] text-gray-500">모두 처리됨</span>
            )
          }
          className="border-sky-500/20"
        >
          <div className="space-y-2">
            {snap.recommendations.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg bg-gray-800/40 px-3 py-2.5">
                <span className="text-lg">🚌</span>
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-gray-200">
                    배차간격 권고 — {ROUTES.find((x) => x.id === r.routeId)?.name} {r.vehicleId.slice(-4)}호:{' '}
                    <span className="text-sky-300">{r.action}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    근거: {r.reason} · 기대효과: <span className="text-emerald-400">{r.effect}</span>
                  </div>
                </div>
                {r.status === '대기' ? (
                  <button
                    onClick={() => engine.approveRecommendation(r.id)}
                    className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-500"
                  >
                    승인
                  </button>
                ) : (
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                      r.status === '실행완료'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {r.status === '실행완료' ? '✓ 실행완료 · 간격 회복 검증됨' : '승인됨 · 다음 정류장 실행'}
                  </span>
                )}
              </div>
            ))}
            {snap.workOrders.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-lg bg-gray-800/40 px-3 py-2.5">
                <span className="text-lg">🔧</span>
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-gray-200">
                    정비 작업지시 초안 — {w.vehicleId.slice(-4)}호 <span className="text-amber-300">{w.kind}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    점검항목: {w.items.join(' · ')} · 예상 {w.estHours}시간 · 2회차 종료 후 권장
                  </div>
                </div>
                {w.status === '초안' ? (
                  <button
                    onClick={() => engine.approveWorkOrder(w.id)}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-500"
                  >
                    작업지시 발행
                  </button>
                ) : (
                  <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-400">
                    ✓ 발행됨 · 정비팀 전달
                  </span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
      {/* 기사 요청 승인함 — 구 에이전트 플랫폼 '회사' 롤 승인 기능 흡수 */}
      {requests.length > 0 && (
        <Panel
          title="📥 기사 요청 승인함"
          right={
            pendingRequests.length > 0 ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                대기 {pendingRequests.length}건
              </span>
            ) : (
              <span className="text-[11px] text-gray-500">모두 처리됨</span>
            )
          }
        >
          <div className="space-y-1.5">
            {requests.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md bg-gray-800/40 px-3 py-2 text-[11px]">
                <span>{REQ_ICON[r.kind]}</span>
                <span className="shrink-0 font-semibold text-gray-300">{r.kind}</span>
                <span className="shrink-0 text-gray-500">{r.from} 기사</span>
                <span className="min-w-0 flex-1 truncate text-gray-400">{r.detail}</span>
                {r.status === '승인 대기' ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      onClick={() => resolveRequest(r.id, '승인')}
                      className="rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => resolveRequest(r.id, '반려')}
                      className="rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-400 hover:text-gray-200"
                    >
                      반려
                    </button>
                  </span>
                ) : (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      r.status === '승인' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {r.status === '승인' ? '✓ 승인됨' : '반려'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 조치함 — 구 AI 업무센터의 버스회사 업무 (민원회신·작업지시·코칭통보) */}
      <Panel
        title="📋 업무함"
        right={
          <button
            onClick={() => setShowActionCenter((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold ${
              actionReady > 0 ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500'
            }`}
          >
            {actionReady > 0 ? `${actionReady}건 승인 대기` : '모두 처리됨'} {showActionCenter ? '▾' : '▸'}
          </button>
        }
      >
        {showActionCenter ? (
          <ActionCenterList owner="버스회사" snap={snap} />
        ) : (
          <div className="text-[11px] text-gray-500">
            민원 회신문·정비 작업지시·코칭 통보문을 AI가 초안 작성합니다 — 펼쳐서 검토·승인하세요.
          </div>
        )}
      </Panel>

      {/* 고장예측 알림 배너 */}
      {fault && fault.predicted && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
          <div className="text-3xl">⚠️</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-amber-300">
              고장예측 알림 — {fault.vehicleId} {fault.kind}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-amber-200/70">
              냉각수온이 정상범위(88~95°C)를 벗어나 상승 중입니다. 현재{' '}
              <b className="tabular-nums">{fault.coolantTemp.toFixed(1)}°C</b> — 써모스탯/워터펌프 점검
              권장. <b>운행 중단 전 예방 정비로 대응 가능</b> (예상 절감: 긴급출동 + 대차 비용 약 180만원)
            </div>
          </div>
          <div className="h-20 w-64">
            <ResponsiveContainer>
              <LineChart data={fault.history}>
                <XAxis dataKey="t" hide />
                <YAxis domain={[85, 115]} hide />
                <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 3" />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 기사 소명함 — 급조작 직후 음성/버튼 소명 검토 (불이익 확정은 사람이) */}
      {snap.pleas.length > 0 && (
        <Panel
          title="🎙 기사 상황 설명"
          right={
            <span className="text-[11px] text-gray-500">
              확인 대기 {snap.pleas.filter((p) => p.status === '접수').length}건 · 인정 시 감점 즉시 복원
            </span>
          }
          className="border-emerald-500/20"
        >
          <div className="space-y-2">
            {snap.pleas.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-gray-800/40 px-3 py-2.5">
                <span className="text-lg">{p.method === '음성' ? '🎙' : '🔘'}</span>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold text-gray-200">
                    {p.vehicleId.slice(-4)}호 {p.driverName} 기사 — <span className="text-red-400">{p.eventType}</span>{' '}
                    <span className="text-[10px] text-gray-500">({simClock(p.simTime)} · {p.method} 설명)</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] italic text-gray-400">"{p.note}"</div>
                </div>
                {p.status === '접수' ? (
                  <button
                    onClick={() => engine.acknowledgePlea(p.id)}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500"
                  >
                    설명 확인
                  </button>
                ) : (
                  <span className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-400">
                    ✓ 인정 · 감점 복원됨
                  </span>
                )}
              </div>
            ))}
            <div className="text-[10px] text-gray-600">
              전후 주행 데이터·DVR 클립(실증 시)이 자동 첨부됩니다 — AI는 면제를 자동으로, 불이익 확정은 사람이
            </div>
          </div>
        </Panel>
      )}

      {/* 차량/기사 테이블 */}
      <Panel
        title="차량 · 기사별 운행 현황"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-gray-500">
              {rosterRows.length}/{snap.vehicles.length}대 · 실증 라이브
            </span>
            <input
              value={rosterQ}
              onChange={(e) => setRosterQ(e.target.value)}
              placeholder="차량번호·기사·노선 검색"
              className="w-40 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
            />
          </div>
        }
      >
        <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-[11px] text-gray-500">
              <th className="pb-2 pr-3 font-medium">차량번호</th>
              <th className="pb-2 pr-3 font-medium">노선</th>
              <th className="pb-2 pr-3 font-medium">기사</th>
              <th className="pb-2 pr-3 font-medium">운전점수</th>
              <th className="pb-2 pr-3 font-medium">속도</th>
              <th className="pb-2 pr-3 font-medium">주행</th>
              <th className="pb-2 pr-3 font-medium">연료(CNG)</th>
              <th className="pb-2 pr-3 font-medium">재차율</th>
              <th className="pb-2 pr-3 font-medium">배차간격</th>
              <th className="pb-2 pr-3 font-medium">위험운전</th>
              <th className="pb-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {rosterRows.map((v) => {
              const route = ROUTES.find((r) => r.id === v.routeId)!
              const evTotal = RISK_EVENT_TYPES.reduce((s, t) => s + v.eventCounts[t], 0)
              const isFault = fault?.predicted && fault.vehicleId === v.id
              return (
                <tr key={v.id} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2 pr-3 font-mono font-semibold text-gray-200">{v.id}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: route.color }} />
                      {route.name}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-300">
                    {v.driverName} <PersonaChip persona={v.persona} />
                  </td>
                  <td className="py-2 pr-3">
                    <ScoreBadge score={v.score} />
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-gray-400">{Math.round(v.speedKmh)} km/h</td>
                  <td className="py-2 pr-3 tabular-nums text-gray-400">{v.distanceKm.toFixed(1)} km</td>
                  <td className="py-2 pr-3 tabular-nums text-gray-400">{v.fuelM3.toFixed(2)} m³</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`tabular-nums ${
                        v.occupancy >= 0.7 ? 'text-red-400' : v.occupancy >= 0.4 ? 'text-amber-400' : 'text-gray-400'
                      }`}
                    >
                      {Math.round(v.occupancy * 100)}%
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {v.headway && v.headway.peers >= 2 ? (
                      <span
                        className={`tabular-nums ${
                          v.headway.status === 'bunching'
                            ? 'font-semibold text-amber-400'
                            : v.headway.status === 'gap'
                              ? 'text-sky-400'
                              : 'text-gray-400'
                        }`}
                        title={`앞차 ${v.headway.frontId ? `${v.headway.frontGapMin.toFixed(1)}분` : '없음(선두)'} / 뒤차 ${v.headway.rearId ? `${v.headway.rearGapMin.toFixed(1)}분` : '없음'} · 적정 ${v.headway.idealMin.toFixed(1)}분`}
                      >
                        {!v.headway.frontId
                          ? '선두'
                          : v.headway.status === 'bunching'
                            ? `⚠ ${v.headway.frontGapMin.toFixed(1)}분`
                            : `${v.headway.frontGapMin.toFixed(1)}분`}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`tabular-nums ${evTotal > 5 ? 'text-red-400 font-semibold' : 'text-gray-400'}`}>
                      {evTotal}건
                    </span>
                  </td>
                  <td className="py-2">
                    {isFault ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                        점검필요
                      </span>
                    ) : v.dwellRemaining > 0 ? (
                      <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">정차</span>
                    ) : (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                        운행중
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rosterRows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-[11px] text-gray-600">
                  '{rq}' 검색 결과가 없어요 — 차량번호·기사명·노선으로 검색해 보세요
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        {/* 정비비 예측 */}
        <Panel
          title="🔧 정비비 예측 (월간)"
          right={
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span>OBD/CAN + 정비이력</span>
              <span className="rounded bg-gray-800/60 px-1.5 py-0.5 text-[10px] text-gray-500">예시 데이터 · OBD/CAN 축적 시 실측</span>
            </span>
          }
        >
          <div className="space-y-2.5 text-xs">
            {[
              ['브레이크 패드', '3742 · 5563', '잔여수명 2주', 'text-red-400'],
              ['냉각계통', fault ? '3742 (진행중)' : '이상 없음', fault ? '즉시 점검' : '정상', fault ? 'text-amber-400' : 'text-emerald-400'],
              ['엔진오일', '전 차량', '평균 잔여 3,200km', 'text-gray-400'],
              ['타이어', '1205 · 0917', '마모율 72%', 'text-amber-400'],
            ].map(([part, veh, status, cls]) => (
              <div key={part as string} className="flex items-center justify-between rounded-md bg-gray-800/40 px-3 py-2">
                <span className="font-semibold text-gray-300">{part}</span>
                <span className="text-gray-500">{veh}</span>
                <span className={`font-semibold ${cls}`}>{status}</span>
              </div>
            ))}
            <div className="mt-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
              예방정비 전환 시 예상 절감: <b>월 약 340만원</b> (긴급수리 대비, 26개사 평균 추정)
            </div>
          </div>
        </Panel>

        {/* eTAS 제출 현황 = 운행기록 (521) */}
        <Panel
          title="eTAS 운행기록 자동제출"
          right={<span className="text-[11px] text-gray-500">공단 운행기록 표준(521) · 법정 의무 자동화</span>}
        >
          <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto text-[11px]">
            {snap.trips.slice(0, 12).map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-gray-800/40 px-2.5 py-1.5">
                <span className="font-mono text-gray-300">{t.vehicleId.slice(-4)}호</span>
                <span className="text-gray-500">{t.routeName}</span>
                <span className="tabular-nums text-gray-400">{t.distanceKm} km</span>
                <span className="tabular-nums text-gray-400">{t.fuelM3} m³</span>
                <span className="font-mono text-gray-600">{simClock(t.endSimTime)}</span>
                <span className="font-semibold text-emerald-400">제출완료 ✓</span>
              </div>
            ))}
            {snap.trips.length === 0 && (
              <div className="py-4 text-center text-gray-600">
                운행 완료 시 자동제출 기록이 표시됩니다 (배속을 올려보세요)
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
