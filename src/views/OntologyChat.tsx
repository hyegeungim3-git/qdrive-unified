/**
 * 💬 AI Q — 제안서 「맥락이 붙으면 비로소 답할 수 있는 질문」 4종에 실제로 답하는 화면.
 *
 * **LLM이 온톨로지로 만들어지는 것은 아니다.** 모델은 이미 학습된 범용 Claude이고,
 * 온톨로지는 그 답에 **근거를 대는 데이터 구조**다. 아래 4개 질문은 애초에 LLM을 거치지 않고
 * 엔진에서 계산한다 — 그래서 네트워크가 끊겨도 답이 나온다.
 *
 * UI는 실제 AI 채팅 서비스의 문법을 따른다: 사이드바 · 사고 단계 표시 · 타이핑 스트리밍 ·
 * 출처 각주 · 접히는 근거 · 복사. 다만 **꾸밈이 아니라 신뢰 장치**로 쓴다 —
 * 사고 단계는 실제로 거친 단계이고, 출처 칩은 데이터 관리자 ①수집의 원천 코드와 같은 문자열이다.
 *
 * 색 규칙 — **파랑은 배경을 칠하지 않는다.**
 *  · 질문(사용자): 오른쪽 정렬 + 채운 중성 표면(gray-800). 답변과 갈리는 축은 색이 아니라 정렬·채움이다.
 *  · 답변: 중성 카드 + **왼쪽 액센트 선 하나**. 카드를 통째로 물들이면 위계가 사라진다.
 *  · sky는 셋에만 — ①선택된 상태 ②누를 수 있는 것 ③아바타. 그래서 파란 것이 곧 «행동»이다.
 *
 * 브랜드 sky는 로고 Q**drive**의 그 색이다. 이전 판은 말풍선을 `text-violet-100`으로 뒀는데
 * `index.css`의 html.light가 violet은 200~400만 반전하고 **100은 반전하지 않아** 라이트 모드에서
 * 흰 배경에 흰 글씨가 됐다. sky는 100~400이 모두 반전되므로 같은 사고가 나지 않는다.
 * **액센트 색을 고를 때는 그 번호대에 라이트 오버라이드가 있는지부터 확인할 것.**
 */
import { useEffect, useRef, useState } from 'react'
import { useSim } from '../sim/store'
import { focusMap } from '../sim/mapFocus'
import { QA_TOPICS, UNANSWERABLE, answerQuestion, runTopic, type QaResult, type QaSource, type QaTopic } from '../sim/ontologyQa'
import { setOperatorSubtabIntent } from '../sim/navIntent'
import type { SimSnapshot } from '../sim/types'

const KEY_LS = 'qdrive-anthropic-key'

/** 사고 단계 — 실제로 거치는 순서다. 마지막 단계만 남기지 않고 전부 보여 준다 */
const STEPS = ['질문 해석', '온톨로지 순회', '원천 데이터 집계', '답 작성'] as const

type Msg =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'thinking'; step: number }
  | { id: number; role: 'qa'; res: QaResult }
  | { id: number; role: 'live'; text: string }
  | { id: number; role: 'none' }

let seq = 1

/**
 * 대화는 컴포넌트 밖에 둔다 — 답 안의 «로드맵으로 가기» 같은 링크를 누르면 탭이 바뀌면서
 * 이 화면이 언마운트되는데, 그때 오간 질문·답이 사라지면 근거를 확인하러 갔다 온 대가가 대화 손실이 된다.
 * 「새 대화」를 눌렀을 때만 비운다.
 */
let kept: Msg[] = []

/** 라이브 Claude에 넘길 현재 운영 상태 — 엔진이 진짜 근거다 */
function buildSystem(s: SimSnapshot): string {
  const dh = s.deadheads.reduce((a, t) => a + t.distanceKm, 0)
  const rev = s.trips.reduce((a, t) => a + t.distanceKm, 0)
  return [
    '당신은 대구 시내버스 통합 운영 플랫폼 Qdrive의 온톨로지 질의 도우미입니다.',
    '아래는 지금 이 순간 시뮬레이터 엔진의 실제 집계값입니다. 이 범위 밖의 수치는 지어내지 말고,',
    '모르면 "이번 실증 범위 밖입니다"라고 한 문장으로 짧게 말하고 넘어가세요. 답은 3~5문장 한국어로 간결하게.',
    '',
    `- 운행 중 차량 ${s.vehicles.length}대 · 누적 주행 ${s.kpi.totalDistanceKm.toFixed(1)}km`,
    `- 영업 운행 ${s.trips.length}회(${rev.toFixed(1)}km) / 공차 운행 ${s.deadheads.length}회(${dh.toFixed(1)}km)`,
    `- 위험운전 누적 ${s.kpi.totalEvents}건 · 평균 안전점수 ${s.kpi.avgScore.toFixed(1)}점`,
    `- 연료 절감률 ${s.kpi.fuelSavedPct.toFixed(2)}% · CO₂ 절감 ${s.kpi.totalCo2SavedKg.toFixed(1)}kg`,
    `- 현재 날씨 ${s.weather.condition}`,
    '- 연결된 1차 데이터: DTG(운행기록계)·OBD/CAN(자가진단)·RTK(정밀위치)·BIS(공개 API)·차고지 출입고',
    '- 이번 실증 범위 밖(수치를 지어내지 말 것): 교통카드 정산(AFC)·승객계수(APC)·신호(ITS)·영상(DVR)',
  ].join('\n')
}

export default function OntologyChat({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const snap = useSim()
  const snapRef = useRef(snap)
  snapRef.current = snap

  // 답이 오는 중에 탭을 떠났다면 그 «생각 중» 거품은 영영 끝나지 않는다 — 복원할 때 버린다
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const live = kept.filter((m) => m.role !== 'thinking')
    // 복원본이 이미 쓴 번호 뒤에서 이어 붙인다 — 번호가 겹치면 «이 답만» 내보내기가 남의 답까지 집는다
    live.forEach((m) => {
      if (m.id >= seq) seq = m.id + 1
    })
    return live
  })
  const msgsRef = useRef(msgs)
  msgsRef.current = msgs
  kept = msgs

  /** 답 한 건만 보고서로 — «이 답만 첨부하겠다»가 실제 업무에서 더 잦다 */
  const exportOne = (id: number) => openReport(buildReportHtml(collectItems(msgsRef.current, id), snapRef.current))
  const answered = msgs.filter((m) => m.role === 'qa').length

  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasKey, setHasKey] = useState(() => !!localStorage.getItem(KEY_LS))
  const [showKey, setShowKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  /** 타이핑 스트리밍 — 계산이 끝난 답을 흘려보낸다(지어내는 게 아니라 «표시»만 점진적) */
  const [stream, setStream] = useState<{ id: number; n: number } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, stream?.n])

  /* 스트리밍 — id가 바뀔 때만 타이머를 새로 건다. 엔진이 250ms마다 리렌더해도 끊기지 않게 */
  useEffect(() => {
    if (!stream) return
    const id = stream.id
    const m = msgsRef.current.find((x) => x.id === id)
    const full = m?.role === 'qa' ? m.res.detail : m?.role === 'live' ? m.text : ''
    if (!full) return
    const t = window.setInterval(() => {
      setStream((s) => {
        if (!s || s.id !== id) return s
        const next = s.n + 4
        return next >= full.length ? null : { id, n: next }
      })
    }, 16)
    return () => window.clearInterval(t)
  }, [stream?.id])

  const push = (m: Msg) => setMsgs((prev) => [...prev, m])

  const ask = async (q: string, targetId?: string, topicId?: string) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    push({ id: seq++, role: 'user', text })

    const thinkId = seq++
    push({ id: thinkId, role: 'thinking', step: 0 })
    for (let i = 1; i < STEPS.length; i++) {
      await wait(140)
      setMsgs((prev) => prev.map((m) => (m.id === thinkId && m.role === 'thinking' ? { ...m, step: i } : m)))
    }
    await wait(160)

    const res = topicId ? runTopic(snapRef.current, topicId, targetId) : answerQuestion(snapRef.current, text, targetId)
    if (res) {
      const id = seq++
      setMsgs((prev) => [...prev.filter((m) => m.id !== thinkId), { id, role: 'qa', res }])
      setStream({ id, n: 0 })
      setBusy(false)
      return
    }
    if (!hasKey) {
      setMsgs((prev) => [...prev.filter((m) => m.id !== thinkId), { id: seq++, role: 'none' }])
      setBusy(false)
      return
    }
    const answer = await askClaude(text, snapRef.current)
    const id = seq++
    setMsgs((prev) => [...prev.filter((m) => m.id !== thinkId), { id, role: 'live', text: answer }])
    setStream({ id, n: 0 })
    setBusy(false)
  }

  const saveKey = () => {
    const k = keyDraft.trim()
    if (!k) return
    localStorage.setItem(KEY_LS, k)
    setHasKey(true)
    setShowKey(false)
    setKeyDraft('')
  }

  return (
    <div className="flex h-full gap-3 max-[900px]:flex-col">
      {/* ── 사이드바 ── */}
      <aside className="flex w-[240px] shrink-0 flex-col gap-2 max-[900px]:w-full">
        <button
          onClick={() => {
            setMsgs([])
            setStream(null)
          }}
          className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5 text-left text-[12.5px] font-bold text-gray-200 transition-colors hover:border-sky-500/50 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span className="text-sky-400">＋</span> 새 대화
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-2 max-[900px]:max-h-[168px]">
          <div className="px-1 pb-1.5 text-[10.5px] font-bold tracking-wider text-gray-400">맥락이 있어야 답하는 질문</div>
          <div className="space-y-2">
            {QA_TOPICS.map((t) => (
              <TopicCard key={t.id} topic={t} snap={snap} busy={busy} onAsk={ask} />
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowKey((v) => !v)}
          className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-[11px] font-semibold text-sky-300 transition-colors hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span>자유 질문 (선택)</span>
          <span className={hasKey ? 'text-emerald-400' : 'text-gray-500'}>{hasKey ? '● 연결됨' : '설정'}</span>
        </button>
      </aside>

      {/* ── 대화 ── */}
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-gray-800 bg-gray-900">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Avatar />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-gray-100">Qdrive AI</div>
              <div className="text-[10.5px] text-gray-400">온톨로지 근거 질의 · 답은 엔진에서 계산</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md border border-gray-800 bg-gray-950 px-2 py-0.5 text-[10.5px] font-bold text-gray-400">
              1차 데이터 8종 연결됨
            </span>
            <button
              onClick={() => openReport(buildReportHtml(collectItems(msgsRef.current), snapRef.current))}
              disabled={answered === 0}
              title="지금까지의 질문과 답 전체를 인쇄용 보고서로 엽니다 — 새 탭에서 인쇄·PDF 저장"
              className="rounded-md border border-sky-500/40 px-2 py-0.5 text-[10.5px] font-bold text-sky-300 transition-colors hover:bg-sky-500/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              📄 전체 보고서 ({answered})
            </button>
            <button
              onClick={() => downloadMd(buildReport(collectItems(msgsRef.current), snapRef.current), 'qdrive-질의응답-기록.md')}
              disabled={answered === 0}
              title="텍스트(.md) 파일로 저장 — 한글·메일에 붙여 쓸 때"
              className="rounded-md border border-gray-800 bg-gray-950 px-2 py-0.5 text-[10.5px] font-bold text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              ⤓ 텍스트
            </button>
          </div>
        </header>

        {showKey && (
          <div className="border-b border-gray-800 bg-gray-900 px-4 py-3">
            <div className="break-keep text-[11.5px] leading-relaxed text-gray-400">
              왼쪽 <b className="text-gray-300">네 질문은 키 없이 동작합니다</b> — 엔진에서 직접 계산하기 때문입니다. Anthropic API 키를 연결하면 그
              밖의 자유 질문에도 실시간 운영 데이터를 근거로 답합니다. <b className="text-gray-300">키는 이 브라우저에만 저장</b>됩니다.
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-ant-..."
                className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:border-sky-500"
              />
              <button onClick={saveKey} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-500">
                저장
              </button>
              {hasKey && (
                <button
                  onClick={() => {
                    localStorage.removeItem(KEY_LS)
                    setHasKey(false)
                  }}
                  className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-200"
                >
                  해제
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {msgs.length === 0 ? (
            <Welcome onPick={ask} busy={busy} />
          ) : (
            msgs.map((m) => (
              <MsgView key={m.id} m={m} stream={stream} onNavigate={onNavigate} onAsk={ask} onExport={exportOne} />
            ))
          )}
          <div ref={endRef} />
        </div>

        {/* ── 입력 ── */}
        <div className="border-t border-gray-800 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 transition-colors focus-within:border-sky-500">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(input)}
              placeholder="운행·공차·차고지·감축에 대해 물어보세요"
              className="min-w-0 flex-1 bg-transparent py-1 text-[12.5px] text-gray-100 outline-none placeholder:text-gray-500"
            />
            <button
              onClick={() => ask(input)}
              disabled={busy || !input.trim()}
              title={busy ? '답을 만드는 중입니다' : !input.trim() ? '질문을 입력하세요' : '보내기'}
              className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '…' : '↑'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ═══════════ 질문 카드 — 대상을 고른 뒤 묻는다 ═══════════ */

/**
 * «이 주행»이 아니라 «6690호 3회차»를 묻게 만드는 자리.
 * 대상을 안 고르면 최근 것으로 답하되, 고른 대상은 질문 문장과 답의 subject에 그대로 박힌다.
 */
function TopicCard({ topic, snap, busy, onAsk }: { topic: QaTopic; snap: SimSnapshot; busy: boolean; onAsk: (q: string, id?: string) => void }) {
  const list = topic.targets ? topic.targets(snap) : []
  const [sel, setSel] = useState<string>('')
  const target = list.find((x) => x.id === sel)
  const q = target && topic.qOf ? topic.qOf(target) : topic.q
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-2">
      <div className="break-keep text-[11.5px] font-semibold leading-snug text-gray-300">{topic.q}</div>
      <div className="mt-0.5 text-[10px] text-sky-300">{topic.tag}</div>
      {list.length > 0 && (
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-gray-700 bg-gray-900 px-1.5 py-1 text-[10.5px] text-gray-200 outline-none focus:border-sky-500"
        >
          <option value="">대상 선택 (기본: 최근)</option>
          {list.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}{t.sub ? ` — ${t.sub}` : ''}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={() => onAsk(q, sel || undefined)}
        disabled={busy}
        className="mt-1.5 w-full rounded-md border border-sky-500/40 px-2 py-1 text-[10.5px] font-bold text-sky-300 transition-colors hover:bg-sky-500/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        묻기
      </button>
    </div>
  )
}

/* ═══════════ 빈 상태 ═══════════ */

function Welcome({ onPick, busy }: { onPick: (q: string) => void; busy: boolean }) {
  return (
    <div className="mx-auto max-w-2xl py-6 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-sky-300 text-lg">💬</div>
      <h3 className="text-[15px] font-semibold text-gray-100">무엇을 물어볼까요?</h3>
      <div className="mt-4 grid grid-cols-2 gap-2 text-left max-[620px]:grid-cols-1">
        {QA_TOPICS.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.q)}
            disabled={busy}
            className="rounded-xl border border-gray-800 bg-gray-900 px-3.5 py-3 transition-colors hover:border-sky-500/50 hover:bg-sky-500/5 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <div className="text-[10px] font-bold text-sky-400">{t.tag}</div>
            <div className="mt-1 break-keep text-[12.5px] font-semibold leading-snug text-gray-200">{t.q}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══════════ 메시지 ═══════════ */

function MsgView({
  m,
  stream,
  onNavigate,
  onAsk,
  onExport,
}: {
  m: Msg
  stream: { id: number; n: number } | null
  onNavigate?: (tab: string) => void
  onAsk?: (q: string, target?: string, topic?: string) => void
  onExport?: (id: number) => void
}) {
  const [openRec, setOpenRec] = useState(false)
  const [openEvidence, setOpenEvidence] = useState(false)
  /* 교차검증은 «물어보면 보여 주는» 것으로 둔다 — 답마다 늘 펼쳐 두면 정작 답이 밀린다 */
  const [openCross, setOpenCross] = useState(false)
  const [openSrc, setOpenSrc] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (m.role === 'user')
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] break-keep rounded-2xl rounded-tr-sm bg-gray-800 px-3.5 py-2 text-[12.5px] leading-relaxed text-gray-100">{m.text}</div>
      </div>
    )

  if (m.role === 'thinking')
    return (
      <Row>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-3.5 py-2.5">
          <div className="space-y-1">
            {STEPS.map((s, i) => (
              <div key={s} className={`flex items-center gap-2 text-[11.5px] ${i <= m.step ? 'text-gray-300' : 'text-gray-600'}`}>
                <span className={i < m.step ? 'text-emerald-400' : i === m.step ? 'animate-pulse text-sky-400' : 'text-gray-700'}>
                  {i < m.step ? '✓' : '●'}
                </span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </Row>
    )

  if (m.role === 'none')
    return (
      <Row>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
          <div className="text-[12.5px] font-bold text-sky-300">{UNANSWERABLE.headline}</div>
          <div className="mt-1 break-keep text-[11.5px] leading-relaxed text-gray-400">{UNANSWERABLE.detail}</div>
        </div>
      </Row>
    )

  if (m.role === 'live') {
    const shown = stream?.id === m.id ? m.text.slice(0, stream.n) : m.text
    return (
      <Row>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-3.5 py-2.5">
          <div className="break-keep whitespace-pre-wrap text-[12.5px] leading-relaxed text-gray-200">
            {shown}
            {stream?.id === m.id && <Caret />}
          </div>
          <div className="mt-2 text-[10.5px] text-amber-400/90">
            ⚠ 이 답은 라이브 AI가 <b>설명</b>한 것입니다 — 왼쪽 네 질문처럼 엔진에서 계산한 값이 아닙니다.
          </div>
        </div>
      </Row>
    )
  }

  const r = m.res
  const detail = (stream?.id === m.id ? r.detail.slice(0, stream.n) : r.detail).replace(/\*\*/g, '')
  /* 타이핑 연출은 «표시»일 뿐이다. 스트림 상태가 어떤 이유로든 안 풀리면 근거·출처가 통째로
     사라지므로, done으로 가리지 않고 항상 렌더한다 — 커서만 스트리밍 중에 보인다. */
  const typing = stream?.id === m.id

  return (
    <Row>
      <div className="min-w-0 space-y-2">
        {/* 답 */}
        <div className={`rounded-xl border border-l-2 bg-gray-900 px-3.5 py-3 ${r.empty ? 'border-gray-800 border-l-gray-700' : 'border-gray-800 border-l-sky-500'}`}>
          {r.subject && (
            <div className="mb-1.5 inline-block rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
              대상 · {r.subject}
            </div>
          )}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="break-keep text-[13.5px] font-bold leading-snug text-gray-50">{r.headline}</span>
            {r.confidence && (
              <span
                title={r.confidence.why}
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                  r.confidence.level === '실측 기반'
                    ? 'border-emerald-500/40 text-emerald-300'
                    : 'border-sky-500/40 text-sky-300'
                }`}
              >
                {r.confidence.level} · 신뢰도 {r.confidence.pct}%
              </span>
            )}
          </div>
          {r.basis && (
            <div className="mt-1 text-[10.5px] text-gray-400">
              집계 구간 {r.basis.window} · 표본 {r.basis.records}
            </div>
          )}
          <div className="mt-1.5 break-keep text-[12.5px] leading-relaxed text-gray-300">
            {detail}
            {typing && <Caret />}
          </div>

          {r.sections.length > 0 && (
            <div className="mt-3 space-y-2.5 border-t border-gray-800 pt-2.5">
              {r.sections.map((sec, si) => (
                <div key={si}>
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="text-[11px] font-bold text-gray-100">{sec.h}</span>
                    {sec.src?.map((code) => {
                      const n = r.sources.findIndex((x) => x.code === code)
                      if (n < 0) return null
                      return (
                        <button
                          key={code}
                          onClick={() => setOpenSrc(openSrc === code ? null : code)}
                          title={`출처 ${code} — 눌러서 확인`}
                          className={`rounded px-1 text-[9.5px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                            openSrc === code ? 'bg-sky-500/20 text-sky-200' : 'text-sky-300 hover:bg-sky-500/10'
                          }`}
                        >
                          [{n + 1}]
                        </button>
                      )
                    })}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {sec.items.map((it, ii) => (
                      <li key={ii} className="flex gap-1.5 break-keep text-[12px] leading-relaxed text-gray-300">
                        <span className="mt-[1px] shrink-0 text-gray-600">·</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 교차검증 본문은 아래 액션의 「교차검증 N건 보기」로 펼친다 — 근거·원본 기록과 같은 자리 */}

        {/* 「이 답이 말할 수 없는 것」 절은 사용자 요청으로 미표시.
            데이터(QaResult.limits)와 unlock→로드맵 딥링크는 엔진에 그대로 남아 있어 되살리면 바로 뜬다 */}

        {r.follow.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-gray-400">이어서</span>
            {r.follow.map((f, i) => (
              <button
                key={i}
                onClick={() => onAsk?.(f.q, f.target, f.topic)}
                className="rounded-full border border-sky-500/40 px-2.5 py-1 text-[10.5px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {f.q} →
              </button>
            ))}
          </div>
        )}

        {(
          <>
            {/* 출처 — 이 답이 어느 원천을 썼나 */}
            <div>
              <div className="mb-1 text-[10.5px] font-bold tracking-wider text-gray-400">출처</div>
              <div className="flex flex-wrap gap-1.5">
                {r.sources.map((s, i) => (
                  <button
                    key={s.code}
                    onClick={() => setOpenSrc(openSrc === s.code ? null : s.code)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      openSrc === s.code ? 'border-sky-500/50 bg-sky-500/10 text-sky-200' : 'border-gray-800 bg-gray-950 text-gray-300 hover:border-gray-700 hover:text-gray-100'
                    }`}
                  >
                    <span className="text-sky-300">[{i + 1}]</span>
                    <span>{s.code}</span>
                    <span className={s.live ? 'text-emerald-400' : 'text-sky-400'} title={s.live ? '엔진 실집계' : '운수사 기준정보 값'}>
                      ●
                    </span>
                  </button>
                ))}
              </div>
              {openSrc && <SourceCard s={r.sources.find((x) => x.code === openSrc)!} onNavigate={onNavigate} />}
            </div>

            {/* 액션 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Action
                onClick={() => setOpenEvidence((v) => !v)}
                label={openEvidence ? '근거 접기' : `근거 ${r.evidence.length}항목 보기`}
              />
              {r.cross && r.cross.length > 0 && (
                <Action
                  onClick={() => setOpenCross((v) => !v)}
                  label={openCross ? '교차검증 접기' : `교차검증 ${r.cross.length}건 보기`}
                />
              )}
              {r.record && <Action onClick={() => setOpenRec((v) => !v)} label={openRec ? '원본 접기' : '원본 기록'} />}
              <Action
                onClick={async () => {
                  const txt = [r.headline, r.detail.replace(/\*\*/g, ''), '', ...r.evidence.map((e) => `${e.k}: ${e.v}${e.src ? ` [${e.src}]` : ''}`)].join('\n')
                  await navigator.clipboard?.writeText(txt).catch(() => {})
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1600)
                }}
                label={copied ? '복사됨 ✓' : '복사'}
              />
              <Action onClick={() => onExport?.(m.id)} label="📄 이 답만" />
              {/* 답이 «어디»를 말할 때만 — 지도로 건너가 그 지점을 찍는다. 말로 설명하던 구간이 사라진다 */}
              {r.focus && (
                <Action
                  onClick={() => {
                    focusMap(r.focus!.lat, r.focus!.lng, r.focus!.label)
                    onNavigate?.('city')
                  }}
                  label="🗺 지도에서 보기"
                />
              )}
            </div>

            {openRec && r.record && (
              <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
                <div className="mb-1 text-[11px] font-bold text-gray-200">{r.record.title}</div>
                <table className="w-full text-left text-[11px]">
                  <tbody>
                    {r.record.fields.map((f, i) => (
                      <tr key={i} className="border-b border-gray-800/50 last:border-0">
                        <td className="w-[42%] py-1 pr-2 font-mono text-[10.5px] text-gray-400">{f.k}</td>
                        <td className="py-1 break-keep font-semibold text-gray-200">{f.v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {openCross && r.cross && r.cross.length > 0 && (
              <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
                <div className="text-[10.5px] font-bold text-gray-100">교차검증 — 서로 다른 원천이 같은 사실을 말하는가</div>
                <ul className="mt-1 space-y-1">
                  {r.cross.map((c, i) => (
                    <li key={i} className="break-keep text-[11.5px] leading-relaxed">
                      <span className={c.ok ? 'text-emerald-300' : 'text-amber-300'}>{c.ok ? '✓' : '⚠'}</span>{' '}
                      <span className="text-gray-400">
                        {c.a} × {c.b}
                      </span>
                      <span className="text-gray-500"> — {c.what}</span>
                      <div className="pl-4 text-gray-200">{c.result}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {openEvidence && (
              <div className="space-y-2">
                {r.walk && (
                  <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span className="text-[10.5px] font-bold tracking-wider text-gray-400">기록을 따라간 경로</span>
                      <span className="text-[10px] text-gray-500">
                        {r.walk.startLabel}에서 출발 · 기록 {r.walk.nodes}건 ({r.walk.classes.join(' · ')})
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {r.walk.trail.map((t, i) => (
                        <li key={i} className="break-keep font-mono text-[10.5px] leading-relaxed text-gray-300">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10.5px] font-bold tracking-wider text-gray-400">문법상 사슬</span>
                  {r.path.map((p, i) => (
                    <span key={i} className="rounded border border-gray-800 bg-gray-950 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-300">
                      {p}
                    </span>
                  ))}
                </div>
                {r.evidence.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5">
                    <table className="w-full text-left text-[11.5px]">
                      <tbody>
                        {r.evidence.map((e, i) => (
                          <tr key={i} className="border-b border-gray-800/50 last:border-0">
                            <td className="w-[38%] py-1.5 pr-3 break-keep align-top text-gray-500">{e.k}</td>
                            <td className="py-1.5 break-keep font-semibold text-gray-200">
                              {e.v}
                              {e.src && <span className="ml-1.5 whitespace-nowrap text-[10px] font-normal text-sky-400">[{e.src}]</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.caveat && <div className="break-keep text-[11px] leading-relaxed text-gray-400">※ {r.caveat}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </Row>
  )
}

function SourceCard({ s, onNavigate }: { s: QaSource; onNavigate?: (tab: string) => void }) {
  return (
    <div className="mt-1.5 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[12px] font-bold text-gray-100">{s.code}</span>
        <span className="text-[11px] text-gray-400">{s.name}</span>
        <span className={`ml-auto text-[10px] font-bold ${s.live ? 'text-emerald-300' : 'text-amber-300'}`}>
          {s.live ? '엔진 실집계' : '운수사 기준정보'}
        </span>
      </div>
      <div className="mt-1 grid gap-0.5 text-[11px]">
        <div className="flex gap-2">
          <span className="w-[52px] shrink-0 text-gray-500">보유 주체</span>
          <span className="break-keep text-gray-300">{s.owner}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-[52px] shrink-0 text-gray-500">기여</span>
          <span className="break-keep text-gray-300">{s.role}</span>
        </div>
      </div>
      {s.see && (
        <button
          onClick={() => {
            if (s.see?.sub) setOperatorSubtabIntent(s.see.sub)
            onNavigate?.(s.see!.tab)
          }}
          className="mt-1.5 w-full rounded-md border border-sky-500/40 px-2 py-1 text-[10.5px] font-bold text-sky-300 transition-colors hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          원본 확인 → {s.see.label}
        </button>
      )}
    </div>
  )
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2.5">
    <Avatar />
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

const Avatar = () => <span className="mt-0.5 h-6 w-6 shrink-0 rounded-lg bg-gradient-to-tr from-sky-500 to-sky-300" />

const Caret = () => <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-sky-400 align-middle" />

const Action = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className="rounded-lg border border-gray-800 bg-gray-950 px-2 py-1 text-[10.5px] font-semibold text-gray-300 transition-colors hover:border-gray-700 hover:text-gray-100 focus-visible:ring-2 focus-visible:ring-sky-500"
  >
    {label}
  </button>
)

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/**
 * 대화를 제출용 문서로. 채팅은 물어본 사람만 보지만 업무는 «문서로 주세요»에서 끝난다.
 * 답에 붙은 신뢰 장치(신뢰도·집계구간·교차검증·한계·출처)를 문서에도 그대로 싣는다 —
 * 화면에서만 보이고 문서에서 사라지면 그 장치는 장식이다.
 */
type ReportItem = { q: string; res: QaResult }

/** 대화에서 «질문 ─ 답» 짝만 골라낸다. 질문은 사용자가 실제로 누른 문장을 쓴다 */
function collectItems(msgs: Msg[], onlyId?: number): ReportItem[] {
  const out: ReportItem[] = []
  msgs.forEach((m, i) => {
    if (m.role !== 'qa') return
    if (onlyId !== undefined && m.id !== onlyId) return
    const prev = [...msgs.slice(0, i)].reverse().find((x) => x.role === 'user') as { text: string } | undefined
    out.push({ q: prev?.text ?? m.res.q, res: m.res })
  })
  return out
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** 답 본문의 **강조**만 살린다 — 그 외 마크업은 쓰지 않는다 */
const bold = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

/** 문서 머리말 — 언제·무엇을 기준으로 뽑았는지가 첫 줄에 있어야 제출물이 된다 */
function reportMeta(snap: SimSnapshot) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    elapsed: `${Math.floor(snap.simTime / 60)}분 ${pad(Math.floor(snap.simTime % 60))}초`,
    scope: `실증 ${snap.vehicles.length}대 · 영업 ${snap.trips.length}회 · 공차 ${snap.deadheads.length}회`,
  }
}

/**
 * 인쇄용 보고서(HTML). 텍스트로만 흐르던 근거를 «표»로 되돌린다 —
 * 근거 수치·교차검증·원본 기록은 줄글로 읽는 것이 아니라 눈으로 대조하는 것이라서다.
 * 화면 색을 그대로 쓰지 않고 인쇄 기준(흰 종이·검은 글)으로 다시 짠다.
 */
function buildReportHtml(items: ReportItem[], snap: SimSnapshot): string {
  const m = reportMeta(snap)
  const body = items
    .map((it, n) => {
      const r = it.res
      const sec = r.sections
        .map(
          (x) => `<h3>${esc(x.h)}${x.src?.length ? `<span class="src">출처 ${esc(x.src.join(', '))}</span>` : ''}</h3>
        <ul>${x.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
        )
        .join('')
      const ev = r.evidence.length
        ? `<h3>근거 수치</h3><table><thead><tr><th>항목</th><th>값</th><th>출처</th></tr></thead><tbody>${r.evidence
            .map((e) => `<tr><td>${esc(e.k)}</td><td class="num">${esc(e.v)}</td><td class="src-cell">${esc(e.src ?? '—')}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
      const cross = r.cross?.length
        ? `<h3>교차검증 — 서로 다른 원천이 같은 사실을 말하는가</h3><table><thead><tr><th>원천 A</th><th>원천 B</th><th>확인한 것</th><th>결과</th><th>판정</th></tr></thead><tbody>${r.cross
            .map(
              (c) =>
                `<tr><td>${esc(c.a)}</td><td>${esc(c.b)}</td><td>${esc(c.what)}</td><td>${esc(c.result)}</td><td class="${c.ok ? 'ok' : 'warn'}">${c.ok ? '통과' : '주의'}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : ''
      const rec = r.record
        ? `<h3>원본 기록 — ${esc(r.record.title)}</h3><table class="rec"><tbody>${r.record.fields
            .map((f) => `<tr><th>${esc(f.k)}</th><td>${esc(f.v)}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
      const walk = r.walk
        ? `<h3>기록을 따라간 경로</h3><p class="dim">시작 ${esc(r.walk.startLabel)} · 기록 ${r.walk.nodes}건 (${esc(r.walk.classes.join(' · '))})</p>
           <ul class="trail">${r.walk.trail.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : ''
      const src = `<h3>출처</h3><ol class="srclist">${r.sources
        .map(
          (x) =>
            `<li><b>${esc(x.code)}</b> — ${esc(x.name)} · 보유 ${esc(x.owner)} · <span class="${x.live ? 'ok' : 'warn'}">${x.live ? '엔진 실집계' : '운수사 기준정보'}</span> · 기여 ${esc(x.role)}</li>`,
        )
        .join('')}</ol>`
      const meta = [
        r.confidence ? `신뢰도 <b>${esc(r.confidence.level)}</b> ${r.confidence.pct}% — ${esc(r.confidence.why)}` : '',
        r.basis ? `집계 구간 ${esc(r.basis.window)} · 표본 ${esc(r.basis.records)}` : '',
      ].filter(Boolean)
      return `<section class="qa">
        <h2><span class="no">${n + 1}</span>${esc(it.q)}</h2>
        ${r.subject ? `<p class="subject">대상 · ${esc(r.subject)}</p>` : ''}
        <p class="headline">${esc(r.headline)}</p>
        ${meta.length ? `<p class="meta">${meta.join('<br>')}</p>` : ''}
        <p class="detail">${bold(r.detail)}</p>
        ${sec}${ev}${cross}${rec}${walk}${src}
      </section>`
    })
    .join('')

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>Qdrive AI Q — 질의응답 기록 ${m.date}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f4f6; color: #111827;
    font-family: -apple-system, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; font-size: 11.5px; line-height: 1.65; word-break: keep-all; }
  .sheet { max-width: 190mm; margin: 24px auto; background: #fff; padding: 18mm 16mm; box-shadow: 0 1px 12px rgba(0,0,0,.12); }
  .bar { position: sticky; top: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    background: #111827; color: #e5e7eb; padding: 10px 16px; font-size: 12px; }
  .bar button { font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: 6px; padding: 7px 14px; background: #0284c7; color: #fff; }
  .bar button:hover { background: #0369a1; }
  .bar span { opacity: .8; }
  h1 { font-size: 19px; margin: 0 0 4px; letter-spacing: -.3px; }
  .head { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 18px; }
  .head p { margin: 2px 0; color: #4b5563; font-size: 11px; }
  h2 { font-size: 14.5px; margin: 26px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #d1d5db; }
  h2 .no { display: inline-block; min-width: 20px; margin-right: 7px; color: #0284c7; }
  h3 { font-size: 12px; margin: 15px 0 5px; color: #0f172a; }
  h3 .src { margin-left: 8px; font-size: 10px; font-weight: 400; color: #6b7280; }
  .subject { margin: 0 0 6px; font-size: 11px; color: #0284c7; font-weight: 700; }
  .headline { margin: 0 0 6px; font-size: 13.5px; font-weight: 700; }
  .meta { margin: 0 0 10px; padding: 7px 10px; background: #f8fafc; border-left: 3px solid #0284c7; color: #374151; font-size: 10.5px; }
  .detail { margin: 0 0 6px; }
  ul, ol { margin: 4px 0 0; padding-left: 17px; }
  li { margin: 2px 0; }
  .trail li { color: #4b5563; font-size: 10.5px; }
  .dim { margin: 2px 0; color: #6b7280; font-size: 10.5px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 2px; font-size: 10.5px; }
  th, td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; vertical-align: top; }
  thead th { background: #f3f4f6; font-size: 10px; }
  .rec th { width: 34%; background: #f9fafb; font-weight: 600; }
  .num { font-weight: 700; }
  .src-cell { color: #6b7280; }
  .ok { color: #047857; font-weight: 700; }
  .warn { color: #b45309; font-weight: 700; }
  .need { color: #0284c7; font-weight: 700; }
  .srclist li { margin: 3px 0; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #d1d5db; color: #6b7280; font-size: 10px; }
  h2, h3 { break-after: avoid; }
  table, tr, li { break-inside: avoid; }
  @media print {
    body { background: #fff; font-size: 10.5px; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .bar { display: none; }
  }
</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 인쇄 · PDF로 저장</button><span>인쇄 대화상자에서 «PDF로 저장»을 고르면 파일로 남습니다</span></div>
<div class="sheet">
  <div class="head">
    <h1>Qdrive AI Q — 질의응답 기록</h1>
    <p>작성 ${m.date} · 운행 시뮬레이션 경과 ${m.elapsed}</p>
    <p>내보낸 시점 기준 누적: ${m.scope} · 문항 ${items.length}건</p>
    <p>각 답의 수치는 «그 답을 낸 시점»의 집계입니다 — 문항마다 적힌 집계 구간이 기준입니다.</p>
  </div>
  ${body || '<p>담긴 답이 없습니다.</p>'}
  <div class="foot">답의 수치는 운행 데이터에서 계산된 값이며, 근거가 되는 원천을 문항마다 함께 적었습니다. · Qdrive 대구 시내버스 통합 운영 플랫폼</div>
</div>
</body></html>`
}

/**
 * 새 탭으로 연다 — 시연에서 «다운로드 폴더를 뒤지는 시간»이 가장 설명하기 어려운 구간이라서다.
 * 팝업이 막히면 파일 저장으로 물러선다.
 */
function openReport(html: string) {
  const w = window.open('', '_blank')
  if (w && w.document) {
    w.document.write(html)
    w.document.close()
    return
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'qdrive-질의응답-보고서.html'
  a.click()
  URL.revokeObjectURL(url)
}

function buildReport(items: ReportItem[], snap: SimSnapshot): string {
  const L: string[] = []
  L.push('# Qdrive AI Q — 질의응답 기록', '')
  // 제출 문서는 «언제 뽑았나»가 실제 날짜여야 한다. 시뮬 시각은 경과 시간이므로 분·초로 풀어 쓴다
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const elapsed = `${Math.floor(snap.simTime / 60)}분 ${pad(Math.floor(snap.simTime % 60))}초`
  L.push(`- 작성 시점: ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} (운행 시뮬레이션 경과 ${elapsed})`)
  L.push(`- 내보낸 시점 기준 누적: 실증 ${snap.vehicles.length}대 · 영업 ${snap.trips.length}회 · 공차 ${snap.deadheads.length}회`)
  L.push('- 각 답의 수치는 «그 답을 낸 시점»의 집계입니다 — 절마다 적힌 집계 구간이 기준입니다.')
  L.push('- 답의 수치는 전부 운행 데이터에서 계산된 값이며, 각 절에 출처를 함께 적었습니다.', '')

  let n = 0
  for (const it of items) {
    n++
    const r = it.res
    L.push(`## ${n}. ${it.q}`, '')
    if (r.subject) L.push(`**대상**: ${r.subject}`, '')
    L.push(`**결론**: ${r.headline}`, '')
    if (r.confidence) L.push(`- 신뢰도: ${r.confidence.level} ${r.confidence.pct}% — ${r.confidence.why}`)
    if (r.basis) L.push(`- 집계 구간: ${r.basis.window} · 표본 ${r.basis.records}`)
    L.push('')
    L.push(r.detail.replace(/\*\*/g, ''), '')
    for (const sec of r.sections) {
      L.push(`### ${sec.h}${sec.src?.length ? ` (출처: ${sec.src.join(', ')})` : ''}`)
      sec.items.forEach((it) => L.push(`- ${it}`))
      L.push('')
    }
    if (r.evidence.length) {
      L.push('### 근거 수치', '', '| 항목 | 값 | 출처 |', '|---|---|---|')
      r.evidence.forEach((e) => L.push(`| ${e.k} | ${e.v} | ${e.src ?? '-'} |`))
      L.push('')
    }
    if (r.cross?.length) {
      L.push('### 교차검증', '')
      r.cross.forEach((c) => L.push(`- ${c.ok ? '통과' : '주의'} · ${c.a} × ${c.b} — ${c.what}: ${c.result}`))
      L.push('')
    }
    if (r.record) {
      L.push(`### 원본 기록 — ${r.record.title}`, '')
      r.record.fields.forEach((f) => L.push(`- ${f.k}: ${f.v}`))
      L.push('')
    }
    if (r.walk) {
      L.push('### 기록을 따라간 경로', '', `- 시작 ${r.walk.startLabel} · 기록 ${r.walk.nodes}건 (${r.walk.classes.join(' · ')})`)
      r.walk.trail.forEach((t) => L.push(`- ${t}`))
      L.push('')
    }
    L.push('### 출처', '')
    r.sources.forEach((sc, k) => L.push(`${k + 1}. ${sc.code} — ${sc.name} · 보유 ${sc.owner} · ${sc.live ? '엔진 실집계' : '운수사 기준정보'} · 기여: ${sc.role}`))
    L.push('')
  }
  if (n === 0) L.push('_아직 기록된 질의응답이 없습니다._')
  return L.join(String.fromCharCode(10))
}

/** 파일로 내려받는다 — 클립보드는 브라우저 권한에 막히는 일이 있어 저장을 기본으로 둔다 */
function downloadMd(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/* ═══════════ 라이브 Claude (자유 질문 전용) ═══════════ */

async function askClaude(q: string, snap: SimSnapshot): Promise<string> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': localStorage.getItem(KEY_LS) || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 4096,
        // 시연 중 지연이 길면 안 되므로 낮은 effort — 사고는 켜 둔 채로 비용·지연만 낮춘다
        output_config: { effort: 'low' },
        fallbacks: 'default',
        system: buildSystem(snap),
        messages: [{ role: 'user', content: q }],
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 401) return 'API 키가 유효하지 않습니다 — 왼쪽 «자유 질문»에서 키를 다시 확인해 주세요.'
      if (res.status === 429) return '요청이 많아 잠시 제한됐습니다 — 잠시 후 다시 시도해 주세요.'
      return `요청이 실패했습니다: ${data?.error?.message ?? `HTTP ${res.status}`}`
    }
    // 거부는 정상 200으로 오므로 content를 읽기 전에 먼저 확인한다
    if (data?.stop_reason === 'refusal') return '이 질문에는 답변할 수 없습니다.'
    const text = (data?.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim()
    return text || '응답이 비어 있습니다 — 다시 시도해 주세요.'
  } catch {
    return '네트워크 오류가 발생했습니다 — 인터넷 연결을 확인해 주세요.'
  }
}
