import { useEffect, useRef, useState } from 'react'

/**
 * 라이브 AI 코파일럿 — 대통합 공통 오버레이.
 * 탄소 플랫폼 AI 에이전트 센터(dash A)의 코파일럿을 React로 이식.
 * - 추천 질문: 조회·분석 단계를 순차 공개 후 답변 (재현 가능한 고정 시나리오)
 * - 자유 입력: 사용자 본인 Anthropic 키(localStorage 전용) → 실제 Claude(claude-opus-4-8) 직접 호출
 *   키는 브라우저 localStorage에만 저장, api.anthropic.com으로만 전송, 저장소 커밋 금지.
 */

const QA = [
  {
    q: '이번 달 절감 목표 달성 가능해?',
    steps: ['DTG 주행·OBD 연료 데이터 조회 (7/1~7/11)', '베이스라인 대비 절감 페이스 분석', '잔여 20일 시나리오 시뮬레이션'],
    a: '가능해요. 목표 75t 중 11일까지 72.6t 페이스로 환산 달성률 102%예요. 리스크는 폭염 에어컨 부하(연료 +3%)인데, 공회전 코칭을 유지하면 상쇄 가능한 수준이에요.',
  },
  {
    q: '연비가 가장 많이 떨어진 차량은?',
    steps: ['412대 주간 연비 변화율 계산', '정비 이력·이상 패턴 교차 분석'],
    a: '세진 2044호예요. 2.51 → 1.93 km/L(-23%)로 인젝터 이상 패턴과 91% 일치해요. 정비 예약안을 운수사 관제에 올려 뒀어요 — 바로 승인할 수 있어요.',
  },
  {
    q: '간선 401을 전기로 전환하면?',
    steps: ['간선 401 노후 경유 6대 식별', '전환 시뮬레이션 (보조금·전력단가 반영)'],
    a: '노후 경유 6대 전환 시 연 214 tCO₂ 감축, 연료비 2.46억원 절감, 보조금 반영 회수 2.7년이에요. 🌱 탄소중립 분석 탭의 AI Planning에서 대수를 바꿔 가며 비교해 보세요.',
  },
  {
    q: '이번 달 성과, 경영진 보고용으로 요약해줘',
    steps: ['7월 실적 집계 (연료·CO₂·안전)', '운수사별 손익 효과 계산', '보고 문구 생성'],
    a: '7월(11일 기준) 연료 27,100L·CO₂ 72.6t 절감으로 목표 페이스 102%입니다. 안전점수 82.4점(+2.1)으로 위험 이벤트가 전 항목 감소했고, 1위 세운버스는 월 순 +1,175만원의 손익 개선을 확인했습니다.',
  },
  {
    q: 'V2G에 40대 참여하면 뭐가 좋아?',
    steps: ['전기 68대 차고지 대기 스케줄 검증 (DTG)', '심야 충전-피크 방전 차익 시뮬레이션'],
    a: '월 576만원(대당 14.4만원)의 신규 수익과 피크 시간 4.0MW의 계통 기여가 예상돼요. 운행과 충돌하지 않는 대기 시간만 쓰도록 검증했어요 — AI Planning의 V2G 시뮬레이터에서 대수를 조절해 보세요.',
  },
]

const SYSTEM_PROMPT =
  '너는 Qdrive(대구 시내버스 탄소중립 운영 플랫폼) 관제 센터의 운영 코파일럿이다. 아래 데모 데이터를 근거로 관제 관리자에게 한국어로 답한다.\n' +
  '[운영] 시내버스 412대(경유 272·CNG 72·전기 68), 5개 운수사, 기사 486명, 현재 운행 356대.\n' +
  '[7월 성과, 11일 기준] 연료 절감 27,100L, CO₂ 감축 72.6t(-4.7%), 연비 2.42→2.53km/L(+4.5%), 월 목표 75t 대비 페이스 102%, 연 누적 393.7t. 배출계수: 경유 2.68kgCO₂/L.\n' +
  '[안전] 평균 안전점수 82.4(+2.1), 안전점수↔연비 상관 r=0.81. 위험 차량: 세진 2044호 연비 2.51→1.93km/L(-23%), 인젝터 이상 확률 91%.\n' +
  '[전기 전환] AI가 효과순 선정, k번째 차량 연 감축 = 36.5-0.3k tCO₂. 대당 실투자 1.1억원(차량가 3.9억-보조금 2.8억). 6대 전환 = 연 214t, ROI 2.7년. KOC 크레딧 8,900원/t.\n' +
  '[운수사] 절감률 1위 세운버스(-5.8%), 월 순효과 +1,175만원(연료비 1,065만+예지정비 420만-인센티브 310만).\n' +
  '규칙: 2~4문장으로 간결하게, 수치 근거를 포함해 답하라. 위 데이터에 없는 내용은 데모 데이터 범위 밖이라고 정직하게 말하라. 수치를 지어내지 마라.'

type Msg =
  | { id: number; kind: 'canned'; qi: number; phase: number }
  | { id: number; kind: 'custom'; q: string; ans: string | null }

const KEY_LS = 'qdrive_api_key'

export default function Copilot() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [asked, setAsked] = useState<Set<number>>(new Set())
  const [hasKey, setHasKey] = useState(() => !!localStorage.getItem(KEY_LS))
  const [showKey, setShowKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const idRef = useRef(0)
  const timers = useRef<number[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => timers.current.forEach((t) => clearTimeout(t))
  }, [])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, open])

  const nextId = () => ++idRef.current

  // 추천 질문 — 단계 순차 공개
  const ask = (qi: number) => {
    if (asked.has(qi)) return
    setAsked((s) => new Set(s).add(qi))
    const id = nextId()
    setMsgs((m) => [...m, { id, kind: 'canned', qi, phase: 0 }])
    const steps = QA[qi].steps.length
    for (let p = 1; p <= steps + 1; p++) {
      const t = window.setTimeout(() => {
        setMsgs((m) => m.map((x) => (x.id === id && x.kind === 'canned' ? { ...x, phase: p } : x)))
      }, p * 750)
      timers.current.push(t)
    }
  }

  // 자유 입력 → 라이브(키 있음) 또는 데모 안내
  const send = () => {
    const q = input.trim()
    if (!q) return
    setInput('')
    if (localStorage.getItem(KEY_LS)) {
      askLive(q)
    } else {
      const id = nextId()
      setMsgs((m) => [
        ...m,
        {
          id,
          kind: 'custom',
          q,
          ans: "데모 모드에서는 추천 질문에 응답해요. 우측 상단 '라이브 연결'에 본인 Anthropic API 키를 넣으면 실제 Claude가 이 플랫폼의 운영 데이터를 근거로 어떤 질문에도 답해요.",
        },
      ])
    }
  }

  const askLive = async (q: string) => {
    const id = nextId()
    setMsgs((m) => [...m, { id, kind: 'custom', q, ans: null }])
    const setAns = (text: string) => setMsgs((m) => m.map((x) => (x.id === id && x.kind === 'custom' ? { ...x, ans: text } : x)))
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': localStorage.getItem(KEY_LS) || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: q }],
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 401) setAns("API 키가 유효하지 않아요 — '설정'에서 키를 다시 확인해 주세요.")
        else if (res.status === 429) setAns('요청이 많아 잠시 제한됐어요 — 잠시 후 다시 시도해 주세요.')
        else setAns('요청이 실패했어요: ' + (data?.error?.message ?? `HTTP ${res.status}`))
        return
      }
      if (data.stop_reason === 'refusal') {
        setAns('이 질문에는 답변할 수 없어요.')
        return
      }
      const text = (data.content || [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('\n')
        .trim()
      setAns(text || '응답이 비어 있어요 — 다시 시도해 주세요.')
    } catch {
      setAns('네트워크 오류가 발생했어요 — 인터넷 연결을 확인해 주세요.')
    }
  }

  const saveKey = () => {
    const k = keyDraft.trim()
    if (!k) return
    localStorage.setItem(KEY_LS, k)
    setHasKey(true)
    setShowKey(false)
    setKeyDraft('')
  }
  const clearKey = () => {
    localStorage.removeItem(KEY_LS)
    setHasKey(false)
    setShowKey(false)
    setKeyDraft('')
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-2xl transition hover:bg-sky-500"
          title="AI 코파일럿 열기"
        >
          <span className="text-lg">🤖</span> AI 코파일럿
          {hasKey && <span className="h-2 w-2 rounded-full bg-emerald-300" title="라이브 연결됨" />}
        </button>
      )}

      {/* 패널 */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[560px] max-h-[85vh] w-[400px] max-w-[92vw] flex-col rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <div>
                <div className="text-sm font-bold text-gray-100">AI 운영 코파일럿</div>
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                  {hasKey ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 라이브 · claude-opus-4-8
                    </>
                  ) : (
                    '데모 모드 · 추천 질문 응답'
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowKey((s) => !s)}
                className="rounded-md border border-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:text-gray-100"
              >
                {hasKey ? '설정' : '라이브 연결'}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-gray-500 hover:text-gray-200" title="닫기">
                ✕
              </button>
            </div>
          </div>

          {/* API 키 패널 */}
          {showKey && (
            <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-3">
              <div className="text-[11px] leading-relaxed text-gray-400">
                Anthropic API 키를 연결하면 자유 질문에 실제 Claude가 이 플랫폼의 운영 데이터를 근거로 답해요.
                <br />
                <b className="text-gray-300">키는 이 브라우저의 localStorage에만 저장</b>되고, Anthropic API로만 전송돼요.
              </div>
              <div className="mt-2 flex gap-1.5">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="sk-ant-..."
                  className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:border-sky-500"
                />
                <button onClick={saveKey} className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500">
                  저장
                </button>
                {hasKey && (
                  <button onClick={clearKey} className="rounded-md border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200">
                    해제
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 대화 로그 */}
          <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="mt-6 text-center text-[12px] leading-relaxed text-gray-600">
                운영 데이터를 근거로 답하는 코파일럿이에요.
                <br />
                아래 추천 질문을 눌러보거나 직접 물어보세요.
              </div>
            )}
            {msgs.map((m) =>
              m.kind === 'canned' ? <CannedMsg key={m.id} qi={m.qi} phase={m.phase} /> : <CustomMsg key={m.id} q={m.q} ans={m.ans} />,
            )}
          </div>

          {/* 추천 질문 칩 */}
          <div className="flex flex-wrap gap-1.5 border-t border-gray-800 px-3 py-2">
            {QA.map((qa, i) => (
              <button
                key={i}
                onClick={() => ask(i)}
                disabled={asked.has(i)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  asked.has(i)
                    ? 'cursor-default border-gray-800 text-gray-600'
                    : 'border-sky-600/40 bg-sky-600/10 text-sky-300 hover:bg-sky-600/20'
                }`}
              >
                {qa.q}
              </button>
            ))}
          </div>

          {/* 입력 */}
          <div className="flex gap-1.5 border-t border-gray-800 px-3 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={hasKey ? '무엇이든 물어보세요…' : '라이브 연결 시 자유 질문 가능'}
              className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 outline-none focus:border-sky-500"
            />
            <button onClick={send} className="rounded-md bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500">
              전송
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function CannedMsg({ qi, phase }: { qi: number; phase: number }) {
  const qa = QA[qi]
  return (
    <div className="space-y-2">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-sky-600/20 px-3 py-2 text-xs text-sky-100">{qa.q}</div>
      <div className="w-fit max-w-[90%] space-y-1.5 rounded-2xl rounded-tl-sm bg-gray-800/70 px-3 py-2.5">
        {qa.steps.map((s, j) => {
          const done = phase > j + 1
          const active = phase === j + 1
          if (phase < j + 1) return null
          return (
            <div key={j} className={`flex items-center gap-1.5 text-[11px] ${done ? 'text-gray-500' : 'text-sky-300'}`}>
              <span className={active ? 'animate-pulse' : ''}>{done ? '✓' : '⟳'}</span>
              {s}
            </div>
          )
        })}
        {phase > qa.steps.length && <div className="pt-0.5 text-xs leading-relaxed text-gray-200">{qa.a}</div>}
      </div>
    </div>
  )
}

function CustomMsg({ q, ans }: { q: string; ans: string | null }) {
  return (
    <div className="space-y-2">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-sky-600/20 px-3 py-2 text-xs text-sky-100">{q}</div>
      <div className="w-fit max-w-[90%] rounded-2xl rounded-tl-sm bg-gray-800/70 px-3 py-2.5 text-xs leading-relaxed text-gray-200">
        {ans === null ? (
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> Claude가 운영 데이터를 검토하는 중…
          </span>
        ) : (
          ans
        )}
      </div>
    </div>
  )
}
