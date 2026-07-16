import { useRef, useState } from 'react'
import { useSim } from '../../sim/store'
import { DEMO_VEHICLE_ID } from '../../sim/engine'
import type { SimSnapshot } from '../../sim/types'

interface Msg {
  role: 'user' | 'ai'
  text: string
}

/** 스크립트 기반 정비도우미 응답 (실서비스에서는 LLM + RAG[정비지침서·고장코드 매뉴얼]) */
function diagnose(vehicleId: string, snap: SimSnapshot): string {
  const v = snap.vehicles.find((x) => x.id === vehicleId)
  if (!v) return `차량 ${vehicleId}를 찾을 수 없습니다. 차량번호를 확인해 주세요.`
  const f = snap.fault && snap.fault.vehicleId === v.id ? snap.fault : null
  const harsh = v.eventCounts['급감속'] + v.eventCounts['급정지']
  const lines = [
    `📋 진단 결과 — 최근 운행 기준`,
    ``,
    f
      ? `⚠️ 냉각수온도 시스템에서 주의 신호가 확인되어 점검이 필요한 상태입니다. 현재 냉각수온 ${f.coolantTemp.toFixed(1)}°C(정상 88~95°C)로 상승 추세이며, 유사 고장 차량의 상승 패턴과 일치합니다.`
      : `주요 계통(전원·냉각·연료·배기) 센서 진단 결과 정상 범위입니다.`,
    ``,
    `🔧 권장 점검 순서`,
    f
      ? `1. 냉각수온도 시스템을 우선 점검해 주세요 — 냉각팬 작동, 서모스탯, 냉각수 라인 누설 순.\n2. 전원공급장치(배터리·제너레이터) 전압 안정성을 확인해 주세요.\n3. 반복 고장코드 발생 시 센서 점검도 함께 진행해 주세요.`
      : `1. 정기 점검 주기에 따라 브레이크 패드 마모(급제동 ${harsh}건 발생)를 확인해 주세요.\n2. DPF 재생 누적거리 점검을 권장합니다.`,
    ``,
    `운행 데이터: 주행 ${v.distanceKm.toFixed(1)}km · 위험운전 ${Object.values(v.eventCounts).reduce((a, b) => a + b, 0)}건 · 운전점수 ${Math.round(v.score)}점`,
  ]
  return lines.join('\n')
}

const CANNED: Record<string, string> = {
  'P0299 고장코드는 어떻게 정비하나요?':
    'P0299는 터보/슈퍼차저 부스트 부족 관련 코드입니다.\n\n주요 원인: ① 흡기 라인 누설(인터쿨러 호스·클램프) ② 웨이스트게이트 액추에이터 고착 ③ 부스트 압력 센서 오작동\n\n점검 순서: 1) 흡기 계통 육안·가압 누설 점검 → 2) 액추에이터 작동 확인 → 3) 센서 신호값을 진단 스캐너의 "요구레일/실제레일 압력" 항목과 비교하세요.\n\n※ 본 점검방법은 표준 매뉴얼 기준이며 차량 사양에 따라 다를 수 있습니다.',
  '냉각수온 이상 원인은 무엇인가요?':
    '냉각수온 상승의 주요 원인 순위:\n\n① 냉각팬 미작동 (팬 모터·릴레이·벨트) — 가장 빈번\n② 서모스탯 고착 (닫힘 상태)\n③ 냉각수 부족·누설 (라디에이터·호스 연결부)\n④ 워터펌프 임펠러 마모\n\n현재 진단 스캐너에서 냉각수 온도가 상승 추세라면, 운행 중단 전 예방 정비를 권장합니다. 경고 지속 시 엔진 보호를 위해 2회차 종료 후 차량 교체가 안전합니다.',
  '브레이크 패드 점검 방법은?':
    '브레이크 패드 점검 절차:\n\n1) 휠 탈거 후 패드 잔여 두께 측정 — 한계치 3mm 미만이면 즉시 교체\n2) 디스크 표면 편마모·균열 확인\n3) 급제동 빈도가 높은 차량(DTG 급감속·급정지 데이터 참조)은 점검 주기를 30% 단축 권장\n\nQdrive 운행데이터 기준으로 급제동 상위 차량이 자동 선별되므로, "차량·기사별 운행 현황"의 위험운전 건수를 참고하세요.',
}

export default function MaintChat() {
  const snap = useSim()
  const snapRef = useRef(snap)
  snapRef.current = snap
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState(DEMO_VEHICLE_ID)

  const send = (text: string) => {
    if (!text.trim()) return
    const answer = CANNED[text] ?? diagnose(text.trim(), snapRef.current)
    setMessages((m) => [...m, { role: 'user', text }, { role: 'ai', text: answer }])
    setInput('')
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="text-2xl">
            <span className="mr-2 inline-block h-6 w-6 animate-pulse rounded-full bg-gradient-to-tr from-violet-500 to-sky-400 align-middle" />
            <span className="align-middle font-bold text-gray-200">AI+ 정비도우미</span>
          </div>
          <div className="text-xs text-gray-500">차량번호를 입력하면 최근 진단 결과와 권장 점검을 요약해 드립니다</div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto py-4 pr-2">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="rounded-2xl rounded-tr-sm bg-sky-600/30 px-4 py-2 text-sm text-sky-100">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-gradient-to-tr from-violet-500 to-sky-400" />
                <div className="whitespace-pre-line rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-900/70 px-4 py-3 text-xs leading-relaxed text-gray-300">
                  {m.text}
                  <div className="mt-2 border-t border-gray-800 pt-1.5 text-[10px] text-gray-500">
                    ℹ️ 이 답변은 참고용입니다 — AI가 제공한 정보는 오류가 있을 수 있으므로 정비 전 반드시
                    확인하세요
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* 추천 질문 */}
      <div className="flex flex-wrap gap-1.5 pb-2">
        <span className="py-1 text-[10px] text-gray-600">● 이렇게 질문해 보세요:</span>
        {Object.keys(CANNED).map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 text-[10px] text-gray-400 hover:border-sky-500/50 hover:text-sky-300"
          >
            {q}
          </button>
        ))}
      </div>

      {/* 입력 */}
      <div className="flex gap-2 pb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="차량번호 또는 질문을 입력해주세요 (예: 대구70자3742)"
          className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
        />
        <button
          onClick={() => send(input)}
          className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500"
        >
          →
        </button>
      </div>
      <div className="pb-1 text-center text-[10px] text-gray-600">
        실서비스: LLM + RAG(정비 지침서·고장코드 매뉴얼·차량 운행이력) — 데모는 스크립트 응답
      </div>
    </div>
  )
}
