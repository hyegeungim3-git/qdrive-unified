import { useRef, useState } from 'react'
import { engine, useSim } from '../sim/store'
import { RISK_EVENT_TYPES, type SimSnapshot } from '../sim/types'
import { topZones } from '../views/operator/AiReport'
import { simClock } from './ui'

/**
 * AI Q (공통 AI 도우미) — 자연어 질문에 실시간 스냅샷을 조회해 답하고 조치까지 제안한다.
 * 노션 아이데이션의 "관제 Copilot"을 실동작화. 화면 어디서든 호출(플로팅).
 *
 * 대통합: proto의 규칙 기반 엔진 조회(조치 제안·탭 이동) + 탄소 플랫폼의 라이브 모드(사용자 키 → 실제 Claude)를 병합.
 * - 추천 질문: 규칙 기반 즉시 조회(근거·조치·이동 버튼)
 * - 자유 입력: 라이브 연결(localStorage 키) 시 실제 Claude(claude-opus-4-8)가 실시간 스냅샷을 근거로 답변, 미연결 시 규칙 기반
 * 키는 브라우저 localStorage 전용 · api.anthropic.com만 전송 · 저장소 커밋 금지.
 */

interface Reply {
  text: string
  evidence?: string[]
  /** run(): 실행 결과 메시지를 반환하면 그 문구를, 없으면 label 기반 기본 문구를 채팅에 추가 */
  action?: { label: string; run: () => string | void }
  nav?: { tab: string; label: string }
}

const fmt1 = (n: number) => Math.round(n * 10) / 10
const KEY_LS = 'qdrive_api_key'

/** 의도 매칭 → 실시간 데이터 조회 → 답변 */
function answer(qRaw: string, snap: SimSnapshot): Reply {
  const q = qRaw.replace(/\s/g, '')
  const has = (...ws: string[]) => ws.some((w) => q.includes(w))
  const vehicles = snap.vehicles

  // 특정 차량 조회 (뒤 4자리)
  const carMatch = qRaw.match(/(\d{4})호?/)
  if (carMatch && vehicles.some((v) => v.id.endsWith(carMatch[1]))) {
    const v = vehicles.find((x) => x.id.endsWith(carMatch[1]))!
    const evTotal = RISK_EVENT_TYPES.reduce((s, t) => s + v.eventCounts[t], 0)
    return {
      text: `${v.id.slice(-4)}호(${v.driverName} 기사)는 안전점수 ${Math.round(v.score)}점, 경제운전 ${Math.round(v.ecoScore)}점입니다. 현재 ${Math.round(v.speedKmh)}km/h로 ${v.nextStopName} 방면 운행 중이며 재차율 ${Math.round(v.occupancy * 100)}%, 오늘 위험운전 ${evTotal}건입니다.`,
      evidence: [`점수 ${Math.round(v.score)} · 에코 ${Math.round(v.ecoScore)}`, `주행 ${fmt1(v.distanceKm)}km · 연료 ${fmt1(v.fuelM3)}m³`],
      nav: { tab: 'operator', label: '운수사 관제' },
    }
  }

  // 고장 / 정비
  if (has('고장', '정비', '점검', '냉각', '브레이크')) {
    if (snap.fault?.predicted) {
      return {
        text: `${snap.fault.vehicleId.slice(-4)}호에서 ${snap.fault.kind} 예측이 발화했습니다(현재 ${fmt1(snap.fault.coolantTemp)}°C). 회차 종료 후 예방 정비를 권장하며, 작업지시는 운수사 관제에서 발행할 수 있습니다.`,
        evidence: [`고장 예측 1건`, `냉각수온 ${fmt1(snap.fault.coolantTemp)}°C`],
        nav: { tab: 'operator', label: '운수사 관제' },
      }
    }
    return {
      text: '현재 예측된 고장은 없습니다. 정기 점검 대상은 브레이크 패드(3742·5563호 잔여 2주)이며, 진단 스캐너에서 1초 단위 센서값을 확인할 수 있습니다.',
      evidence: [`고장 예측 0건 · 작업지시 ${snap.workOrders.length}건`],
      nav: { tab: 'operator', label: '진단 스캐너' },
    }
  }

  // 위험 차량 / 안전
  if (has('위험', '안전', '점수낮', '주의차량', '문제차량')) {
    const worst = [...vehicles].sort((a, b) => a.score - b.score)[0]
    const topType = RISK_EVENT_TYPES.map((t) => ({ t, c: worst.eventCounts[t] })).sort((a, b) => b.c - a.c)[0]
    return {
      text: `현재 안전점수 최저는 ${worst.id.slice(-4)}호(${worst.driverName} 기사) ${Math.round(worst.score)}점입니다. ${topType.c > 0 ? `${topType.t} ${topType.c}건이 주된 감점 요인으로, 해당 유형 중심 코칭을 권장합니다.` : '이벤트는 적으나 점수 회복 구간으로 관찰이 필요합니다.'}`,
      evidence: [`전체 평균 ${fmt1(snap.kpi.avgScore)}점`, `대상 ${worst.id.slice(-4)}호 ${Math.round(worst.score)}점`],
      nav: { tab: 'operator', label: '운수사에서 리포트 보기' },
    }
  }

  // 배차 몰림
  if (has('배차', '몰림', '간격', '벌어')) {
    const bunched = vehicles.filter((v) => v.headway?.status === 'bunching')
    if (bunched.length > 0) {
      const b = bunched[0]
      return {
        text: `${b.id.slice(-4)}호가 앞차와 ${fmt1(b.headway!.frontGapMin)}분 간격(이상 ${fmt1(b.headway!.idealMin)}분)으로 몰림 상태입니다. 배차 조정을 권고할까요?`,
        evidence: [`몰림 ${bunched.length}대`, `앞차 간격 ${fmt1(b.headway!.frontGapMin)}분`],
        action: {
          label: '배차 권고 생성',
          run: () =>
            engine.forceRecommendation() === 'created'
              ? '✓ 배차 권고를 생성했습니다 — 운수사 관제에서 승인해 주세요.'
              : '이미 대기 중인 배차 권고가 있어요 — 운수사 관제에서 먼저 승인해 주세요.',
        },
        nav: { tab: 'operator', label: '운수사에서 승인' },
      }
    }
    return {
      text: '현재 배차 몰림 없이 고른 간격을 유지 중입니다. 필요 시 배차 권고를 생성해 시뮬레이션할 수 있습니다.',
      evidence: [`운행 ${vehicles.length}대 · 몰림 0`],
      action: {
        label: '배차 권고 생성(시연)',
        run: () =>
          engine.forceRecommendation() === 'created'
            ? '✓ 배차 권고를 생성했습니다 — 운수사 관제에서 승인해 주세요.'
            : '이미 대기 중인 배차 권고가 있어요 — 운수사 관제에서 먼저 승인해 주세요.',
      },
    }
  }

  // 연료 낭비 / 에코
  if (has('연료', '낭비', '연비', '에코', '절감')) {
    const agg = vehicles.reduce(
      (a, v) => ({ habit: a.habit + v.fuelWaste.habit, idle: a.idle + v.fuelWaste.idle, harsh: a.harsh + v.fuelWaste.harsh, ac: a.ac + v.fuelWaste.ac }),
      { habit: 0, idle: 0, harsh: 0, ac: 0 },
    )
    const total = agg.habit + agg.idle + agg.harsh + agg.ac
    const top = [
      ['운전습관', agg.habit],
      ['공회전', agg.idle],
      ['급조작', agg.harsh],
      ['냉방부하', agg.ac],
    ].sort((a, b) => (b[1] as number) - (a[1] as number))[0]
    return {
      text: `현재 코칭 절감률은 ${fmt1(snap.kpi.fuelSavedPct)}%입니다. 전 차량 연료 낭비 1위 요인은 ${total > 0 ? `${top[0]}(${Math.round(((top[1] as number) / total) * 100)}%)` : '집계 중'}이며, 예측형 에코 코칭(정류장 전 관성주행 안내)으로 발생 전에 억제하고 있습니다.`,
      evidence: [`절감률 ${fmt1(snap.kpi.fuelSavedPct)}%`, `CO₂ 절감 ${fmt1(snap.kpi.totalCo2SavedKg)}kg`],
      nav: { tab: 'operator', label: '연료 절감 AI' },
    }
  }

  // 혼잡 / 재차율
  if (has('혼잡', '재차', '승객', '붐비')) {
    const busiest = [...vehicles].sort((a, b) => b.occupancy - a.occupancy)[0]
    const avgOcc = vehicles.reduce((s, v) => s + v.occupancy, 0) / vehicles.length
    return {
      text: `현재 평균 재차율은 ${Math.round(avgOcc * 100)}%입니다. 가장 붐비는 차량은 ${busiest.id.slice(-4)}호로 ${Math.round(busiest.occupancy * 100)}%(${busiest.occupancy >= 0.7 ? '혼잡' : '보통'})입니다. 오늘 누적 탑승객은 ${snap.passengers.toLocaleString()}명입니다.`,
      evidence: [`평균 재차율 ${Math.round(avgOcc * 100)}%`, `탑승 ${snap.passengers}명`],
      nav: { tab: 'city', label: '시티 대시보드' },
    }
  }

  // 돌발 / 사고
  if (has('돌발', '사고', '공사', '이슈')) {
    const active = snap.incidents.filter((i) => i.status !== '완료')
    if (active.length > 0) {
      return {
        text: `진행 중 돌발상황 ${active.length}건: ${active.map((i) => `${i.kind}(${i.status})`).join(' · ')}. 관제·시민안내가 자동 연동되어 대응 중이며, 시티 대시보드 지도에서 위치를 확인할 수 있습니다.`,
        evidence: active.slice(0, 3).map((i) => `${i.kind} — ${i.title.slice(0, 20)}`),
        nav: { tab: 'city', label: '시티 대시보드' },
      }
    }
    return { text: '현재 진행 중인 돌발상황은 없습니다. 상시 도로 공사 1건만 처리중입니다.', evidence: ['돌발 진행 0건(공사 제외)'] }
  }

  // 민원
  if (has('민원', '불편', '컴플')) {
    const cs = snap.complaints
    if (cs.length > 0) {
      const resolved = cs.filter((c) => c.status === '해결').length
      return {
        text: `민원 ${cs.length}건 중 ${resolved}건 해결 완료, ${cs.filter((c) => c.evidence).length}건은 증빙 자동매칭(GPS·DTG·DVR)으로 처리 중입니다. 민원이 감이 아닌 데이터로 처리되고 있습니다.`,
        evidence: [`민원 ${cs.length}건 · 해결 ${resolved}`],
        nav: { tab: 'city', label: '시티 대시보드' },
      }
    }
    return { text: '금일 접수된 민원은 없습니다. 시민안내 에이전트가 정비·기상·돌발 상황을 시민 언어로 자동 공지해 사전 민원을 억제하고 있습니다.', evidence: ['민원 0건'] }
  }

  // 날씨 / 폭우 대응
  if (has('날씨', '폭우', '폭염', '비오', '기상')) {
    if (snap.weather.condition !== '맑음') {
      return {
        text: `현재 ${snap.weather.condition}(${snap.weather.tempC}°C). 전 노선 평균 +${snap.weather.delayForecastMin}분 지연 예상, 감속 계열 이벤트는 정당 판정으로 감점 제외, 예비차 선배정을 권고 중입니다.`,
        evidence: [`${snap.weather.condition} · 지연 +${snap.weather.delayForecastMin}분`],
        nav: { tab: 'city', label: '시티 대시보드' },
      }
    }
    return {
      text: '현재 맑음(정상 운행). 폭우 전환 시 지연·사고위험 예측과 예비차 권고가 자동 연동됩니다. 지금 시뮬레이션할까요?',
      evidence: ['날씨 맑음 24°C'],
      action: { label: '폭우로 전환(시연)', run: () => engine.cycleWeather() },
    }
  }

  // 다발 구간
  if (has('구간', '어디서', '지점', '핫스팟')) {
    const zones = topZones(snap, 3)
    if (zones.length > 0) {
      return {
        text: `위험운전 다발 구간은 ${zones.map((z) => `${z.name}(${z.count}건)`).join(' · ')}입니다. 개인 습관보다 도로 환경 요인 가능성이 있어 해당 구간의 시야·신호 점검을 권고합니다.`,
        evidence: zones.map((z) => `${z.name} ${z.count}건`),
        nav: { tab: 'city', label: '시티 대시보드' },
      }
    }
    return { text: '아직 다발 구간으로 집계될 만한 이벤트가 없습니다. 배속을 올리면 데이터가 쌓입니다.' }
  }

  // 탄소중립 / 전환 / V2G — 대통합 탄소중립 분석 탭 연동
  if (has('탄소', '전환', '전기버스', 'v2g', 'V2G', 'koc', 'KOC', '크레딧')) {
    return {
      text: `누적 CO₂ 절감 ${fmt1(snap.kpi.totalCo2SavedKg)}kg(코칭 적용/미적용 연료 차)입니다. 전기전환은 효과순 선정 시 6대=연 214t·ROI 2.7년, V2G는 40대 참여 시 월 576만원이 예상됩니다. 탄소중립 분석 탭의 시뮬레이터에서 대수를 조절해 비교할 수 있어요.`,
      evidence: [`CO₂ 절감 ${fmt1(snap.kpi.totalCo2SavedKg)}kg`, `절감률 ${fmt1(snap.kpi.fuelSavedPct)}%`],
      nav: { tab: 'carbon', label: '탄소중립 분석' },
    }
  }

  // 운행 요약 / 현황
  if (has('요약', '현황', '전체', '상황', '오늘')) {
    return {
      text: `${simClock(snap.simTime)} 기준 ${vehicles.length}대 운행, 총 ${fmt1(snap.kpi.totalDistanceKm)}km. 평균 안전점수 ${fmt1(snap.kpi.avgScore)}점, 연료 절감률 ${fmt1(snap.kpi.fuelSavedPct)}%, 위험운전 ${snap.kpi.totalEvents}건, 탑승객 ${snap.passengers.toLocaleString()}명입니다.`,
      evidence: [`운행 ${vehicles.length}대 · ${fmt1(snap.kpi.totalDistanceKm)}km`, `절감 ${fmt1(snap.kpi.fuelSavedPct)}%`],
      nav: { tab: 'city', label: '시티 대시보드' },
    }
  }

  // fallback
  return {
    text: '운영 데이터 기반으로 답할 수 있어요. 예를 들어: "지금 가장 위험한 차량?", "배차 몰림 있어?", "연료 낭비 원인?", "고장 위험 차량?", "폭우 오면 어떻게 대응해?" — 라이브 연결 시 자유 질문에는 실제 Claude가 답합니다.',
  }
}

/** 라이브 모드 시스템 프롬프트 — 지금 이 순간의 실시간 스냅샷 + 배경 정합 */
function buildLiveSystem(snap: SimSnapshot): string {
  const worst = [...snap.vehicles].sort((a, b) => a.score - b.score)[0]
  return (
    "너는 'AI Q' — Qdrive(대구 시내버스 탄소중립 운영 플랫폼)의 AI 도우미다. 아래는 지금 이 순간의 시뮬레이션 실시간 스냅샷이다. 이 데이터를 근거로 사용자에게 한국어 2~4문장으로 간결히 답하라. 데이터에 없는 건 모른다고 정직하게 말하고 수치를 지어내지 마라.\n" +
    `[실시간] ${simClock(snap.simTime)} · 운행 ${snap.vehicles.length}대 · 총주행 ${fmt1(snap.kpi.totalDistanceKm)}km · 평균안전점수 ${fmt1(snap.kpi.avgScore)} · 연료절감률 ${fmt1(snap.kpi.fuelSavedPct)}% · CO₂절감 ${fmt1(snap.kpi.totalCo2SavedKg)}kg · 위험운전 ${snap.kpi.totalEvents}건 · 탑승 ${snap.passengers}명\n` +
    `[차량별 점수] ${snap.vehicles.map((v) => `${v.id.slice(-4)}호(${v.driverName}) ${Math.round(v.score)}`).join(', ')}\n` +
    `[최저점수] ${worst.id.slice(-4)}호 ${Math.round(worst.score)}점 · [날씨] ${snap.weather.condition} ${snap.weather.tempC}°C · [고장예측] ${snap.fault?.predicted ? `${snap.fault.vehicleId.slice(-4)}호 ${snap.fault.kind}` : '없음'} · [민원] ${snap.complaints.length}건 · [돌발진행] ${snap.incidents.filter((i) => i.status !== '완료').length}건\n` +
    '[배경 정합] 실증 목표 연 393.7t 감축, 안전점수↔연비 r=0.81, 전기전환 6대=연 214t·ROI 2.7년, KOC 8,900원/t, 세운버스 월 순이익 +1,175만원.'
  )
}

const SUGGESTIONS = ['지금 가장 위험한 차량?', '배차 몰림 있어?', '연료 낭비 원인은?', '탄소 감축 현황은?', '오늘 운행 요약']

type Msg = { role: 'user' | 'ai'; text: string; reply?: Reply; live?: boolean; loading?: boolean }

export default function Copilot({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const snap = useSim()
  const snapRef = useRef(snap)
  snapRef.current = snap
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hasKey, setHasKey] = useState(() => !!localStorage.getItem(KEY_LS))
  const [showKey, setShowKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')

  // 추천 질문/명령 → 규칙 기반 즉시 조회 (근거·조치·이동)
  const sendRule = (text: string) => {
    if (!text.trim()) return
    const reply = answer(text, snapRef.current)
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'ai', text: reply.text, reply }])
  }

  // 자유 입력 → 라이브 연결 시 실제 Claude, 미연결 시 규칙 기반
  const send = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (!localStorage.getItem(KEY_LS)) {
      sendRule(text)
      return
    }
    const idx = msgs.length + 1 // user 메시지 다음 인덱스
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'ai', text: '', live: true, loading: true }])
    askLive(text, idx)
  }

  const askLive = async (q: string, idx: number) => {
    const setAns = (text: string) =>
      setMsgs((m) => m.map((x, i) => (i === idx ? { role: 'ai', text, live: true } : x)))
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
          system: buildLiveSystem(snapRef.current),
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-[2500] flex items-center gap-2 rounded-full bg-gradient-to-tr from-violet-600 to-sky-500 px-4 py-3 text-sm font-bold text-white shadow-2xl hover:from-violet-500 hover:to-sky-400"
        title="AI Q — 무엇이든 물어보세요"
      >
        <span className="text-lg leading-none">{open ? '✕' : '✨'}</span>
        {!open && <span className="hidden sm:inline">AI Q</span>}
        {!open && hasKey && <span className="h-2 w-2 rounded-full bg-emerald-300" title="라이브 연결됨" />}
      </button>

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-20 right-5 z-[2500] flex h-[520px] max-h-[calc(100dvh-6rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-4 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-violet-500 to-sky-400 text-xs">✨</span>
            <div className="flex-1">
              <div className="text-sm font-bold text-gray-100">AI Q</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                {hasKey ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 라이브 AI · 실시간 데이터 연결
                  </>
                ) : (
                  '실시간 데이터 조회 · 조치 제안'
                )}
              </div>
            </div>
            <button
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-300 hover:text-gray-100"
            >
              {hasKey ? '설정' : '라이브 연결'}
            </button>
          </div>

          {/* API 키 패널 */}
          {showKey && (
            <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-3">
              <div className="text-[11px] leading-relaxed text-gray-400">
                Anthropic API 키를 연결하면 자유 질문에 실제 Claude가 실시간 운영 데이터를 근거로 답해요.
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
                <button onClick={saveKey} className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500">저장</button>
                {hasKey && (
                  <button onClick={clearKey} className="rounded-md border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200">해제</button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {msgs.length === 0 && (
              <div className="mt-6 text-center text-xs leading-relaxed text-gray-500">
                <div className="mb-1 text-2xl">✨</div>
                운영 전반을 자연어로 물어보세요.
                <br />
                실시간 데이터를 조회해 근거와 함께 답하고,
                <br />
                필요하면 조치까지 제안합니다.
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-sky-600/30 px-3 py-2 text-xs text-sky-100">{m.text}</div>
                </div>
              ) : (
                <div key={i} className="flex gap-2">
                  <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-gradient-to-tr from-violet-500 to-sky-400" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs leading-relaxed text-gray-300">
                      {m.loading ? (
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> Claude가 실시간 데이터를 검토하는 중…
                        </span>
                      ) : (
                        m.text
                      )}
                      {m.live && !m.loading && (
                        <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-bold text-emerald-400">LIVE</span>
                      )}
                    </div>
                    {m.reply?.evidence && (
                      <div className="flex flex-wrap gap-1">
                        {m.reply.evidence.map((e) => (
                          <span key={e} className="rounded border border-gray-700/60 bg-gray-800/50 px-1.5 py-0.5 text-[9px] tabular-nums text-gray-500">근거 · {e}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {m.reply?.action && (
                        <button
                          onClick={() => {
                            const result = m.reply!.action!.run()
                            setMsgs((prev) => [...prev, { role: 'ai', text: result || `✓ 실행했습니다: ${m.reply!.action!.label}` }])
                          }}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                        >
                          ⚡ {m.reply.action.label}
                        </button>
                      )}
                      {m.reply?.nav && (
                        <button
                          onClick={() => {
                            onNavigate(m.reply!.nav!.tab)
                            setOpen(false)
                          }}
                          className="rounded-md border border-gray-700 px-2.5 py-1 text-[10px] font-semibold text-gray-300 hover:text-gray-100"
                        >
                          {m.reply.nav.label} →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {/* 추천 질문 */}
          <div className="flex flex-wrap gap-1 border-t border-gray-800 px-3 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendRule(s)}
                className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-400 hover:border-sky-500/50 hover:text-sky-300"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex gap-2 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={hasKey ? '무엇이든 물어보세요… (실제 Claude)' : '운영 현황을 물어보세요…'}
              className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
            />
            <button onClick={send} className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500">→</button>
          </div>
          <div className="px-3 pb-2 text-center text-[9px] text-gray-600">
            추천 질문: 규칙 기반 실데이터 조회 · 자유 입력: {hasKey ? '실제 Claude(라이브)' : 'LLM 연결 시 실제 답변'}
          </div>
        </div>
      )}
    </>
  )
}
