import { useRef, useState } from 'react'
import { useSim } from '../sim/store'
import { DEMO_VEHICLE_ID } from '../sim/engine'
import { RISK_EVENT_TYPES, type SimSnapshot } from '../sim/types'
import { ROUTES } from '../sim/routes'
import { resolveRequest, submitRequest, useAgentRequests, type AgentRequest } from '../sim/agentRequests'
import { simClock } from '../components/ui'

/**
 * 운수회사 에이전트 플랫폼 — 회사(관리자)와 기사가 각자 쓰는 개인 AI 에이전트.
 * 두 역할이 요청/승인 워크플로우로 연결된다(기사 신청 → 회사 승인함).
 * 데모: 규칙 기반 의도 매칭 + 실데이터. 실서비스: 역할별 LLM 에이전트 + 도구 호출(조회·신청·승인).
 */

type Role = 'company' | 'driver'

interface Reply {
  text: string
  evidence?: string[]
}

const fmt1 = (n: number) => Math.round(n * 10) / 10

/* ── 회사(관리자) 에이전트 ── */
function companyAnswer(qRaw: string, snap: SimSnapshot, pending: number): Reply {
  const q = qRaw.replace(/\s/g, '')
  const has = (...ws: string[]) => ws.some((w) => q.includes(w))
  const vs = snap.vehicles

  if (has('승인', '대기', '요청', '휴가', '신청'))
    return {
      text:
        pending > 0
          ? `현재 승인 대기 ${pending}건이 있습니다. 아래 승인함에서 검토·처리하실 수 있습니다.`
          : '현재 승인 대기 중인 기사 요청은 없습니다.',
      evidence: [`승인 대기 ${pending}건`],
    }
  if (has('결원', '근무', '배차', '출근'))
    return {
      text: `금일 ${vs.length}대 정상 운행 중이며 결원은 없습니다. 예비차 2대(8801·8802)가 차고지 대기 중이라 결원·고장 시 즉시 투입 가능합니다.`,
      evidence: [`운행 ${vs.length}대 · 결행 0`, '예비차 2대 대기'],
    }
  if (has('정비', '고장', '입고', '점검'))
    return {
      text: snap.fault?.predicted
        ? `${snap.fault.vehicleId.slice(-4)}호에 ${snap.fault.kind} 예측이 발화해 예방 정비 입고가 예정되어 있습니다(현재 ${Math.round(snap.fault.coolantTemp)}°C).`
        : '현재 정비 입고 예정 차량은 없습니다. 브레이크 패드는 3742·5563호가 잔여 2주로 점검 예정입니다.',
      evidence: [`고장 예측 ${snap.fault?.predicted ? 1 : 0}건 · 작업지시 ${snap.workOrders.length}건`],
    }
  if (has('연료', '비용', '연비', '절감'))
    return {
      text: `현재 코칭 효과로 연료 ${fmt1(snap.kpi.fuelSavedPct)}%를 절감 중입니다. 총 주행 ${fmt1(snap.kpi.totalDistanceKm)}km, CO₂ 절감 ${fmt1(snap.kpi.totalCo2SavedKg)}kg입니다.`,
      evidence: [`절감률 ${fmt1(snap.kpi.fuelSavedPct)}%`],
    }
  if (has('기사', '점수', '순위', '위험', '누가')) {
    const worst = [...vs].sort((a, b) => a.score - b.score)[0]
    const best = [...vs].sort((a, b) => b.score - a.score)[0]
    return {
      text: `안전점수 최상위는 ${best.driverName} 기사(${Math.round(best.score)}점), 코칭 우선 대상은 ${worst.driverName} 기사(${Math.round(worst.score)}점)입니다. 전체 평균은 ${fmt1(snap.kpi.avgScore)}점입니다.`,
      evidence: [`평균 ${fmt1(snap.kpi.avgScore)}점 · ${vs.length}명`],
    }
  }
  return {
    text: '운영 현황을 물어보세요. 예: "결원 있어?", "정비 입고 차량?", "이번 승인 대기?", "연료비 절감 현황?", "코칭 대상 기사?"',
  }
}

/* ── 기사 에이전트 (주인공 3742호 김성호) ── */
function driverAnswer(qRaw: string, snap: SimSnapshot): Reply {
  const q = qRaw.replace(/\s/g, '')
  const has = (...ws: string[]) => ws.some((w) => q.includes(w))
  const v = snap.vehicles.find((x) => x.id === DEMO_VEHICLE_ID)!
  const route = ROUTES.find((r) => r.id === v.routeId)!
  const rank = [...snap.vehicles].sort((a, b) => b.score - a.score).findIndex((x) => x.id === v.id) + 1

  if (has('배차', '노선', '오늘', '어디', '운행'))
    return {
      text: `오늘 배차는 ${route.name}(${v.id.slice(-4)}호)입니다. 현재 ${v.nextStopName} 방면 운행 중이며, 다음 교대는 14:00 성서차고지입니다.`,
      evidence: [`${route.name} · ${v.id.slice(-4)}호`],
    }
  if (has('점수', '안전', '경제운전', '에코', '순위')) {
    const top = RISK_EVENT_TYPES.map((t) => ({ t, c: v.eventCounts[t] })).sort((a, b) => b.c - a.c)[0]
    return {
      text: `오늘 안전점수는 ${Math.round(v.score)}점(사내 ${rank}위), 경제운전 점수는 ${Math.round(v.ecoScore)}점입니다. ${top.c > 0 ? `${top.t}이 개선 우선 항목이에요 — 정류장 접근 시 미리 발을 떼면 점수·연비가 함께 올라갑니다.` : '정속 주행이 잘 유지되고 있어요. 좋습니다!'}`,
      evidence: [`안전 ${Math.round(v.score)}점 · 에코 ${Math.round(v.ecoScore)}점 · ${rank}위`],
    }
  }
  if (has('급여', '수당', '월급', '얼마'))
    return {
      text: `이번 달 예상 급여는 기본급 + 무사고·안전운전 리워드로 구성됩니다. 현재 방어운전 크레딧 ${v.defenseCredits}점, 안전점수 상위 시 인센티브가 가산됩니다. (정확한 금액은 급여 정산일 확정)`,
      evidence: [`방어 크레딧 ${v.defenseCredits} · 안전 ${Math.round(v.score)}점`],
    }
  if (has('차량', '내차', '점검', '고장'))
    return {
      text:
        snap.fault?.vehicleId === v.id && snap.fault.predicted
          ? `${v.id.slice(-4)}호에 냉각계통 예방정비가 예정되어 있습니다. 금일 2회차 종료 후 차고지 입고이니 무리한 운행 없이 정상 주행하세요.`
          : `${v.id.slice(-4)}호는 주요 계통 이상 신호 없이 정상입니다. 정기 점검 일정은 회사 공지를 확인하세요.`,
      evidence: [`차량 ${v.id.slice(-4)}호`],
    }
  if (has('교육', '코칭'))
    return {
      text:
        v.score < 78
          ? '안전운전 코칭 프로그램 대상으로 안내되었습니다. 이는 평가가 아닌 사고 예방 지원이며, 교육 일정은 아래 "교육 일정 확인"으로 신청할 수 있어요.'
          : '현재 필수 교육 대상은 아닙니다. 자율 코칭 콘텐츠는 언제든 신청할 수 있어요.',
      evidence: [`안전점수 ${Math.round(v.score)}점`],
    }
  return {
    text: '무엇이든 물어보세요. 예: "오늘 내 배차?", "내 안전점수 몇 점?", "내 차 점검 있어?", "이번 달 급여?", "교육 대상이야?" — 아래 빠른 신청도 이용하세요.',
  }
}

const COMPANY_SUGGEST = ['결원 있어?', '정비 입고 차량?', '승인 대기 건?', '코칭 대상 기사?']
const DRIVER_SUGGEST = ['오늘 내 배차?', '내 안전점수?', '내 차 점검 있어?', '이번 달 급여?']

const KIND_ICON: Record<AgentRequest['kind'], string> = { 휴가: '🏖️', 상황설명: '🎙', 교육문의: '🎓', 근무변경: '🔁' }

export default function AgentPlatform() {
  const snap = useSim()
  const snapRef = useRef(snap)
  snapRef.current = snap
  const requests = useAgentRequests()
  const [role, setRole] = useState<Role>('company')
  const [msgs, setMsgs] = useState<Record<Role, { who: 'me' | 'ai'; text: string; ev?: string[] }[]>>({
    company: [],
    driver: [],
  })
  const [input, setInput] = useState('')

  const pending = requests.filter((r) => r.status === '승인 대기').length
  const driver = snap.vehicles.find((x) => x.id === DEMO_VEHICLE_ID)!

  const send = (text: string) => {
    if (!text.trim()) return
    const reply = role === 'company' ? companyAnswer(text, snapRef.current, pending) : driverAnswer(text, snapRef.current)
    setMsgs((m) => ({
      ...m,
      [role]: [...m[role], { who: 'me', text }, { who: 'ai', text: reply.text, ev: reply.evidence }],
    }))
    setInput('')
  }

  const roleMsgs = msgs[role]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 overflow-hidden">
      {/* 역할 토글 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(
            [
              ['company', '🏢 회사 (관리자)'],
              ['driver', '🧑‍✈️ 기사 (김성호)'],
            ] as [Role, string][]
          ).map(([r, label]) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
                role === r ? 'bg-sky-600 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              {r === 'company' && pending > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500/30 px-1.5 text-[10px] font-bold text-amber-300">{pending}</span>
              )}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-500">운수회사 에이전트 플랫폼 · 역할별 개인 AI</span>
      </div>

      {/* 오늘의 브리핑 */}
      <div className="rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/10 to-gray-900/40 px-4 py-3">
        <div className="text-[10px] font-semibold tracking-widest text-sky-400">오늘의 브리핑 · AI 에이전트</div>
        <div className="mt-1 text-xs leading-relaxed text-gray-300">
          {role === 'company'
            ? `${simClock(snap.simTime)} 기준 ${snap.vehicles.length}대 정상 운행 중입니다. 정비 입고 ${snap.fault?.predicted ? 1 : 0}대, 기사 요청 승인 대기 ${pending}건, 평균 안전점수 ${fmt1(snap.kpi.avgScore)}점입니다.`
            : `${driver.driverName} 기사님, 오늘 ${ROUTES.find((r) => r.id === driver.routeId)!.name} 배차입니다. 안전점수 ${Math.round(driver.score)}점(사내 ${[...snap.vehicles].sort((a, b) => b.score - a.score).findIndex((x) => x.id === driver.id) + 1}위), 경제운전 ${Math.round(driver.ecoScore)}점. 다음 교대는 14:00입니다.`}
        </div>
      </div>

      {/* 회사: 승인함 / 기사: 내 요청 현황 */}
      {(role === 'company' ? requests : requests.filter((r) => r.vehicleId === DEMO_VEHICLE_ID)).length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <div className="mb-1.5 text-[11px] font-bold text-gray-300">
            {role === 'company' ? '📥 기사 요청 승인함' : '📤 내 신청 현황'}
          </div>
          <div className="space-y-1.5">
            {(role === 'company' ? requests : requests.filter((r) => r.vehicleId === DEMO_VEHICLE_ID))
              .slice(0, 5)
              .map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md bg-gray-800/40 px-2.5 py-1.5 text-[11px]">
                  <span>{KIND_ICON[r.kind]}</span>
                  <span className="shrink-0 font-semibold text-gray-300">{r.kind}</span>
                  {role === 'company' && <span className="shrink-0 text-gray-500">{r.from} 기사</span>}
                  <span className="min-w-0 flex-1 truncate text-gray-400">{r.detail}</span>
                  {r.status === '승인 대기' ? (
                    role === 'company' ? (
                      <span className="flex shrink-0 gap-1">
                        <button
                          onClick={() => resolveRequest(r.id, '승인')}
                          className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => resolveRequest(r.id, '반려')}
                          className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200"
                        >
                          반려
                        </button>
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">승인 대기</span>
                    )
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
        </div>
      )}

      {/* 채팅 */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-800 bg-gray-950/60">
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {roleMsgs.length === 0 && (
            <div className="mt-6 text-center text-xs leading-relaxed text-gray-500">
              <div className="mb-1 text-2xl">{role === 'company' ? '🏢' : '🧑‍✈️'}</div>
              {role === 'company' ? '운영 현황을 자연어로 물어보세요.' : '근무·점수·차량 등 무엇이든 물어보세요.'}
              <br />
              실시간 데이터를 조회해 답합니다.
            </div>
          )}
          {roleMsgs.map((m, i) =>
            m.who === 'me' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-sky-600/30 px-3 py-2 text-xs text-sky-100">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-2">
                <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-gradient-to-tr from-violet-500 to-sky-400" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs leading-relaxed text-gray-300">
                    {m.text}
                  </div>
                  {m.ev && (
                    <div className="flex flex-wrap gap-1">
                      {m.ev.map((e) => (
                        <span key={e} className="rounded border border-gray-700/60 bg-gray-800/50 px-1.5 py-0.5 text-[9px] tabular-nums text-gray-500">
                          근거 · {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        {/* 빠른 액션 */}
        <div className="border-t border-gray-800 px-3 pt-2">
          {role === 'driver' && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <button
                onClick={() => submitRequest('휴가', driver.driverName, driver.id, '7월 15일 연차 신청합니다.', snap.simTime)}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
              >
                🏖️ 휴가 신청
              </button>
              <button
                onClick={() => submitRequest('상황설명', driver.driverName, driver.id, '앞차 급끼어들기로 급제동했습니다.', snap.simTime)}
                className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/20"
              >
                🎙 상황 설명 제출
              </button>
              <button
                onClick={() => submitRequest('교육문의', driver.driverName, driver.id, '안전운전 코칭 일정 문의합니다.', snap.simTime)}
                className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/20"
              >
                🎓 교육 일정 신청
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pb-1">
            {(role === 'company' ? COMPANY_SUGGEST : DRIVER_SUGGEST).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-400 hover:border-sky-500/50 hover:text-sky-300"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder={role === 'company' ? '운영 현황을 물어보세요…' : '근무·점수·차량을 물어보세요…'}
            className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
          />
          <button onClick={() => send(input)} className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500">
            →
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2 text-[10px] leading-relaxed text-gray-600">
        🤝 회사·기사가 각자 쓰는 역할별 에이전트 — 기사 신청이 회사 승인함으로 연결됩니다. 데모: 규칙
        기반 + 실데이터. 실서비스: 역할별 LLM 에이전트 + 도구 호출(조회·신청·승인·정산). 급여·평가 확정은
        담당자 최종 판단.
      </div>
    </div>
  )
}
