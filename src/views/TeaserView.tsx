/** 단계별 데이터 통합 로드맵 — 화이트보드 아이데이션의 1·2·3차 구조 반영 */

interface Item {
  source: string
  desc: string
}

const PHASES: {
  n: string
  title: string
  frame: string
  status: 'live' | 'next' | 'vision'
  owner: string
  items: Item[]
}[] = [
  {
    n: '1차',
    title: '차량 데이터 — 지금 이 데모',
    frame: '자체 자산 + 공개 API·무료 국가 인프라 — 시 협조 없이 즉시 착수',
    status: 'live',
    owner: '오큐브 자체 자산 (운행기록계·운행기록 자동제출) + 공개 데이터·무료 측위 인프라',
    items: [
      { source: 'DTG', desc: '운행기록계 — 위험운전 탐지 · 기사별 운전습관 분석 · 사고위험 점수화' },
      { source: 'OBD/CAN', desc: '차량 자가진단 — 엔진·배터리·브레이크 이상탐지, 고장예측' },
      { source: 'BIS 실차 위치', desc: '공개 API 조회 연계 — 이 데모 지도에 실차 오버레이로 구동 중 · 대구 초정밀 버스(3초 스트림)와 동일 계열' },
      { source: 'RTK 초정밀 측위', desc: 'cm급 측위 — 단말 업그레이드 + 국가 무료 보정신호(NTRIP)로 1차 내 확장 · 차로 단위 정산검증·정차 품질 (DTG×RTK×BIS 삼중 교차검증)' },
      { source: '차고지/충전소', desc: '출고 가능성, 충전 스케줄, 예비차 운영' },
      { source: '날씨/행사/재난', desc: '폭우·폭염·행사·집회에 따른 수요·지연 예측' },
      { source: '정비시스템', desc: '고장이력, 부품수명, 정비비 예측' },
    ],
  },
  {
    n: '2차',
    title: '수요·시민 데이터',
    frame: 'iM유페이 컨소 자산으로 확보',
    status: 'next',
    owner: 'AFC(교통카드 요금정산) = 유페이 정산 채널 · 민원 = 대구시',
    items: [
      { source: 'AFC/교통카드', desc: '요금정산 데이터 — 정류장별 수요, 기·종점(OD), 환승, 요금·수입 분석' },
      { source: 'APC/승객계수', desc: '자동 승객계수 — 실시간 혼잡도, 승하차 인원, 좌석·입석 추정' },
      { source: '민원시스템', desc: '민원 자동분류, 증빙자료 자동매칭 — "당장 해결 or 정책 데이터"' },
    ],
  },
  {
    n: '3차',
    title: '도시 인프라 통합',
    frame: '대구시 협조 전제 — 도시 통합 레이어',
    status: 'vision',
    owner: 'BIS·BMS·ITS = 대구시 버스운영과 소관',
    items: [
      { source: 'DVR/CCTV', desc: '차량 영상기록 — 사고·승객 이상행동·문 끼임·차선이탈·보행자 위험 탐지' },
      { source: 'BIS 심층 연동', desc: '도착예측 고도화 협업 · 정류소 안내 인프라 양방향 연계 — 공개 API 조회는 1차 데모부터 사용 중' },
      { source: 'BMS', desc: '버스관리시스템 — 배차 최적화, 회차·우회·예비차 투입 추천 · 정산검증(배차기록 대조)은 1차 데모에서 DTG로 이미 로직 시연' },
      { source: 'ITS', desc: '지능형 교통체계 — 도로 정체, 신호, 사고, 공사 반영 운행 예측' },
    ],
  },
]

const STATUS_STYLE = {
  live: {
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    label: '● LIVE — 데모 구동 중',
    card: 'border-emerald-500/30',
  },
  next: {
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    label: 'PHASE 2',
    card: 'border-gray-800',
  },
  vision: {
    badge: 'bg-gray-700/40 text-gray-400 border-gray-700',
    label: 'PHASE 3',
    card: 'border-gray-800',
  },
} as const

export default function TeaserView() {
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-y-auto pr-1">
      <div className="px-1 pt-1">
        <h2 className="text-xl font-bold text-gray-100">데이터 통합 로드맵 — 버스 한 대가 도시 데이터 플랫폼이 된다</h2>
        <p className="mt-1 text-sm text-gray-500">
          단계 기준은 기술 난이도가 아니라 <b className="text-gray-300">데이터 접근성</b> — 자체 자산(1차) →
          컨소 자산(2차) → 도시 협조(3차). 단계가 쌓일수록 통합 데이터의 가치가 커지고, 대구시와의 협력
          영역도 함께 넓어진다.
        </p>
      </div>

      {/* 4-이해관계자 총괄 커버리지 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['🏛️', '대구시', '민원 증빙 자동매칭 · 정산 검증 · 노선 평가 · 탄소중립', '시티 대시보드'],
          ['🏢', '버스회사', 'AI 진단·예지정비 · 배차 권고 승인 · eTAS 자동제출', '운수사 관제'],
          ['👨‍✈️', '운전자', '공정 보정 점수 · 실시간 코칭 · 휴게/교대 알림', '기사 앱'],
          ['🧑‍🤝‍🧑', '승객', '도착 신뢰도 · 혼잡도 · 교통약자 · 민원 추적', '승객 앱'],
        ].map(([icon, who, what, screen]) => (
          <div key={who as string} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <div className="text-xl">{icon}</div>
            <div className="mt-1 text-sm font-bold text-gray-100">{who}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{what}</div>
            <div className="mt-1.5 text-[10px] font-semibold text-sky-400">→ {screen} (구현됨)</div>
          </div>
        ))}
      </div>

      {/* Agentic 운영 원칙 */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-bold text-sky-300">
          🤖 AI 제안 · 사람 승인 원칙 — "보는 시스템"이 아니라 "조치안을 만드는 시스템"
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-4 text-xs leading-relaxed text-gray-400">
          <div>
            모든 AI 조치는 <b className="text-gray-200">예측 → 조치안 생성 → 담당자 승인 → 실행 → 결과
            검증</b> 흐름을 따름. 배차 변경·정비 지시는 승인 필수, 기사 평가·징계·정산 확정은{' '}
            <b className="text-red-400">자동화 금지</b> — 공공 안전·행정의 최종 판단은 사람이 한다.
          </div>
          <div>
            모든 권고는 <b className="text-gray-200">근거 데이터 링크와 함께 제시</b>(설명가능성). 데모의
            배차 권고·작업지시·민원 증빙이 이 원칙의 실제 구현 — 기준키는{' '}
            <b className="text-gray-200">날짜+노선+방향+운행 순번+차량+기사+정류장+시간</b> (운행 단위
            데이터 모델).
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PHASES.map((p) => {
          const st = STATUS_STYLE[p.status]
          return (
            <div key={p.n} className={`flex flex-col rounded-xl border bg-gray-900/60 ${st.card}`}>
              <div className="border-b border-gray-800 px-4 py-3">
                <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold ${st.badge}`}>
                  {st.label}
                </span>
                <div className="mt-2 text-base font-bold text-gray-100">
                  {p.n} · {p.title}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">{p.frame}</div>
              </div>
              <div className={`flex-1 space-y-2 px-4 py-3 ${p.status === 'vision' ? 'opacity-70' : ''}`}>
                {p.items.map((it) => (
                  <div key={it.source} className="rounded-lg bg-gray-800/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-tight text-sky-400">{it.source}</span>
                      {p.status !== 'live' && <span className="text-[10px] text-gray-600">🔒</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{it.desc}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-800 px-4 py-2.5 text-[10px] text-gray-600">{p.owner}</div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-4">
        <div className="text-sm font-bold text-violet-300">💡 선순환 구조 (도입 전 → 후)</div>
        <div className="mt-1.5 text-xs leading-relaxed text-gray-400">
          현황: 차량(DTG·OBD)과 운행(BIS·BMS·ITS) 데이터가 서로 연결되지 않음 — 민원은 감으로 처리, 정책은 데이터 없이 수립.
          <br />
          통합 시: <b className="text-gray-200">민원 → 당장 해결 or 정책을 위한 데이터</b>. 운행할수록 데이터가
          쌓이고, 데이터가 쌓일수록 예측이 정확해지고, 예측이 정확할수록 시민 체감·비용 절감이 커지는 구조.
        </div>
      </div>
    </div>
  )
}
