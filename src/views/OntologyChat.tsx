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
import { QA_TOPICS, UNANSWERABLE, answerQuestion, type QaResult, type QaSource, type QaTopic } from '../sim/ontologyQa'
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

/** 라이브 Claude에 넘길 현재 운영 상태 — 엔진이 진짜 근거다 */
function buildSystem(s: SimSnapshot): string {
  const dh = s.deadheads.reduce((a, t) => a + t.distanceKm, 0)
  const rev = s.trips.reduce((a, t) => a + t.distanceKm, 0)
  return [
    '당신은 대구 시내버스 통합 운영 플랫폼 Qdrive의 온톨로지 질의 도우미입니다.',
    '아래는 지금 이 순간 시뮬레이터 엔진의 실제 집계값입니다. 이 범위 밖의 수치는 지어내지 말고,',
    '모르면 "그 데이터는 아직 연결되지 않았습니다"라고 답하세요. 답은 3~5문장 한국어로 간결하게.',
    '',
    `- 운행 중 차량 ${s.vehicles.length}대 · 누적 주행 ${s.kpi.totalDistanceKm.toFixed(1)}km`,
    `- 영업 운행 ${s.trips.length}회(${rev.toFixed(1)}km) / 공차 운행 ${s.deadheads.length}회(${dh.toFixed(1)}km)`,
    `- 위험운전 누적 ${s.kpi.totalEvents}건 · 평균 안전점수 ${s.kpi.avgScore.toFixed(1)}점`,
    `- 연료 절감률 ${s.kpi.fuelSavedPct.toFixed(2)}% · CO₂ 절감 ${s.kpi.totalCo2SavedKg.toFixed(1)}kg`,
    `- 현재 날씨 ${s.weather.condition}`,
    '- 연결된 1차 데이터: DTG(운행기록계)·OBD/CAN(자가진단)·RTK(정밀위치)·BIS(공개 API)·차고지 출입고',
    '- 아직 연결되지 않은 축: 교통카드 정산(AFC)·승객계수(APC)·신호(ITS)·영상(DVR)',
  ].join('\n')
}

export default function OntologyChat({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const snap = useSim()
  const snapRef = useRef(snap)
  snapRef.current = snap

  const [msgs, setMsgs] = useState<Msg[]>([])
  const msgsRef = useRef(msgs)
  msgsRef.current = msgs

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

  const ask = async (q: string, targetId?: string) => {
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

    const res = answerQuestion(snapRef.current, text, targetId)
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
          <span className={hasKey ? 'text-emerald-400' : 'text-amber-300'}>{hasKey ? '● 연결됨' : '○ 미연결'}</span>
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
          <span className="rounded-md border border-gray-800 bg-gray-950 px-2 py-0.5 text-[10.5px] font-bold text-gray-400">
            1차 데이터 8종 연결됨
          </span>
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
            msgs.map((m) => <MsgView key={m.id} m={m} stream={stream} onNavigate={onNavigate} />)
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
          <div className="mt-1.5 px-1 text-[10.5px] text-gray-400">
            답의 숫자는 지어내지 않고 지금 돌아가는 엔진에서 계산합니다 · 출처는 답마다 함께 표시됩니다
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
      <h3 className="text-base font-black text-gray-100">무엇을 물어볼까요?</h3>
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

function MsgView({ m, stream, onNavigate }: { m: Msg; stream: { id: number; n: number } | null; onNavigate?: (tab: string) => void }) {
  const [openRec, setOpenRec] = useState(false)
  const [openEvidence, setOpenEvidence] = useState(false)
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
          <div className="text-[12.5px] font-bold text-amber-300">{UNANSWERABLE.headline}</div>
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
          <div className="break-keep text-[13.5px] font-bold leading-snug text-gray-50">{r.headline}</div>
          <div className="mt-1.5 break-keep text-[12.5px] leading-relaxed text-gray-300">
            {detail}
            {typing && <Caret />}
          </div>
        </div>

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
                    <span className={s.live ? 'text-emerald-400' : 'text-amber-400'} title={s.live ? '엔진 실집계' : '예시 상수 · 실증 시 실측으로 교체'}>
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
              {r.record && <Action onClick={() => setOpenRec((v) => !v)} label={openRec ? '원본 접기' : '원본 레코드'} />}
              <Action
                onClick={async () => {
                  const txt = [r.headline, r.detail.replace(/\*\*/g, ''), '', ...r.evidence.map((e) => `${e.k}: ${e.v}${e.src ? ` [${e.src}]` : ''}`)].join('\n')
                  await navigator.clipboard?.writeText(txt).catch(() => {})
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1600)
                }}
                label={copied ? '복사됨 ✓' : '복사'}
              />
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

            {openEvidence && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10.5px] font-bold tracking-wider text-gray-400">근거 사슬</span>
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
                {r.caveat && <div className="break-keep text-[11px] leading-relaxed text-amber-200/80">※ {r.caveat}</div>}
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
          {s.live ? '엔진 실집계' : '예시 상수 · 실증 시 실측 교체'}
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
