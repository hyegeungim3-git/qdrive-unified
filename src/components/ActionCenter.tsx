import { useState } from 'react'
import { engine } from '../sim/store'
import { RISK_EVENT_TYPES, type SimSnapshot } from '../sim/types'
import { simClock } from './ui'

/**
 * 조치함 — AI가 데이터 수집→분석→문서 초안까지 처리하고 담당자는 검토·승인만 하는 업무 목록.
 * 구 "AI 업무 자동화 센터"(최상위 탭)를 해체해 대구시 조치는 시티 대시보드에, 버스회사 조치는
 * 운수사 관제에 각자의 맥락에서 뜨도록 재배치. 승인 워크플로 패턴이 챗 어시스턴트와 근본적으로
 * 달라 AI Q(도우미)에 흡수하지 않고 별도 유지 — 자율성 레벨(L2 추천 / L3 승인 후 실행)을 업무별로 분리.
 */

export type ActionOwner = '버스회사' | '대구시'

interface ActionDoc {
  title: string
  body: string
}

interface ActionTask {
  id: string
  owner: ActionOwner
  icon: string
  title: string
  autonomy: 'L2' | 'L3'
  autonomyLabel: string
  steps: string[]
  ready: (s: SimSnapshot) => boolean
  waitingMsg: string
  summary: (s: SimSnapshot) => string
  document: (s: SimSnapshot) => ActionDoc
  approveLabel: string
  approvedMsg: string
  onApprove?: (s: SimSnapshot) => void
}

const TASKS: ActionTask[] = [
  /* ── 버스회사 담당자 업무 ── */
  {
    id: 'complaint-reply',
    owner: '버스회사',
    icon: '✉️',
    title: '민원 회신문 자동 작성',
    autonomy: 'L3',
    autonomyLabel: 'L3 · 승인 후 발송',
    steps: ['민원 접수 감지', 'GPS·DTG·문개폐·DVR 증빙 자동 조사', '사실관계 분석·판정', '회신문 초안 작성'],
    ready: (s) => s.complaints.some((c) => c.evidence),
    waitingMsg: '접수된 민원이 없습니다 — 민원 발생 시 증빙 조사와 회신문 작성이 자동 시작됩니다.',
    summary: (s) => {
      const c = s.complaints.find((x) => x.evidence)!
      return `민원 1건에 대해 증빙 자동매칭(사실 가능성 ${c.evidence!.aiScore}%)을 마치고 회신문 초안을 작성했습니다.`
    },
    document: (s) => {
      const c = s.complaints.find((x) => x.evidence)!
      return {
        title: '시내버스 이용 불편 민원 회신 (초안)',
        body:
          `수신: 민원인 귀하\n제목: ${c.routeId === 'R1' ? '급행1' : '해당 노선'} 운행 관련 민원 회신\n\n` +
          `1. 귀하의 소중한 의견에 감사드립니다.\n` +
          `2. 접수하신 내용을 운행기록(DTG)·차량 위치(GPS)·문 개폐 로그·차량 영상(DVR)으로 조사한 결과, ` +
          `해당 시간대 ${c.evidence!.vehicleId.slice(-4)}호 차량에서 급제동 이력이 확인되었습니다(사실 가능성 ${c.evidence!.aiScore}%).\n` +
          `3. 이에 당사는 해당 운전원에게 실시간 코칭 및 안전교육을 실시하였으며, 동일 구간 재발 여부를 4주간 모니터링하겠습니다.\n` +
          `4. 앞으로 더 안전하고 편리한 운행을 위해 노력하겠습니다. 감사합니다.`,
      }
    },
    approveLabel: '검토·승인 후 발송',
    approvedMsg: '✓ 회신문 발송 완료 · 민원 처리 상태 갱신',
    onApprove: (s) => {
      const c = s.complaints.find((x) => x.evidence && x.status !== '해결')
      if (c) engine.advanceComplaint(c.id)
    },
  },
  {
    id: 'work-order',
    owner: '버스회사',
    icon: '🔧',
    title: '정비 작업지시서 자동 발행',
    autonomy: 'L3',
    autonomyLabel: 'L3 · 승인 후 발행',
    steps: ['CAN 센서 이상 패턴 감지', '유사 고장사례 대조', '점검 항목·부품 산정', '작업지시서 초안 작성'],
    ready: (s) => !!s.fault?.predicted,
    waitingMsg: '고장 예측 신호가 없습니다 — 예지정비 에이전트가 이상 패턴을 상시 감시 중입니다.',
    summary: (s) =>
      `${s.fault!.vehicleId.slice(-4)}호 ${s.fault!.kind} 예측(현재 ${Math.round(s.fault!.coolantTemp)}°C)에 대해 작업지시서를 작성했습니다.`,
    document: (s) => ({
      title: `예방 정비 작업지시서 (초안) — ${s.fault!.vehicleId.slice(-4)}호`,
      body:
        `차량: ${s.fault!.vehicleId} · 증상: ${s.fault!.kind}\n` +
        `현재 냉각수온: ${Math.round(s.fault!.coolantTemp)}°C (정상 88~95°C)\n\n` +
        `[점검 항목]\n1. 냉각팬 작동 점검\n2. 서모스탯 교체 검토\n3. 냉각수 라인 누설 확인\n\n` +
        `[조치] 금일 2회차 종료 후 차고지 입고 · 예상 소요 1.5시간\n` +
        `[근거] 유사 고장 차량의 냉각수온 상승 패턴과 일치. 운휴 전 예방 정비로 긴급출동·대차 비용(약 180만원) 절감 예상.`,
    }),
    approveLabel: '검토·승인 후 발행',
    approvedMsg: '✓ 작업지시서 발행 · 정비팀 전달',
    onApprove: (s) => {
      const w = s.workOrders.find((x) => x.status === '초안')
      if (w) engine.approveWorkOrder(w.id)
    },
  },
  {
    id: 'coaching-target',
    owner: '버스회사',
    icon: '🎓',
    title: '코칭 대상 선정·통보문 작성',
    autonomy: 'L2',
    autonomyLabel: 'L2 · 추천(발송은 담당자)',
    steps: ['기사별 안전점수·이벤트 밀도 집계', '노선 난이도 보정', '코칭 대상 선별', '교육 안내문 초안 작성'],
    ready: (s) => s.vehicles.some((v) => v.score < 78),
    waitingMsg: '현재 코칭 대상 기준(78점 미만)에 해당하는 기사가 없습니다.',
    summary: (s) => {
      const n = s.vehicles.filter((v) => v.score < 78).length
      return `안전점수 하위 ${n}명을 코칭 대상으로 선별하고 교육 안내문을 작성했습니다.`
    },
    document: (s) => {
      const targets = s.vehicles.filter((v) => v.score < 78).sort((a, b) => a.score - b.score)
      const lines = targets.map((v) => {
        const top = RISK_EVENT_TYPES.map((t) => ({ t, c: v.eventCounts[t] })).sort((a, b) => b.c - a.c)[0]
        return `· ${v.driverName} 기사(${v.id.slice(-4)}호): ${Math.round(v.score)}점 · 개선 우선 ${top.c > 0 ? top.t : '정속 유지'}`
      })
      return {
        title: '안전운전 코칭 대상 통보 (초안)',
        body:
          `대상 기사님께,\n\n금월 운행 데이터 분석 결과, 아래 기사님을 4주 안전운전 코칭 프로그램 대상으로 안내드립니다. ` +
          `이는 평가·징계가 아니라 사고 예방을 위한 지원 프로그램입니다.\n\n${lines.join('\n')}\n\n` +
          `※ 노선 난이도·시간대·날씨를 보정한 공정 점수 기준이며, 방어 운전으로 판정된 급조작은 감점에서 제외됩니다.`,
      }
    },
    approveLabel: '검토·수정 후 활용',
    approvedMsg: '✓ 코칭 안내문 확정 · 교육팀 공유',
  },

  /* ── 대구시 담당자 업무 ── */
  {
    id: 'settlement-audit',
    owner: '대구시',
    icon: '💰',
    title: '준공영제 정산 검증·소명요청 공문',
    autonomy: 'L3',
    autonomyLabel: 'L3 · 승인 후 발송',
    steps: ['BMS 운행등록 vs DTG 위치이력 교차검증', '인가노선 이탈 의심 건 플래그', '소명요청 공문 초안 작성'],
    ready: (s) => s.trips.length > 4,
    waitingMsg: '검증할 운행기록이 충분히 쌓이지 않았습니다 — 배속을 올리면 회차 데이터가 집계됩니다.',
    summary: () => 'BMS×DTG 교차검증에서 인가노선 이탈 의심 1건을 발견해 소명요청 공문을 작성했습니다.',
    document: () => ({
      title: '시내버스 운행실적 소명 요청 (초안)',
      body:
        `수신: OO운수(주)\n제목: 인가노선 운행실적 소명 요청\n\n` +
        `1. 준공영제 재정지원 관련 협조에 감사드립니다.\n` +
        `2. 5563호 3회차 운행에 대해 BMS 운행기록은 정상운행으로 등록되었으나, ` +
        `DTG 위치이력 분석 결과 인가노선의 약 87%만 운행한 것으로 확인되어 소명을 요청합니다.\n` +
        `3. 붙임의 위치이력·시각 데이터를 확인하시어 5일 이내 소명자료를 제출해 주시기 바랍니다.\n` +
        `※ 본 건은 자동 확정이 아니며, 소명 검토 후 담당자가 최종 판단합니다.`,
    }),
    approveLabel: '검토·승인 후 발송',
    approvedMsg: '✓ 소명요청 공문 발송 · 회신 대기',
  },
  {
    id: 'council-brief',
    owner: '대구시',
    icon: '🏛️',
    title: '시의회 답변 자료 자동 작성',
    autonomy: 'L2',
    autonomyLabel: 'L2 · 추천(담당자 확정)',
    steps: ['운행·안전·재정·민원 지표 집계', '전일·목표 대비 분석', '예상 질의 대응 논거 정리', '답변 자료 초안 작성'],
    ready: () => true,
    waitingMsg: '',
    summary: (s) =>
      `현재까지 운행 ${s.vehicles.length}대·탑승 ${s.passengers.toLocaleString()}명·절감률 ${s.kpi.fuelSavedPct.toFixed(1)}% 기준으로 답변 자료를 작성했습니다.`,
    document: (s) => ({
      title: '시내버스 운영 현황 — 시의회 답변 자료 (초안)',
      body:
        `[운행] ${simClock(s.simTime)} 기준 ${s.vehicles.length}대 운행, 총 ${s.kpi.totalDistanceKm.toFixed(1)}km, 결행 0건\n` +
        `[안전] 위험운전 ${s.kpi.totalEvents}건, 평균 안전점수 ${s.kpi.avgScore.toFixed(1)}점 (방어운전 정당판정 자동 제외 적용)\n` +
        `[재정] 에코드라이빙 코칭으로 연료 ${s.kpi.fuelSavedPct.toFixed(1)}% 절감 — 증액 없는 재정 효율화\n` +
        `[시민] 민원 ${s.complaints.length}건, 증빙 자동매칭으로 회신 근거 표준화\n\n` +
        `예상 질의: "재정지원금 절감 대책은?" → 데이터 기반 연료절감·정산 검증 체계 운영 중.`,
    }),
    approveLabel: '검토·수정 후 확정',
    approvedMsg: '✓ 답변 자료 확정 · 정책부서 공유',
  },
  {
    id: 'carbon-report',
    owner: '대구시',
    icon: '🌍',
    title: '탄소 감축 실적 보고서 작성',
    autonomy: 'L2',
    autonomyLabel: 'L2 · 추천(담당자 확정)',
    steps: ['차량별 연료 절감량 집계', 'CO₂ 환산', '전 차량 연간 추정', '실적 보고서 초안 작성'],
    ready: () => true,
    waitingMsg: '',
    summary: (s) => `현재 CO₂ 절감 ${s.kpi.totalCo2SavedKg.toFixed(1)}kg을 집계해 실적 보고서를 작성했습니다.`,
    document: (s) => ({
      title: '시내버스 탄소중립 감축 실적 (초안)',
      body:
        `[감축 방식] 에코드라이빙 코칭 기반 연료 절감 (전기버스 전환 외)\n` +
        `[현재 실적] 연료 절감률 ${s.kpi.fuelSavedPct.toFixed(1)}% · CO₂ 절감 ${s.kpi.totalCo2SavedKg.toFixed(1)}kg\n` +
        `[MRV] 측정·보고·검증 프로토콜로 실측 데이터 축적 중\n` +
        `[활용] 시 탄소중립 목표 실적 반영 + 향후 배출권 방법론 인증 검토\n` +
        `※ 배출권 수익은 방법론 검토단계로 보수적으로 표기.`,
    }),
    approveLabel: '검토·수정 후 확정',
    approvedMsg: '✓ 실적 보고서 확정 · 환경부서 제출',
  },
]

// 승인 완료 상태는 모듈 레벨로 유지 — 탭 전환(언마운트)에도, 시티/운수사 어느 쪽에서 봐도 보존
const doneStore = new Set<string>()

export function actionOwnerReadyCount(owner: ActionOwner, snap: SimSnapshot): number {
  return TASKS.filter((t) => t.owner === owner && t.ready(snap) && !doneStore.has(t.id)).length
}

/** 조치함 카드 목록 — owner로 고정 필터, 토글 없음(대구시/버스회사 각자 맥락에 이미 있음) */
export function ActionCenterList({ owner, snap }: { owner: ActionOwner; snap: SimSnapshot }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [, forceRender] = useState(0)
  const done = (id: string) => doneStore.has(id)
  const markDone = (id: string) => {
    doneStore.add(id)
    forceRender((v) => v + 1)
  }

  const tasks = TASKS.filter((t) => t.owner === owner)

  return (
    <div className="flex flex-col gap-2.5">
      {tasks.map((t) => {
        const isReady = t.ready(snap)
        const isDone = done(t.id)
        const isOpen = expanded === t.id
        const doc = isReady ? t.document(snap) : null
        return (
          <div
            key={t.id}
            className={`rounded-xl border bg-gray-900/60 ${
              isDone ? 'border-emerald-500/30' : isReady ? 'border-violet-500/25' : 'border-gray-800'
            }`}
          >
            <button
              onClick={() => isReady && setExpanded(isOpen ? null : t.id)}
              disabled={!isReady}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-xl">{t.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-100">
                  {t.title}
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">{t.autonomyLabel}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-gray-500">
                  {isDone ? t.approvedMsg : isReady ? t.summary(snap) : t.waitingMsg}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${
                  isDone
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : isReady
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'bg-gray-800 text-gray-600'
                }`}
              >
                {isDone ? '완료' : isReady ? '승인 대기' : '대기 중'}
              </span>
              {isReady && <span className="shrink-0 text-gray-600">{isOpen ? '▾' : '▸'}</span>}
            </button>

            {isOpen && doc && (
              <div className="border-t border-gray-800 px-4 py-3">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {t.steps.map((step, i) => (
                    <span key={step} className="flex items-center gap-1 rounded-full bg-gray-800/60 px-2 py-0.5 text-[10px] text-gray-400">
                      <span className="text-emerald-400">✓</span> {i + 1}. {step}
                    </span>
                  ))}
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                  <div className="mb-1.5 text-[11px] font-bold text-gray-300">📄 {doc.title}</div>
                  <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-gray-400">{doc.body}</pre>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-gray-600">
                    🤖 초안은 AI 생성 · 발송/확정은 담당자 승인 필수 ({t.autonomyLabel})
                  </span>
                  {isDone ? (
                    <span className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[11px] font-bold text-emerald-400">
                      {t.approvedMsg}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        t.onApprove?.(snap)
                        markDone(t.id)
                      }}
                      className="rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-500"
                    >
                      {t.approveLabel}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-[10px] leading-relaxed text-gray-600">
        ⚠ 데모: 규칙 기반 + 실데이터로 채운 문서예요. 실서비스에서는 LLM(초안 생성) + RAG(공문 양식·규정·이력 조회) + 실제
        시스템 연동으로 동작해요. 업무 종류에 따라 자동 실행 여부를 다르게 두며, 인사·평가·정산 확정처럼 불이익이 걸린
        결정은 자동화하지 않습니다.
      </div>
    </div>
  )
}
