/**
 * 💬 AI 채팅 — 제안서 「맥락이 붙으면 비로소 답할 수 있는 질문」 4종에 실제로 답하는 화면.
 *
 * 이름은 «AI 채팅»이지만 **LLM이 온톨로지로 만들어지는 것은 아니다.** 모델은 이미 학습된 범용
 * Claude이고, 온톨로지는 그 답에 **근거를 대는 데이터 구조**다. 아래 4개 질문은 애초에 LLM을
 * 거치지 않고 엔진에서 계산한다 — 그래서 네트워크가 끊겨도 답이 나온다.
 *
 * 다른 탭과 성격이 다르다. ⓪~⑨는 «온톨로지가 무엇을 담고 있나»를 보여주고,
 * 여기는 «그 위에서 도는 서비스»다 — 발주처가 실제로 쓰게 될 모습.
 *
 * 답을 만드는 방식이 이 화면의 핵심이다.
 *  1. 질문을 라우팅해 **스냅샷에서 계산**한다 (`sim/ontologyQa.ts`). 숫자는 지어내지 않는다.
 *  2. 답과 함께 **순회한 클래스·관계**를 보여준다 — 표 조회로는 못 하고 온톨로지라야 되는 이유.
 *  3. 못 알아들으면 **답할 수 없다고 답한다.** 라이브 Claude 키가 있으면 자유 대화로 넘기되,
 *     그 답에는 「계산이 아니라 설명」이라는 꼬리표를 붙인다.
 *
 * 규칙 기반 경로는 네트워크 없이도 동작한다 — 시연 중 인터넷이 죽어도 4개 질문은 답이 나와야 한다.
 */
import { useEffect, useRef, useState } from 'react'
import { Panel } from '../components/ui'
import { useSim } from '../sim/store'
import { QA_TOPICS, UNANSWERABLE, answerQuestion, type QaResult } from '../sim/ontologyQa'
import type { SimSnapshot } from '../sim/types'

const KEY_LS = 'qdrive-anthropic-key'

type Msg =
  | { role: 'user'; text: string }
  | { role: 'qa'; res: QaResult }
  | { role: 'live'; text: string }
  | { role: 'none' }
  | { role: 'pending' }

/** 라이브 Claude에 넘길 때 붙이는 현재 운영 상태 — 엔진이 진짜 근거다 */
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
    `- 연결된 1차 데이터: DTG(운행기록계)·OBD/CAN(자가진단)·RTK(정밀위치)·BIS(공개 API)·차고지 출입고`,
    `- 아직 연결되지 않은 축: 교통카드 정산(AFC)·승객계수(APC)·신호(ITS)·영상(DVR)`,
  ].join('\n')
}

export default function OntologyChat() {
  const snap = useSim()
  const snapRef = useRef(snap)
  snapRef.current = snap

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hasKey, setHasKey] = useState(() => !!localStorage.getItem(KEY_LS))
  const [showKey, setShowKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs])

  /** 규칙 경로 — 스냅샷에서 계산해 즉시 답한다 */
  const askTopic = (q: string) => {
    const res = answerQuestion(snapRef.current, q)
    setMsgs((m) => [...m, { role: 'user', text: q }, res ? { role: 'qa', res } : { role: 'none' }])
  }

  const submit = async () => {
    const q = input.trim()
    if (!q) return
    setInput('')
    const res = answerQuestion(snapRef.current, q)
    if (res) {
      setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'qa', res }])
      return
    }
    if (!hasKey) {
      setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'none' }])
      return
    }
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'pending' }])
    const text = await askClaude(q, snapRef.current)
    setMsgs((m) => [...m.slice(0, -1), { role: 'live', text }])
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
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.2em] text-violet-400">ONTOLOGY-GROUNDED AI</div>
          <h2 className="mt-0.5 text-lg font-black tracking-tight text-gray-50">💬 AI 채팅</h2>
          <p className="mt-1 max-w-3xl break-keep text-[12.5px] leading-relaxed text-gray-400">
            거리·연료 같은 <b className="text-gray-300">숫자만 있는 표</b>로는 답할 수 없고, 운행 단위에 의미가 붙어 있어야 답이 나오는 질문들입니다. 아래
            네 질문은 <b className="text-violet-300">지금 돌아가는 엔진에서 실제로 계산</b>해 답하며, 어떤 클래스를 어떤 관계로 걸어서 나온 답인지 함께
            보여줍니다.
          </p>
        </div>
        <button
          onClick={() => setShowKey((v) => !v)}
          className="shrink-0 rounded-md border border-gray-800 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200"
        >
          {hasKey ? '🔑 라이브 연결됨' : '🔑 자유 질문 설정'}
        </button>
      </div>

      {showKey && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <div className="break-keep text-[11.5px] leading-relaxed text-gray-400">
            아래 <b className="text-gray-300">네 질문은 키 없이도 동작합니다</b> — 엔진에서 직접 계산하기 때문입니다. Anthropic API 키를 연결하면 그
            밖의 자유 질문에도 실시간 운영 데이터를 근거로 답합니다.
            <br />
            <b className="text-gray-300">키는 이 브라우저에만 저장</b>되고 Anthropic API로만 전송됩니다.
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="sk-ant-..."
              className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:border-violet-500"
            />
            <button onClick={saveKey} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500">
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

      {/* 대표 질문 4종 */}
      <Panel title="맥락이 붙으면 비로소 답할 수 있는 질문" right={<span className="text-[11px] text-gray-500">누르면 지금 데이터로 계산합니다</span>}>
        <div className="grid grid-cols-2 gap-2 max-[820px]:grid-cols-1">
          {QA_TOPICS.map((t) => (
            <button
              key={t.id}
              onClick={() => askTopic(t.q)}
              className="rounded-lg border border-gray-800 bg-gray-900/60 px-3.5 py-2.5 text-left transition-colors hover:border-violet-500/50 hover:bg-violet-500/5 focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="break-keep text-[12.5px] font-bold text-gray-100">“{t.q}”</span>
                <span className="shrink-0 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                  {t.tag}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {/* 대화 */}
      <Panel title="답변" right={<span className="text-[11px] text-gray-500">{msgs.length === 0 ? '질문을 눌러 보세요' : `${msgs.filter((m) => m.role === 'user').length}건`}</span>}>
        {msgs.length === 0 ? (
          <div className="py-10 text-center text-[12px] leading-relaxed text-gray-500">
            <div className="mb-1.5 text-2xl">💬</div>
            위 네 질문 중 하나를 누르거나, 아래에 직접 물어보세요.
            <br />
            답은 지어내지 않고 <b className="text-gray-400">지금 엔진에 쌓인 데이터에서 계산</b>합니다.
          </div>
        ) : (
          <div className="space-y-3">
            {msgs.map((m, i) => (
              <MsgView key={i} m={m} />
            ))}
            <div ref={endRef} />
          </div>
        )}

        <div className="mt-3 flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="예: 공차가 가장 많은 차고지는? / 이번 감축은 무엇 때문인가?"
            className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-[12.5px] text-gray-100 outline-none focus:border-violet-500"
          />
          <button
            onClick={submit}
            className="shrink-0 rounded-md bg-violet-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-violet-500"
          >
            묻기
          </button>
        </div>
      </Panel>
    </div>
  )
}

/* ═══════════ 메시지 렌더 ═══════════ */

function MsgView({ m }: { m: Msg }) {
  if (m.role === 'user')
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] break-keep rounded-2xl rounded-tr-sm bg-violet-600/25 px-3.5 py-2 text-[12.5px] text-violet-100">{m.text}</div>
      </div>
    )

  if (m.role === 'pending')
    return (
      <div className="flex gap-2">
        <Avatar />
        <div className="pt-1 text-[12px] text-gray-500">엔진 데이터를 근거로 답을 만들고 있습니다…</div>
      </div>
    )

  if (m.role === 'live')
    return (
      <div className="flex gap-2">
        <Avatar />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-3.5 py-2.5 break-keep text-[12.5px] leading-relaxed whitespace-pre-wrap text-gray-200">
            {m.text}
          </div>
          <div className="mt-1 text-[10.5px] text-amber-400/80">
            ⚠ 이 답은 라이브 AI가 <b>설명</b>한 것입니다 — 위 네 질문처럼 엔진에서 계산한 값이 아닙니다.
          </div>
        </div>
      </div>
    )

  if (m.role === 'none')
    return (
      <div className="flex gap-2">
        <Avatar />
        <div className="min-w-0 flex-1 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5">
          <div className="text-[12.5px] font-bold text-amber-300">{UNANSWERABLE.headline}</div>
          <div className="mt-1 break-keep text-[11.5px] leading-relaxed text-gray-400">{UNANSWERABLE.detail}</div>
        </div>
      </div>
    )

  const r = m.res
  return (
    <div className="flex gap-2">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        {/* 근거 사슬 */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10.5px] font-semibold text-gray-500">근거 사슬</span>
          {r.path.map((p, i) => (
            <span key={i} className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-300">
              {p}
            </span>
          ))}
        </div>

        {/* 답 */}
        <div className={`rounded-xl border px-3.5 py-2.5 ${r.empty ? 'border-gray-800 bg-gray-900/60' : 'border-emerald-500/25 bg-emerald-500/10'}`}>
          <div className={`break-keep text-[13px] font-bold ${r.empty ? 'text-gray-300' : 'text-emerald-300'}`}>{r.headline}</div>
          <div className="mt-1.5 break-keep text-[12px] leading-relaxed text-gray-300">{r.detail.replace(/\*\*/g, '')}</div>
        </div>

        {/* 근거 수치 */}
        {r.evidence.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5">
            <table className="w-full text-left text-[11.5px]">
              <tbody>
                {r.evidence.map((e, i) => (
                  <tr key={i} className="border-b border-gray-800/50 last:border-0">
                    <td className="w-[42%] py-1.5 pr-3 break-keep align-top text-gray-500">{e.k}</td>
                    <td className="py-1.5 break-keep font-semibold text-gray-200">{e.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {r.caveat && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 break-keep text-[11px] leading-relaxed text-gray-500">
            ※ {r.caveat}
          </div>
        )}
      </div>
    </div>
  )
}

const Avatar = () => <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-gradient-to-tr from-violet-500 to-sky-400" />

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
        // 시연 중 응답이 길어지면 안 되므로 낮은 effort — 사고는 켜 둔 채로 비용·지연만 낮춘다
        output_config: { effort: 'low' },
        fallbacks: 'default',
        system: buildSystem(snap),
        messages: [{ role: 'user', content: q }],
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 401) return 'API 키가 유효하지 않습니다 — 우상단 설정에서 키를 다시 확인해 주세요.'
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
