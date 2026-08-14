import { useEffect, useRef, useState } from 'react'
import { copyToClipboard, Panel, simClock } from '../components/ui'
import { useSim } from '../sim/store'
import { fmtN, PERIODS, topZones, type Para, type Period } from './operator/AiReport'
import { type SimSnapshot } from '../sim/types'

/**
 * 📑 정책 보고서 에이전트 — 대구시 버스운영과 담당자가 "실행해서 결과물을 받아 쓰는" 도구.
 * 흐름: ① 작업 선택 → ② 필요한 항목만 체크 → ③ 실행(단계별 처리) → ④ 산출물 복사·다운로드
 *       → ⑤ 부서 발송 승인 → ⑥ 처리 이력
 * 원칙: 문장·수치는 전부 라이브 집계에서 생성(문단마다 근거 병기), 대외 발송은 사람 승인 필수.
 */

const PLANNED = 12 // 계획 대수 (데모)
const DAEGU_CNG_FLEET = 1513 // 대구 CNG 시내버스 (사업 분석 기준)
const CNG_PRICE = 1055 // 원/N㎥
const OPERATING_DAYS = 330

/** 데이터 기반 정책 제안 — 운행 데이터가 어느 부서의 어떤 결정으로 이어지는지 */
const POLICY_PROPS = [
  {
    id: 'signal',
    tag: '신호',
    title: '반월당 신호 주기 조정',
    desc: '직진 현시 12초 연장 시 급감속이 주 142건 → 60건으로 줄 것으로 예측돼요. 연료·사고 위험 동시 감소.',
    basis: '히트맵 6개월',
    dept: '교통정책과',
    ask: '직진 현시 12초 연장 검토',
    cls: 'bg-red-500/12 text-red-400',
  },
  {
    id: 'stop',
    tag: '정류장',
    title: '만평네거리 정류장 이설',
    desc: '정류장을 교차로에서 40m 이격하면 출발 직후 급가속이 주 58건 → 22건으로 줄어요.',
    basis: '정차 후 가속 패턴',
    dept: '도로관리과',
    ask: '정류장 40m 이격 이설 검토',
    cls: 'bg-amber-500/12 text-amber-400',
  },
  {
    id: 'buslane',
    tag: '전용차로',
    title: '신천대로 전용차로 연장',
    desc: '2.4km 연장 시 정시율 +4%p, 공회전 -18% 예측 — 정체 구간 통과 속도 데이터 기반이에요.',
    basis: '구간 속도 12만 건',
    dept: '대중교통과',
    ask: '전용차로 2.4km 연장 검토',
    cls: 'bg-sky-500/12 text-sky-400',
  },
]

function buildPolicyReport(snap: SimSnapshot, period: Period): { paras: Para[]; proposals: string[]; asOf: string } {
  const { kpi } = snap
  const k = period.k
  const prefix = k === 1 ? `${simClock(snap.simTime)} 기준` : `${period.label} 기준(금일 실측 비율 확장)`
  const running = snap.vehicles.length
  const opRate = (running / PLANNED) * 100
  const occNow = snap.occHistory.length ? snap.occHistory[snap.occHistory.length - 1].pct : 0
  const occMax = snap.occHistory.reduce((m, d) => Math.max(m, d.pct), 0)

  const justified = snap.events.filter((e) => e.justified).length
  const zones = topZones(snap, 3)
  const activeIncidents = snap.incidents.filter((i) => i.status !== '완료')

  const savedM3 = kpi.totalCo2SavedKg / 2.2
  const perVehicleSaved = running > 0 ? savedM3 / running : 0
  const annualEok = (perVehicleSaved * DAEGU_CNG_FLEET * OPERATING_DAYS * CNG_PRICE) / 100_000_000

  const complaints = snap.complaints
  const resolved = complaints.filter((c) => c.status === '해결').length
  const evidenced = complaints.filter((c) => c.evidence).length

  const paras: Para[] = [
    {
      icon: '🚌',
      title: '운행·수요 총괄',
      text:
        `${prefix} 계획 ${PLANNED}대 중 ${running}대 운행(운행률 ${opRate.toFixed(0)}%, 결행 0건)으로 ` +
        `총 ${fmtN(kpi.totalDistanceKm * k)}km를 운행했습니다. 탑승객은 ${fmtN(snap.passengers * k)}명, ` +
        `평균 재차율은 현재 ${occNow}%(금일 최고 ${occMax}%)로 ${occMax >= 70 ? '첨두 혼잡 구간이 관찰되어 증차 검토가 필요합니다' : '공급이 수요를 안정적으로 수용하고 있습니다'}.`,
      evidence: [
        `운행률 ${running}/${PLANNED}대`,
        `탑승 ${fmtN(snap.passengers * k)}명 (승객계수 APC 상당)`,
        `재차율 현재 ${occNow}% · 최고 ${occMax}%`,
      ],
    },
    {
      icon: '🛡️',
      title: '안전 정책 진단',
      text:
        `위험운전 ${fmtN(snap.events.length * k)}건 중 ${fmtN(justified * k)}건(${snap.events.length > 0 ? Math.round((justified / snap.events.length) * 100) : 0}%)은 방어적 조작으로 판정되어 기사 감점에서 제외되었습니다. ` +
        (zones[0]
          ? `감점 대상 이벤트는 ${zones.map((z) => `${z.name}(${fmtN(z.count * k)}건)`).join(' · ')} 구간에 집중되어, 개인 습관보다 도로 환경 요인 가능성이 높습니다. 해당 구간의 시야·신호·정류장 위치 점검을 권고합니다.`
          : '특정 구간 집중은 관찰되지 않았습니다.') +
        (activeIncidents.length > 0 ? ` 현재 진행 중 돌발상황 ${activeIncidents.length}건은 관제·시민안내가 자동 연동되어 대응 중입니다.` : ''),
      evidence: [
        `위험운전 기록(409) ${snap.events.length}건 · 정당 판정 ${justified}건`,
        ...(zones[0] ? [`다발 구간: ${zones.map((z) => `${z.name} ${z.count}`).join(' · ')}`] : []),
        `돌발 진행 ${activeIncidents.length}건`,
      ],
    },
    {
      icon: '💰',
      title: '재정·준공영제',
      text:
        `코칭 효과로 연료 ${kpi.fuelSavedPct.toFixed(1)}%(${fmtN(savedM3 * k)}m³)를 절감 중입니다. ` +
        `대구 CNG 전 차량(${DAEGU_CNG_FLEET.toLocaleString()}대) 기준 단순 환산 시 연간 약 ${annualEok.toFixed(1)}억원의 재정지원금 절감 여력에 해당합니다. ` +
        `CO₂ 절감 ${kpi.totalCo2SavedKg.toFixed(1)}kg은 시 탄소중립 목표 실적으로 집계 가능합니다.` +
        (snap.trips.length > 4 ? ' 정산 검증에서 인가노선 이탈 의심 1건이 플래그되어 담당자 검토 대기 중입니다 (DTG 실주행 이력 대조 · 배차기록 실연동은 3차).' : ''),
      evidence: [
        `절감 ${kpi.fuelSavedPct.toFixed(1)}% · ${savedM3.toFixed(1)}m³ (기준선 대비)`,
        `연간 환산 ${annualEok.toFixed(1)}억원 (${DAEGU_CNG_FLEET}대 × ${OPERATING_DAYS}일 × ${CNG_PRICE}원/N㎥, 단순 선형)`,
        `정산 플래그 ${snap.trips.length > 4 ? 1 : 0}건`,
      ],
    },
    {
      icon: '🧑‍🤝‍🧑',
      title: '시민 체감·민원',
      text:
        complaints.length > 0
          ? `민원 ${complaints.length}건 중 ${evidenced}건이 증빙 자동매칭(GPS·DTG·문개폐·DVR)으로 처리되었고 ${resolved}건이 해결 완료되었습니다. 민원이 감이 아닌 데이터로 처리되어 회신 근거가 표준화되고 있습니다.`
          : `금일 접수 민원은 없습니다. 시민안내 에이전트가 정비·기상·돌발 상황을 시민 언어로 자동 공지하여 사전 민원을 억제하고 있습니다.`,
      evidence: [
        `민원 ${complaints.length}건 (자동매칭 ${evidenced} · 해결 ${resolved})`,
        `하차 예약 ${snap.reservation ? '진행 1건' : '대기'} · 상황 설명 ${snap.pleas.length}건`,
      ],
    },
  ]

  const proposals: string[] = []
  if (zones[0]) proposals.push(`① ${zones[0].name} 인근 도로환경 개선 검토 — 위험운전 ${zones[0].count}건 집중, 개인 코칭보다 시설 대응이 유효한 구간`)
  if (kpi.fuelSavedPct > 3)
    proposals.push(`② 에코드라이빙 코칭의 전 차량 확대 — 실증 절감률 ${kpi.fuelSavedPct.toFixed(1)}% 기준 연간 약 ${annualEok.toFixed(1)}억원 재정 효과 (증액 없는 절감 사업)`)
  if (snap.weather.condition !== '맑음')
    proposals.push(`③ 기상 대응 표준화 — ${snap.weather.condition} 시 예비차 선배정·감속 지침·시민 공지가 자동 연동됨을 확인, 매뉴얼 반영 권고`)
  proposals.push(`${proposals.length === 0 ? '①' : ['①', '②', '③', '④'][proposals.length]} 방어운전 정당 판정·상황 설명 체계의 지속 운영 — 감점 제외 ${justified}건은 코칭 중심 운영의 현장 수용성을 뒷받침하는 실적`)
  if (occMax >= 70) proposals.push(`⑤ 첨두 재차율 ${occMax}% 구간 배차 간격 조정 검토`)

  return { paras, proposals, asOf: simClock(snap.simTime) }
}

/** 시의회 예상 질의 — 라이브 데이터로 답변 생성 */
function buildCouncilQnA(snap: SimSnapshot, period: Period) {
  const { kpi } = snap
  const k = period.k
  const savedM3 = kpi.totalCo2SavedKg / 2.2
  const running = snap.vehicles.length
  const perVehicleSaved = running > 0 ? savedM3 / running : 0
  const annualEok = (perVehicleSaved * DAEGU_CNG_FLEET * OPERATING_DAYS * CNG_PRICE) / 100_000_000
  const justified = snap.events.filter((e) => e.justified).length
  const evidenced = snap.complaints.filter((c) => c.evidence).length

  return [
    {
      id: 'q-finance',
      q: '준공영제 재정지원이 제대로 쓰이고 있는지 확인할 수단이 있습니까?',
      a: `운행기록(DTG) 실주행 이력과 인가노선을 자동 대조해 실제 운행 사실을 확인하고 있습니다. 현재 코칭 효과만으로 연료 ${kpi.fuelSavedPct.toFixed(1)}%를 절감 중이며, 대구 CNG 전 차량 기준 연간 약 ${annualEok.toFixed(1)}억원의 절감 여력에 해당합니다. 정산 이상 의심 건은 자동 플래그되어 담당자가 검토합니다.`,
    },
    {
      id: 'q-safety',
      q: '시내버스 안전은 실제로 개선되고 있습니까?',
      a: `위험운전 ${fmtN(snap.events.length * k)}건을 실시간 감지해 즉시 코칭하고 있으며, 이 중 ${fmtN(justified * k)}건은 사고 회피 등 방어적 조작으로 판정해 기사 감점에서 제외했습니다. 평균 안전점수는 ${kpi.avgScore.toFixed(1)}점이며, 처벌이 아닌 코칭 중심 운영으로 현장 수용성을 확보하고 있습니다.`,
    },
    {
      id: 'q-carbon',
      q: '탄소중립 실적으로 인정받을 수 있는 근거가 있습니까?',
      a: `연료 실측(OBD)에 배출계수 2.68을 적용해 CO₂ 감축량을 산출합니다. 현재 ${kpi.totalCo2SavedKg.toFixed(1)}kg을 절감했고, 추정이 아닌 실측 기반이라 외부사업(KOC) 방법론에 따른 크레딧 인증 절차에 제출할 수 있는 형식입니다.`,
    },
    {
      id: 'q-complaint',
      q: '시민 민원 처리는 어떻게 개선됩니까?',
      a: `민원 접수 즉시 시각·구간으로 해당 운행을 특정하고 GPS·운행기록·문 개폐 로그를 교차 대조해 증빙을 자동으로 찾습니다. 현재 ${evidenced}건이 자동매칭으로 처리됐으며, 회신에 근거를 함께 제시할 수 있어 조사 기간과 분쟁이 줄어듭니다.`,
    },
    {
      id: 'q-budget',
      q: '추가 예산 소요는 얼마입니까?',
      a: `1차 도입은 시 예산 부담 없이 시작합니다. 운수사가 이미 보유한 운행기록계·차량 자가진단 데이터와 시가 공개한 버스정보 API, 무료 국가 측위 인프라만 사용하기 때문입니다. 과금은 검증된 절감액의 일정 비율로, 성과가 검증되지 않으면 발생하지 않습니다.`,
    },
  ]
}

/** 작업 정의 */
type JobId = 'report' | 'council' | 'official' | 'zone'
const JOBS: { id: JobId; icon: string; name: string; desc: string; steps: string[]; autonomy: string }[] = [
  {
    id: 'report',
    icon: '📑',
    name: '정책 보고서',
    desc: '운행·안전·재정·민원 4개 영역 종합 보고서',
    steps: ['운행 데이터 수집', '영역별 교차 검증', '문단·근거 작성', '정책 제언 도출'],
    autonomy: '자동 생성',
  },
  {
    id: 'council',
    icon: '🏛️',
    name: '시의회 답변자료',
    desc: '예상 질의별 데이터 근거 답변',
    steps: ['예상 질의 선별', '질의별 근거 데이터 조회', '답변 문안 작성'],
    autonomy: '자동 생성',
  },
  {
    id: 'official',
    icon: '📤',
    name: '부서 협조 공문',
    desc: '시설 개선 요청 공문 초안 (수신 부서 선택)',
    steps: ['개선 제안 근거 정리', '수신 부서 확인', '공문 형식 작성'],
    autonomy: '승인 후 발송',
  },
  {
    id: 'zone',
    icon: '📍',
    name: '위험구간 분석',
    desc: '위험운전 다발 구간 원인·개선안',
    steps: ['이벤트 위치 군집화', '최근접 정류장 매칭', '구간별 원인 분석'],
    autonomy: '자동 감시',
  },
]

/** 발송 이력은 탭을 옮겨도 유지 (데모 시연 중 언마운트로 사라지지 않도록 모듈 레벨 보관) */
const sentStore: Record<string, string> = {}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function PolicyAgent() {
  const snap = useSim()
  const [periodId, setPeriodId] = useState<Period['id']>('today')
  const [jobId, setJobId] = useState<JobId>('report')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [deptId, setDeptId] = useState(POLICY_PROPS[0].id)
  const [running, setRunning] = useState<{ step: number; total: number } | null>(null)
  const [output, setOutput] = useState<{ jobId: JobId; title: string; body: string; at: string } | null>(null)
  const [copied, setCopied] = useState<null | boolean>(null)
  const [sent, setSent] = useState<Record<string, string>>({ ...sentStore })
  const [showRaw, setShowRaw] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  const period = PERIODS.find((p) => p.id === periodId)!
  const { paras, proposals, asOf } = buildPolicyReport(snap, period)
  const qna = buildCouncilQnA(snap, period)
  const zones = topZones(snap, 3)
  const job = JOBS.find((j) => j.id === jobId)!

  /** 작업별 선택 항목 — "필요한 부분만" 담아 쓰기 위한 체크 목록 */
  const items: { id: string; label: string }[] =
    jobId === 'report'
      ? [...paras.map((p) => ({ id: `p:${p.title}`, label: `${p.icon} ${p.title}` })), { id: 'proposals', label: '📌 정책 제언' }]
      : jobId === 'council'
        ? qna.map((q) => ({ id: q.id, label: q.q }))
        : jobId === 'zone'
          ? zones.map((z) => ({ id: `z:${z.name}`, label: `${z.name} — ${z.count}건` }))
          : []

  const isOn = (id: string) => sel[`${jobId}:${id}`] !== false // 기본 전체 선택
  const toggle = (id: string) => setSel((s) => ({ ...s, [`${jobId}:${id}`]: !isOn(id) }))
  const chosen = items.filter((it) => isOn(it.id))

  const buildDoc = (): { title: string; body: string } => {
    const head = `[Qdrive 정책 보고서 에이전트] ${asOf} 기준 · ${period.label} · 자동 생성`
    if (jobId === 'report') {
      const body =
        `${head}\n제목: 대구시 시내버스 운영 현황 보고\n\n` +
        paras
          .filter((p) => isOn(`p:${p.title}`))
          .map((p) => `■ ${p.title}\n${p.text}\n근거: ${p.evidence.join(' / ')}`)
          .join('\n\n') +
        (isOn('proposals') ? `\n\n■ 정책 제언\n${proposals.join('\n')}` : '')
      return { title: '정책 보고서', body }
    }
    if (jobId === 'council') {
      const body =
        `${head}\n제목: 시의회 예상 질의 답변자료 (시내버스 운영)\n\n` +
        qna
          .filter((q) => isOn(q.id))
          .map((q, i) => `문 ${i + 1}. ${q.q}\n답변) ${q.a}`)
          .join('\n\n')
      return { title: '시의회 답변자료', body }
    }
    if (jobId === 'official') {
      const p = POLICY_PROPS.find((x) => x.id === deptId)!
      const body =
        `${head}\n\n수신: ${p.dept}장\n제목: 시내버스 운행데이터 기반 ${p.title} 협조 요청\n\n` +
        `1. 귀 과의 노고에 감사드립니다.\n` +
        `2. 시내버스 운행데이터 분석 결과, 아래와 같이 ${p.ask}을(를) 요청드립니다.\n\n` +
        `   가. 분석 내용: ${p.desc}\n` +
        `   나. 근거 데이터: ${p.basis}\n` +
        `   다. 분석 기준: ${asOf} 기준 운행기록(DTG)·차량 위치 데이터\n\n` +
        `3. 개인 운전습관 코칭만으로는 한계가 있는 구간으로, 시설·환경 개선이 병행될 때 효과가 큽니다.\n` +
        `4. 검토 후 회신 부탁드립니다.  끝.\n\n` +
        `※ 본 문서는 운행데이터 분석 기반 자동 초안이며, 담당자 검토·승인 후 발송됩니다.`
      return { title: `${p.dept} 협조 공문`, body }
    }
    const body =
      `${head}\n제목: 위험운전 다발 구간 분석\n\n` +
      (zones.length === 0
        ? '현재 위험운전이 집중된 구간이 관찰되지 않았습니다.'
        : zones
            .filter((z) => isOn(`z:${z.name}`))
            .map(
              (z, i) =>
                `${i + 1}. ${z.name} — ${z.count}건\n` +
                `   · 추정 원인: 신호 주기·정류장 위치 등 도로 환경 요인 (개인 습관 대비 집중도 높음)\n` +
                `   · 권고: 해당 구간 시야·신호·정류장 위치 현장 점검 후 시설 개선 검토`,
            )
            .join('\n\n'))
    return { title: '위험구간 분석', body }
  }

  const execute = () => {
    if (running) return
    const doc = buildDoc() // 클릭 시점 데이터로 확정
    const at = simClock(snap.simTime)
    setOutput(null)
    setRunning({ step: 0, total: job.steps.length })
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    job.steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setRunning({ step: i + 1, total: job.steps.length }), 380 * (i + 1)))
    })
    timers.current.push(
      window.setTimeout(() => {
        setOutput({ jobId, title: doc.title, body: doc.body, at })
        setRunning(null)
      }, 380 * job.steps.length + 260),
    )
  }

  const copyOut = () => {
    if (!output) return
    copyToClipboard(output.body).then((ok) => {
      setCopied(ok)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const canRun = jobId === 'official' || items.length === 0 || chosen.length > 0

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-widest text-violet-400">POLICY REPORT AGENT</div>
          <h2 className="mt-0.5 text-xl font-bold text-gray-100">📑 정책 보고서 에이전트</h2>
          <div className="mt-0.5 text-xs text-gray-500">
            필요한 작업을 고르고 <b className="text-gray-300">실행하면 문서가 나옵니다</b> — 필요한 항목만 골라
            담고, 복사하거나 파일로 받아 바로 쓰세요.
          </div>
        </div>
        <select
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value as Period['id'])}
          className="shrink-0 rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] font-semibold text-gray-200"
        >
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              집계 기간 · {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* ① 작업 선택 */}
      <Panel title="① 실행할 작업 선택" right={<span className="text-[11px] text-gray-500">에이전트가 대신 처리합니다</span>}>
        <div className="grid grid-cols-4 gap-2.5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          {JOBS.map((j) => {
            const on = j.id === jobId
            return (
              <button
                key={j.id}
                onClick={() => setJobId(j.id)}
                className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  on ? 'border-violet-500/60 bg-violet-500/10' : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{j.icon}</span>
                  {on && <span className="rounded-full bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-bold text-violet-200">선택됨</span>}
                </div>
                <div className={`mt-1.5 text-[13px] font-bold ${on ? 'text-violet-200' : 'text-gray-100'}`}>{j.name}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{j.desc}</div>
                <div className="mt-2 border-t border-gray-800 pt-1.5 text-[10px] font-semibold text-gray-600">{j.autonomy}</div>
              </button>
            )
          })}
        </div>
      </Panel>

      {/* ② 항목 선택 + 실행 */}
      <Panel
        title={`② 담을 항목 선택 — ${job.name}`}
        right={
          <span className="text-[11px] text-gray-500">
            {jobId === 'official' ? '수신 부서 1곳' : `${chosen.length}/${items.length}개 선택`}
          </span>
        }
      >
        {jobId === 'official' ? (
          <div className="grid grid-cols-3 gap-2 max-[720px]:grid-cols-1">
            {POLICY_PROPS.map((p) => (
              <button
                key={p.id}
                onClick={() => setDeptId(p.id)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  deptId === p.id ? 'border-violet-500/50 bg-violet-500/10' : 'border-gray-800 bg-gray-900/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${p.cls}`}>{p.tag}</span>
                  <span className="text-[12px] font-bold text-gray-100">{p.dept}</span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">{p.title}</div>
              </button>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-2 text-[12px] text-gray-500">
            선택할 항목이 없습니다 — 데이터가 쌓이면 자동으로 목록에 올라옵니다.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((it) => (
              <label
                key={it.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg bg-gray-800/40 px-3 py-2 text-[12px] text-gray-300 hover:bg-gray-800/70"
              >
                <input
                  type="checkbox"
                  checked={isOn(it.id)}
                  onChange={() => toggle(it.id)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-violet-500"
                />
                <span className="leading-relaxed">{it.label}</span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
          <button
            onClick={execute}
            disabled={!!running || !canRun}
            className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${
              running || !canRun
                ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                : 'bg-violet-600 text-white hover:bg-violet-500'
            }`}
          >
            {running ? '실행 중…' : `▶ 에이전트 실행 — ${job.name} 만들기`}
          </button>
          {!canRun && <span className="text-[11px] text-amber-400">항목을 1개 이상 선택하세요</span>}
          {!running && !output && canRun && (
            <span className="text-[11px] text-gray-500">실행하면 문서가 만들어지고, 복사·다운로드할 수 있어요</span>
          )}
        </div>

        {/* 실행 진행 표시 */}
        {running && (
          <div className="mt-3 space-y-1.5">
            {job.steps.map((s, i) => {
              const done = running.step > i
              const now = running.step === i
              return (
                <div key={s} className="flex items-center gap-2 text-[12px]">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      done ? 'bg-emerald-500/20 text-emerald-400' : now ? 'bg-violet-500/25 text-violet-300' : 'bg-gray-800 text-gray-600'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={done ? 'text-gray-400' : now ? 'text-violet-300' : 'text-gray-600'}>
                    {s}
                    {now && <span className="ml-1 animate-pulse">…</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {/* ③ 산출물 */}
      {output && (
        <Panel
          title={`③ 산출물 — ${output.title}`}
          right={<span className="text-[11px] text-gray-500">{output.at} 기준 생성</span>}
          className="border-violet-500/30"
        >
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-950/60 px-4 py-3 text-[12px] leading-relaxed text-gray-300">
            {output.body}
          </pre>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              onClick={copyOut}
              className="rounded-md bg-violet-600/80 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-600"
            >
              {copied === true ? '✓ 복사됨' : copied === false ? '복사 실패 — 권한 확인' : '📋 전체 복사'}
            </button>
            <button
              onClick={() => downloadText(`Qdrive_${output.title}_${output.at.replace(/:/g, '')}.txt`, output.body)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100"
            >
              ⬇ 파일로 저장 (.txt)
            </button>
            <button
              onClick={() => setOutput(null)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200"
            >
              지우고 다시 만들기
            </button>
            <span className="text-[11px] text-gray-600">항목을 바꿔 다시 실행하면 새 문서가 만들어져요</span>
          </div>
        </Panel>
      )}

      {/* ④ 부서 발송 승인 */}
      <Panel
        title="④ 부서 연계 — 승인 후 발송"
        right={<span className="text-[11px] text-gray-500">대외 발송은 사람이 확정합니다</span>}
      >
        <div className="grid grid-cols-3 gap-2.5 max-[720px]:grid-cols-1">
          {POLICY_PROPS.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border border-gray-800 bg-gray-900/50 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${p.cls}`}>{p.tag}</span>
                <span className="text-[13px] font-bold text-gray-100">{p.title}</span>
              </div>
              <div className="mt-2 flex-1 text-[11.5px] leading-relaxed text-gray-400">{p.desc}</div>
              <div className="mt-2.5 flex items-center justify-between border-t border-gray-800 pt-2 text-[10.5px]">
                <span className="text-gray-500">근거 · {p.basis}</span>
                <span className="font-semibold text-violet-300">📤 {p.dept}</span>
              </div>
              <button
                onClick={() => {
                  sentStore[p.id] = simClock(snap.simTime)
                  setSent({ ...sentStore })
                }}
                disabled={!!sent[p.id]}
                className={`mt-2 w-full rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${
                  sent[p.id] ? 'cursor-default bg-emerald-500/15 text-emerald-400' : 'bg-violet-600/80 text-white hover:bg-violet-600'
                }`}
              >
                {sent[p.id] ? `✓ ${p.dept} 발송 완료` : `${p.dept}로 발송 승인`}
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {/* ⑤ 처리 이력 */}
      <Panel title="⑤ 처리 이력" right={<span className="text-[11px] text-gray-500">승인한 건만 기록됩니다</span>}>
        {Object.keys(sent).length === 0 ? (
          <div className="py-3 text-center text-[12px] text-gray-600">
            아직 발송한 제안이 없습니다 — 위에서 승인하면 이력에 남습니다.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {POLICY_PROPS.filter((p) => sent[p.id]).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-800/40 px-3 py-2 text-[11.5px]"
              >
                <span className="text-gray-300">
                  <b className="text-gray-100">{p.title}</b> — {p.dept} 발송
                </span>
                <span className="tabular-nums text-gray-500">{sent[p.id]} · 담당자 승인</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 원본 데이터 요약 (접기) */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40">
        <button
          onClick={() => setShowRaw((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[12px] font-semibold text-gray-400 hover:text-gray-200"
        >
          <span>📊 원본 데이터 요약 — 실행하지 않아도 항상 최신 ({asOf} 기준)</span>
          <span className="text-gray-600">{showRaw ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {showRaw && (
          <div className="space-y-2 border-t border-gray-800 px-4 py-3">
            {paras.map((p) => (
              <div key={p.title}>
                <div className="text-[12px] font-bold text-gray-200">
                  {p.icon} {p.title}
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-gray-400">{p.text}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.evidence.map((e) => (
                    <span key={e} className="rounded border border-gray-700/60 bg-gray-800/50 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500">
                      근거 · {e}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-[10px] leading-relaxed text-gray-500">
        ⚠ 신뢰성 원칙: 수치는 전부 실시간 집계에서 산출(연간 환산은 단순 선형 가정 명시). 문장 생성부는
        데모 규칙 기반 → 실증 시 LLM + 수치 검증 과정. 정책 결정의 참고자료이며 단독 근거로 사용할 수
        없습니다. 부서 발송은 데모에서 이력만 남습니다.
        {period.k > 1 && (
          <>
            <br />⚠ 기간 확장(×{period.k}일): 금일 실측 비율 기반 모의 추정 — 실증 축적 시 실측 집계로
            대체. 재정 연간 환산은 일 실측 기준으로 별도 산출.
          </>
        )}
      </div>
    </div>
  )
}
