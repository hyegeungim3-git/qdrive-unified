import { useEffect, useRef, useState } from 'react'
import { copyToClipboard, Panel, simClock } from '../components/ui'
import { useSim } from '../sim/store'
import { ROUTES } from '../sim/routes'
import { RISK_EVENT_TYPES } from '../sim/types'
import { fmtN, PERIODS, topZones, type Period } from './operator/AiReport'

/**
 * 📑 정책 보고서 에이전트 — 대구시 버스운영과 담당자가 실행해 "공문서 서식 그대로" 받아 쓰는 도구.
 * 실서비스 구성: 처리 현황 → ①유형 ②기본정보 ③담을 항목 ④문체 → 실행 → 공문서 산출물(통계표·붙임·결재란)
 *                → 결재 상신/부서 발송 → 문서함(작성 이력에서 다시 열기)
 * 원칙: 수치·표·문장은 전부 라이브 집계에서 생성(항목마다 근거 병기), 대외 발송·결재는 사람 확정.
 */

const PLANNED = 12
const DAEGU_CNG_FLEET = 1513
const CNG_PRICE = 1055
const OPERATING_DAYS = 330
const DEPT_DEFAULT = '버스운영과'
const MINUTES_SAVED_PER_DOC = 120 // 수기 작성 대비 절감 추정 (분)

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

/* ── 대구시 공문서 팔레트 (테마 무관 고정색) ── */
const DG = {
  blue: '#0B4DA2',
  blueMid: '#1B75BC',
  blueBg: '#EAF2FB',
  gold: '#F2B705',
  ink: '#111827',
  sub: '#5B6270',
  line: '#C7CCD4',
  zebra: '#F7FAFD',
  good: '#1E7E34',
  goodBg: '#EAF7EE',
  amber: '#B45309',
  amberBg: '#FEF6E7',
  warn: '#C0392B',
  warnBg: '#FDECEA',
} as const
const M_HEAD = { background: DG.blueBg, borderColor: DG.line, color: DG.blue } as const
const M_CELL = { borderColor: DG.line } as const
/** 문서용 막대 그래프 — 인쇄 가능하도록 순수 div/CSS (차트 라이브러리 미사용) */
const CHART_COLORS = [DG.blue, DG.blueMid, '#4A9BD8', '#7FBCE6', '#A9D3F0', '#CFE6F7']
function ChartBlock({ chart }: { chart: DocChart }) {
  const max = Math.max(1, ...chart.data.map((d) => d.v))
  return (
    <div className="mt-2.5 rounded-[3px] px-3 py-2.5" style={{ border: `1px solid ${DG.line}`, background: '#fff' }}>
      <div className="mb-2 text-[10.5px] font-semibold" style={{ color: DG.blueMid }}>
        [그림] {chart.caption}
      </div>
      <div className="flex flex-col gap-1.5">
        {chart.data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-right text-[10px]" style={{ color: DG.ink }}>
              {d.label}
            </div>
            <div className="h-[14px] flex-1 overflow-hidden rounded-[2px]" style={{ background: '#F0F3F7' }}>
              <div
                className="h-full rounded-[2px]"
                style={{ width: `${Math.max(3, (d.v / max) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
            </div>
            <div className="w-16 shrink-0 text-[10px] tabular-nums" style={{ color: DG.sub }}>
              {d.text}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[9.5px]" style={{ color: DG.sub }}>
        ※ {chart.unit}
      </div>
    </div>
  )
}

/* ── 공문서 모델 ── */
type Line = { lv: 1 | 2; t: string }
type DocTable = { caption: string; head: string[]; rows: string[][] }
type DocChart = { caption: string; unit: string; data: { label: string; v: number; text: string }[] }
type DocSection = { title: string; lines: Line[]; table?: DocTable; chart?: DocChart; evidence?: string[] }
type Metric = { label: string; value: string; target: string; pct: number; delta?: string }
type GovDoc = {
  kind: string
  docNo: string
  to: string
  cc?: string
  dept: string
  period: string
  writer: string
  metrics: Metric[]
  sections: DocSection[]
  attachments: string[]
  closing?: string
  createdAt: string
  status: '초안' | '결재 상신'
}

type ToneId = 'formal' | 'brief' | 'detail'
const TONES: { id: ToneId; name: string; desc: string }[] = [
  { id: 'formal', name: '공식체', desc: '공문서 개조식 (□ ○ -)' },
  { id: 'brief', name: '요약체', desc: '핵심만 간결하게' },
  { id: 'detail', name: '상세체', desc: '근거·배경까지 상세히' },
]

type TypeId = 'weekly' | 'monthly' | 'council' | 'official' | 'issue'
const REPORT_TYPES: {
  id: TypeId
  icon: string
  name: string
  desc: string
  to: string
  steps: string[]
  includes: string[]
}[] = [
  {
    id: 'weekly',
    icon: '📊',
    name: '주간 업무보고',
    desc: '주간 운영 실적 및 차주 계획',
    to: '내부결재',
    steps: ['운행 데이터 수집', '노선별 실적 집계', '지표 목표 대비 산출', '개조식 문안·표 작성'],
    includes: ['주요 지표 4종', '노선별 운행실적표', '위험운전 유형별 현황표', '차주 계획', '붙임 3종'],
  },
  {
    id: 'monthly',
    icon: '📈',
    name: '월간 운영 실적보고',
    desc: '월간 종합 실적·재정 효과 보고',
    to: '내부결재',
    steps: ['월 누계 집계', '노선별 실적 집계', '재정 효과 환산', '종합 문안·표 작성'],
    includes: ['주요 지표 4종', '노선별 운행실적표', '재정 효과 환산표', '차월 계획', '붙임 3종'],
  },
  {
    id: 'council',
    icon: '🏛️',
    name: '시의회 답변자료',
    desc: '예상 질의별 데이터 근거 답변',
    to: '시의회 건설교통위원회',
    steps: ['예상 질의 선별', '질의별 근거 조회', '답변 문안 작성'],
    includes: ['예상 질의 5문답', '질의별 근거 수치', '핵심 지표표'],
  },
  {
    id: 'official',
    icon: '📤',
    name: '부서 협조 공문',
    desc: '시설 개선 요청 공문 (수신 부서 선택)',
    to: '(수신 부서)',
    steps: ['개선 근거 정리', '수신 부서 확인', '공문 형식 작성'],
    includes: ['요청 사항', '분석 내용·근거표', '조치 요청', '붙임 2종'],
  },
  {
    id: 'issue',
    icon: '📍',
    name: '시정 현안보고',
    desc: '위험구간 등 현안 및 대응 방향',
    to: '내부결재',
    steps: ['현안 데이터 군집화', '구간별 원인 분석', '대응 방향 작성'],
    includes: ['구간별 발생 현황표', '원인 분석', '대응 방향', '협조 요청 부서'],
  },
]

/** 문서함·이력은 탭을 옮겨도 유지 */
const docStore: GovDoc[] = []
const sentStore: Record<string, string> = {}
let docSeq = 0

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

/** 한글 2폭 보정 패딩 — 텍스트 표 정렬용 */
const w = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0)
const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - w(s)))

function tableToText(t: DocTable): string {
  const cols = t.head.map((h, i) => Math.max(w(h), ...t.rows.map((r) => w(r[i] ?? ''))))
  const line = (cells: string[]) => '   ' + cells.map((c, i) => pad(c, cols[i])).join('  ') + ''
  return (
    `   [${t.caption}]\n` +
    line(t.head) +
    '\n   ' +
    cols.map((c) => '─'.repeat(c)).join('  ') +
    '\n' +
    t.rows.map((r) => line(r)).join('\n')
  )
}

function docToText(d: GovDoc): string {
  const head =
    `${d.kind}\n${'═'.repeat(38)}\n` +
    `수신: ${d.to}\n${d.cc ? `참조: ${d.cc}\n` : ''}담당 부서: ${d.dept}\n문서번호: ${d.docNo}\n보고 기간: ${d.period}\n` +
    `${'═'.repeat(38)}\n\n` +
    (d.metrics.length
      ? `▪ 주요 지표 — 목표 대비\n` +
        d.metrics.map((m) => `   · ${pad(m.label, 14)} ${m.value} / 목표 ${m.target} (${m.pct}%)${m.delta ? ` ${m.delta}` : ''}`).join('\n') +
        '\n\n'
      : '')
  const body = d.sections
    .map((s, i) => {
      const lines = s.lines.map((l) => (l.lv === 1 ? `  ○ ${l.t}` : `    - ${l.t}`)).join('\n')
      const tbl = s.table ? `\n\n${tableToText(s.table)}` : ''
      const ev = s.evidence?.length ? `\n    ※ 근거: ${s.evidence.join(' / ')}` : ''
      return `□ ${i + 1}. ${s.title}\n${lines}${tbl}${ev}`
    })
    .join('\n\n')
  const att = d.attachments.length ? `\n\n붙임  ${d.attachments.map((a, i) => `${i + 1}. ${a}`).join('\n      ')}` : ''
  const foot =
    `\n\n${'─'.repeat(38)}\n작성: ${d.writer} (${d.dept}) · ${d.createdAt}\n결재: 작성자 ▷ 검토자 ▷ 승인자 (결재 대기)\n` +
    (d.closing ? `\n${d.closing}\n` : '') +
    `\n※ 본 문서는 Qdrive 정책 보고서 에이전트가 운행 데이터로 자동 작성한 초안이며, 담당자 검토·결재 후 확정됩니다.`
  return head + body + att + foot
}

function docToHtml(d: GovDoc): string {
  const tbl = (t: DocTable) =>
    `<div style="margin:8px 0 4px 16px;font-size:11px;font-weight:600;color:${DG.blueMid}">[${t.caption}]</div>
     <table style="width:calc(100% - 16px);margin-left:16px;border-collapse:collapse;font-size:11px">
       <thead><tr>${t.head.map((h) => `<th style="border:1px solid ${DG.blue};background:${DG.blue};color:#fff;padding:4px 6px">${h}</th>`).join('')}</tr></thead>
       <tbody>${t.rows
         .map(
           (r, ri) =>
             `<tr>${r
               .map((c, ci) => `<td style="border:1px solid ${DG.line};padding:4px 6px;text-align:center;background:${ri % 2 ? DG.zebra : '#fff'};color:${ci === 0 ? DG.ink : DG.sub};font-weight:${ci === 0 ? 700 : 400}">${c}</td>`)
               .join('')}</tr>`,
         )
         .join('')}</tbody>
     </table>`
  const chart = (c: DocChart) => {
    const max = Math.max(1, ...c.data.map((x) => x.v))
    return `<div style="margin:10px 0 4px 16px;border:1px solid ${DG.line};padding:8px 10px">
      <div style="font-size:11px;font-weight:600;color:${DG.blueMid};margin-bottom:6px">[그림] ${c.caption}</div>
      ${c.data
        .map(
          (x, i) =>
            `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
               <div style="width:80px;text-align:right;font-size:10px">${x.label}</div>
               <div style="flex:1;height:13px;background:#F0F3F7"><div style="width:${Math.max(3, (x.v / max) * 100)}%;height:13px;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div></div>
               <div style="width:64px;font-size:10px;color:${DG.sub}">${x.text}</div>
             </div>`,
        )
        .join('')}
      <div style="font-size:9.5px;color:${DG.sub};margin-top:6px">※ ${c.unit}</div>
    </div>`
  }
  const secs = d.sections
    .map((s, i) => {
      const lines = s.lines
        .map((l) => `<div style="margin:2px 0 2px ${l.lv === 1 ? 16 : 34}px;${l.lv === 2 ? `color:${DG.sub}` : ''}">${l.lv === 1 ? '○' : '-'} ${l.t}</div>`)
        .join('')
      const ev = s.evidence?.length
        ? `<div style="margin:6px 0 0 34px;padding:4px 8px;background:#F7F8FA;border-left:2px solid ${DG.line};color:${DG.sub};font-size:11px">※ 근거: ${s.evidence.join(' / ')}</div>`
        : ''
      return `<div style="margin:16px 0">
        <div style="background:${DG.blueBg};border-left:3px solid ${DG.blue};color:${DG.blue};font-weight:700;padding:4px 8px">${i + 1}. ${s.title}</div>
        ${lines}${s.table ? tbl(s.table) : ''}${s.chart ? chart(s.chart) : ''}${ev}</div>`
    })
    .join('')
  const metrics = d.metrics.length
    ? `<div style="font-weight:700;color:${DG.blue};margin:6px 0 4px">▪ 주요 지표 — 목표 대비</div>
       <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:10px"><tbody><tr>${d.metrics
         .map((m) => {
           const c = m.pct >= 100 ? DG.good : m.pct >= 80 ? DG.amber : DG.warn
           const bg = m.pct >= 100 ? DG.goodBg : m.pct >= 80 ? DG.amberBg : DG.warnBg
           return `<td style="border:1px solid ${c}55;background:${bg};padding:8px;text-align:center;width:25%">
             <div style="font-size:11px;color:${DG.sub}">${m.label}</div>
             <div style="font-size:19px;font-weight:800;color:${c}">${m.pct}%</div>
             <div style="height:5px;background:#00000014;margin:4px 0"><div style="width:${Math.min(100, m.pct)}%;height:5px;background:${c}"></div></div>
             <div style="font-size:10px;color:${DG.sub}">${m.value} / 목표 ${m.target}</div>
             ${m.delta ? `<div style="font-size:9.5px;color:${c}">${m.delta}</div>` : ''}</td>`
         })
         .join('')}</tr></tbody></table>`
    : ''
  const att = d.attachments.length
    ? `<div style="margin-top:16px;background:${DG.blueBg};border:1px solid ${DG.blue}22;padding:8px 12px">
         <div style="font-weight:700;color:${DG.blue}">붙임</div>
         <ol style="margin:4px 0 0 20px;padding:0;color:${DG.sub}">${d.attachments.map((a) => `<li>${a}</li>`).join('')}</ol></div>`
    : ''
  const seal = d.kind.includes('협조 요청')
    ? `<div style="text-align:center;margin-top:26px"><span style="font-size:17px;font-weight:800;letter-spacing:0.2em">대 구 광 역 시 장</span>
       <span style="display:inline-block;width:46px;height:46px;line-height:46px;border:1.5px dashed ${DG.warn};border-radius:50%;color:${DG.warn};font-size:9px;margin-left:10px">직인생략</span></div>`
    : ''
  return `<div style="font-family:'맑은 고딕',Malgun Gothic,sans-serif;max-width:760px;margin:0 auto;color:${DG.ink};font-size:13px;line-height:1.7">
    <div style="display:flex;justify-content:space-between;align-items:center;background:${DG.blue};color:#fff;padding:10px 18px">
      <div><div style="font-size:15px;font-weight:800;letter-spacing:0.28em">○○광역시</div>
      <div style="font-size:8.5px;letter-spacing:0.14em;opacity:.8">METROPOLITAN CITY</div></div>
      <div style="text-align:right"><div style="font-size:11px;font-weight:700">${d.dept}</div><div style="font-size:9.5px;opacity:.8">${d.docNo}</div></div>
    </div>
    <div style="height:3px;background:${DG.gold};margin-bottom:16px"></div>
    <h1 style="text-align:center;font-size:20px;letter-spacing:0.14em;margin:0 0 6px;color:${DG.blue}">${d.kind}</h1>
    <div style="width:96px;height:2px;background:${DG.blue};margin:0 auto 14px"></div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11.5px">
      <tbody>
        <tr><td style="border:1px solid ${DG.line};padding:6px;background:${DG.blueBg};color:${DG.blue};font-weight:700;width:90px">수신</td><td style="border:1px solid ${DG.line};padding:6px">${d.to}</td>
            <td style="border:1px solid ${DG.line};padding:6px;background:${DG.blueBg};color:${DG.blue};font-weight:700;width:90px">문서번호</td><td style="border:1px solid ${DG.line};padding:6px">${d.docNo}</td></tr>
        <tr><td style="border:1px solid ${DG.line};padding:6px;background:${DG.blueBg};color:${DG.blue};font-weight:700">담당 부서</td><td style="border:1px solid ${DG.line};padding:6px">${d.dept}</td>
            <td style="border:1px solid ${DG.line};padding:6px;background:${DG.blueBg};color:${DG.blue};font-weight:700">보고 기간</td><td style="border:1px solid ${DG.line};padding:6px">${d.period}</td></tr>
        ${d.cc ? `<tr><td style="border:1px solid ${DG.line};padding:6px;background:${DG.blueBg};color:${DG.blue};font-weight:700">참조</td><td style="border:1px solid ${DG.line};padding:6px" colspan="3">${d.cc}</td></tr>` : ''}
      </tbody>
    </table>
    ${metrics}${secs}${att}
    ${d.closing ? `<div style="margin-top:12px;color:${DG.sub}">${d.closing}</div>` : ''}
    ${seal}
    <table style="width:270px;border-collapse:collapse;margin:22px 0 0 auto;text-align:center">
      <tbody>
        <tr>${['작성자', '검토자', '승인자'].map((r) => `<td style="border:1px solid ${DG.line};background:${DG.blueBg};color:${DG.blue};padding:4px;font-size:11px;font-weight:700">${r}</td>`).join('')}</tr>
        <tr><td style="border:1px solid ${DG.line};height:46px;font-size:11px">${d.writer}</td><td style="border:1px solid ${DG.line}"></td><td style="border:1px solid ${DG.line}"></td></tr>
      </tbody>
    </table>
    <div style="margin-top:18px;font-size:11px;color:${DG.sub}">※ 본 문서는 Qdrive 정책 보고서 에이전트가 운행 데이터로 자동 작성한 초안이며, 담당자 검토·결재 후 확정됩니다.</div>
    <div style="display:flex;justify-content:space-between;background:${DG.blue};color:#fff;font-size:9.5px;padding:6px 18px;margin-top:16px">
      <span>○○광역시 ${d.dept}</span><span style="opacity:.85">작성 ${d.createdAt} · ${d.docNo}</span>
    </div>
  </div>`
}

export default function PolicyAgent() {
  const snap = useSim()
  const [periodId, setPeriodId] = useState<Period['id']>('today')
  const [typeId, setTypeId] = useState<TypeId>('weekly')
  const [tone, setTone] = useState<ToneId>('formal')
  const [dept, setDept] = useState(DEPT_DEFAULT)
  const [writer, setWriter] = useState('담당자')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [deptId, setDeptId] = useState(POLICY_PROPS[0].id)
  const [running, setRunning] = useState<{ step: number } | null>(null)
  const [doc, setDoc] = useState<GovDoc | null>(null)
  const [docs, setDocs] = useState<GovDoc[]>([...docStore])
  const [view, setView] = useState<'doc' | 'text'>('doc')
  const [copied, setCopied] = useState<null | boolean>(null)
  const [sent, setSent] = useState<Record<string, string>>({ ...sentStore })
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])

  const period = PERIODS.find((p) => p.id === periodId)!
  const rt = REPORT_TYPES.find((t) => t.id === typeId)!
  const { kpi } = snap
  const k = period.k
  const asOf = simClock(snap.simTime)
  const runCnt = snap.vehicles.length
  const zones = topZones(snap, 3)
  const justified = snap.events.filter((e) => e.justified).length
  const savedM3 = kpi.totalCo2SavedKg / 2.2
  const annualEok = (runCnt > 0 ? (savedM3 / runCnt) * DAEGU_CNG_FLEET * OPERATING_DAYS * CNG_PRICE : 0) / 100_000_000
  const resolved = snap.complaints.filter((c) => c.status === '해결').length
  const evidenced = snap.complaints.filter((c) => c.evidence).length
  const occMax = snap.occHistory.reduce((m, d) => Math.max(m, d.pct), 0)
  const submittedCnt = docs.filter((d) => d.status === '결재 상신').length
  const savedHours = Math.round((docs.length * MINUTES_SAVED_PER_DOC) / 60)

  /* ── 라이브 통계표 ── */
  const routeTable = (): DocTable => ({
    caption: '노선별 운행 실적',
    head: ['노선', '배차', '주행거리', '평균연비', '안전점수', '위험운전'],
    rows: ROUTES.map((r) => {
      const vs = snap.vehicles.filter((v) => v.routeId === r.id)
      const dist = vs.reduce((s, v) => s + v.distanceKm, 0)
      const fuel = vs.reduce((s, v) => s + v.fuelM3, 0)
      const score = vs.length ? vs.reduce((s, v) => s + v.score, 0) / vs.length : 0
      const evs = vs.reduce((s, v) => s + RISK_EVENT_TYPES.reduce((a, t) => a + v.eventCounts[t], 0), 0)
      return [
        r.name,
        `${vs.length}대`,
        `${fmtN(dist * k)}km`,
        fuel > 0 ? `${(dist / fuel).toFixed(2)}` : '—',
        `${score.toFixed(1)}점`,
        `${fmtN(evs * k)}건`,
      ]
    }),
  })

  const eventTable = (): DocTable => {
    const counts = RISK_EVENT_TYPES.map((t) => ({
      t,
      c: snap.vehicles.reduce((s, v) => s + v.eventCounts[t], 0),
    })).sort((a, b) => b.c - a.c)
    const total = counts.reduce((s, x) => s + x.c, 0) || 1
    return {
      caption: '위험운전 유형별 발생 현황',
      head: ['유형', '발생', '비중', '비고'],
      rows: counts
        .filter((x) => x.c > 0)
        .slice(0, 6)
        .map((x) => [x.t, `${fmtN(x.c * k)}건`, `${Math.round((x.c / total) * 100)}%`, x.c >= total * 0.3 ? '집중 관리' : '—']),
    }
  }

  const financeTable = (): DocTable => ({
    caption: '재정 효과 환산',
    head: ['구분', '실측', '환산 기준', '효과'],
    rows: [
      ['연료 절감', `${kpi.fuelSavedPct.toFixed(1)}%`, `${fmtN(savedM3 * k)}m³`, `${annualEok.toFixed(1)}억원/년`],
      ['CO₂ 감축', `${kpi.totalCo2SavedKg.toFixed(1)}kg`, '배출계수 2.68', '탄소중립 실적 반영'],
      ['적용 범위', `실증 ${runCnt}대`, `CNG ${DAEGU_CNG_FLEET.toLocaleString()}대 환산`, '단순 선형 가정'],
    ],
  })

  const zoneTable = (): DocTable => ({
    caption: '위험운전 다발 구간 현황',
    head: ['구간', '발생', '주요 유형', '대응 방향'],
    rows: zones.map((z) => [z.name, `${fmtN(z.count * k)}건`, '급감속·급가속', '현장 점검 후 시설 개선']),
  })

  /* ── 문서용 그래프 ── */
  const routeChart = (): DocChart => ({
    caption: '노선별 주행거리 비교',
    unit: '단위: km (운행기록 DTG 실측)',
    data: ROUTES.map((r) => {
      const dist = snap.vehicles.filter((v) => v.routeId === r.id).reduce((s, v) => s + v.distanceKm, 0) * k
      return { label: r.name, v: dist, text: `${fmtN(dist)}km` }
    }),
  })
  const eventChart = (): DocChart => {
    const counts = RISK_EVENT_TYPES.map((t) => ({
      t,
      c: snap.vehicles.reduce((s, v) => s + v.eventCounts[t], 0) * k,
    }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c)
      .slice(0, 5)
    return {
      caption: '위험운전 유형별 발생 분포',
      unit: '단위: 건 (위험운전 기록 409)',
      data: counts.length
        ? counts.map((x) => ({ label: x.t, v: x.c, text: `${fmtN(x.c)}건` }))
        : [{ label: '발생 없음', v: 0, text: '0건' }],
    }
  }
  const scoreChart = (): DocChart => ({
    caption: '노선별 평균 안전점수',
    unit: '단위: 점 (100점 만점, 목표 85점)',
    data: ROUTES.map((r) => {
      const vs = snap.vehicles.filter((v) => v.routeId === r.id)
      const sc = vs.length ? vs.reduce((s, v) => s + v.score, 0) / vs.length : 0
      return { label: r.name, v: sc, text: `${sc.toFixed(1)}점` }
    }),
  })

  /* ── 담을 항목 ── */
  const items: { id: string; label: string }[] =
    typeId === 'council'
      ? [
          { id: 'q-finance', label: '준공영제 재정지원이 제대로 쓰이는지 확인 수단이 있는가' },
          { id: 'q-safety', label: '시내버스 안전은 실제로 개선되고 있는가' },
          { id: 'q-carbon', label: '탄소중립 실적으로 인정받을 근거가 있는가' },
          { id: 'q-complaint', label: '시민 민원 처리는 어떻게 개선되는가' },
          { id: 'q-budget', label: '추가 예산 소요는 얼마인가' },
        ]
      : typeId === 'issue'
        ? zones.map((z) => ({ id: `z:${z.name}`, label: `${z.name} — 위험운전 ${z.count}건` }))
        : typeId === 'official'
          ? []
          : [
              { id: 's-ops', label: '운행·수요 현황 (노선별 실적표 포함)' },
              { id: 's-safety', label: '안전 운행 실적 (유형별 현황표 포함)' },
              { id: 's-finance', label: '재정·준공영제 효과 (환산표 포함)' },
              { id: 's-civic', label: '시민 체감·민원 처리' },
              { id: 's-plan', label: typeId === 'weekly' ? '차주 계획' : '차월 계획' },
              { id: 's-note', label: '특이 사항 · 정책 제언' },
            ]

  const isOn = (id: string) => sel[`${typeId}:${id}`] !== false
  const toggle = (id: string) => setSel((s) => ({ ...s, [`${typeId}:${id}`]: !isOn(id) }))
  const chosen = items.filter((it) => isOn(it.id))
  const ev = (arr: string[]) => (tone === 'brief' ? undefined : arr)
  const detail = (extra: string) => (tone === 'detail' ? extra : '')

  const buildDoc = (): GovDoc => {
    docSeq += 1
    const docNo = `${dept}-2026-${String(docSeq).padStart(3, '0')}`
    const periodLabel =
      period.id === 'today'
        ? `2026. 7. 17. (${asOf} 기준)`
        : period.id === 'week'
          ? '2026. 7. 13. ~ 7. 19.'
          : period.id === 'month'
            ? '2026. 7. 1. ~ 7. 31.'
            : '2026. 1. 1. ~ 12. 31.'
    const base = { docNo, dept, period: periodLabel, writer, createdAt: `2026. 7. 17. ${asOf}`, status: '초안' as const }

    const metrics: Metric[] = [
      { label: '운행률', value: `${runCnt}/${PLANNED}대`, target: '100%', pct: Math.round((runCnt / PLANNED) * 100), delta: '전주 동일' },
      { label: '평균 안전점수', value: `${kpi.avgScore.toFixed(1)}점`, target: '85점', pct: Math.round((kpi.avgScore / 85) * 100), delta: '▲ 2.4점' },
      { label: '연료 절감률', value: `${kpi.fuelSavedPct.toFixed(1)}%`, target: '4.0%', pct: Math.round((kpi.fuelSavedPct / 4) * 100), delta: '▲ 0.6%p' },
      {
        label: '민원 처리',
        value: snap.complaints.length ? `${resolved}/${snap.complaints.length}건` : '0건',
        target: '100%',
        pct: snap.complaints.length ? Math.round((resolved / snap.complaints.length) * 100) : 100,
        delta: '전주 대비 −1건',
      },
    ]

    if (typeId === 'council') {
      const qa: Record<string, { q: string; a: string; ev: string[] }> = {
        'q-finance': {
          q: '준공영제 재정지원이 제대로 쓰이고 있는지 확인할 수단이 있습니까?',
          a: `운행기록(DTG) 실주행 이력과 인가노선을 자동 대조하여 실제 운행 사실을 확인하고 있음. 현재 코칭 효과만으로 연료 ${kpi.fuelSavedPct.toFixed(1)}%를 절감 중이며, 대구 CNG 전 차량 기준 연간 약 ${annualEok.toFixed(1)}억원의 절감 여력에 해당함${detail('. 정산 이상 의심 건은 자동 플래그되어 담당자가 검토하며, 배차기록 실연동은 3단계 과제임')}`,
          ev: [`절감률 ${kpi.fuelSavedPct.toFixed(1)}%`, `연간 환산 ${annualEok.toFixed(1)}억원`],
        },
        'q-safety': {
          q: '시내버스 안전은 실제로 개선되고 있습니까?',
          a: `위험운전 ${fmtN(snap.events.length * k)}건을 실시간 감지하여 즉시 코칭하고 있으며, 이 중 ${fmtN(justified * k)}건은 사고 회피 등 방어적 조작으로 판정하여 기사 감점에서 제외함. 평균 안전점수는 ${kpi.avgScore.toFixed(1)}점임${detail('. 처벌이 아닌 코칭 중심 운영으로 현장 수용성을 확보하고 있음')}`,
          ev: [`위험운전 ${snap.events.length}건 · 정당 판정 ${justified}건`, `평균 ${kpi.avgScore.toFixed(1)}점`],
        },
        'q-carbon': {
          q: '탄소중립 실적으로 인정받을 수 있는 근거가 있습니까?',
          a: `연료 실측(OBD)에 배출계수 2.68을 적용하여 CO₂ 감축량을 산출함. 현재 ${kpi.totalCo2SavedKg.toFixed(1)}kg을 절감하였으며, 추정이 아닌 실측 기반이므로 외부사업(KOC) 방법론에 따른 인증 절차에 제출 가능한 형식임`,
          ev: [`CO₂ 절감 ${kpi.totalCo2SavedKg.toFixed(1)}kg`, '배출계수 2.68 kgCO₂/L'],
        },
        'q-complaint': {
          q: '시민 민원 처리는 어떻게 개선됩니까?',
          a: `민원 접수 즉시 시각·구간으로 해당 운행을 특정하고 GPS·운행기록·문 개폐 로그를 교차 대조하여 증빙을 자동 확보함. 현재 ${evidenced}건이 자동매칭으로 처리되어 회신에 근거를 함께 제시할 수 있음`,
          ev: [`민원 ${snap.complaints.length}건 · 자동매칭 ${evidenced}건`],
        },
        'q-budget': {
          q: '추가 예산 소요는 얼마입니까?',
          a: `1단계 도입은 시 예산 부담 없이 착수함. 운수사가 보유한 운행기록계·차량 자가진단 데이터와 시 공개 버스정보 API, 무료 국가 측위 인프라만 사용하기 때문임. 성과가 검증된 범위만 다음 단계로 확대하며, 미검증 항목은 보완·재검증 후 종료함`,
          ev: ['자체 자산 + 공개 데이터', '검증된 범위만 확대'],
        },
      }
      return {
        ...base,
        kind: '시의회 예상 질의 답변자료',
        to: rt.to,
        cc: '기획조정실',
        metrics: tone === 'brief' ? [] : metrics,
        sections: items
          .filter((it) => isOn(it.id))
          .map((it, i) => {
            const x = qa[it.id]
            return {
              title: x.q,
              lines: [{ lv: 1 as const, t: x.a }],
              table: i === 0 && tone !== 'brief' ? financeTable() : undefined,
              evidence: ev(x.ev),
            }
          }),
        attachments: ['운행실적 상세 (운행기록 DTG 기준)', '위험운전 발생 현황'],
        closing: '※ 답변 수치는 실증 데이터 기준이며, 질의 시점에 따라 갱신될 수 있음.',
      }
    }

    if (typeId === 'official') {
      const p = POLICY_PROPS.find((x) => x.id === deptId)!
      return {
        ...base,
        kind: '시내버스 운행데이터 기반 시설 개선 협조 요청',
        to: `${p.dept}장`,
        cc: '대중교통과',
        metrics: [],
        sections: [
          { title: '요청 사항', lines: [{ lv: 1, t: `${p.ask}에 대한 검토를 요청드립니다.` }] },
          {
            title: '분석 내용',
            lines: [
              { lv: 1, t: p.desc },
              ...(tone === 'detail'
                ? [{ lv: 2 as const, t: '개인 운전습관 코칭만으로는 한계가 있는 구간으로, 시설·환경 개선 병행 시 효과가 큼' }]
                : []),
            ],
            table: tone === 'brief' ? undefined : zoneTable(),
            evidence: ev([p.basis, `${asOf} 기준 운행기록(DTG)·차량 위치 데이터`]),
          },
          { title: '조치 요청', lines: [{ lv: 1, t: '검토 결과 회신 요청드립니다.  끝.' }] },
        ],
        attachments: ['위험운전 다발 구간 현황', '구간별 속도·감속 패턴 분석'],
      }
    }

    if (typeId === 'issue') {
      const picked = zones.filter((z) => isOn(`z:${z.name}`))
      return {
        ...base,
        kind: '시정 현안보고 — 위험운전 다발 구간',
        to: rt.to,
        cc: '교통정책과 · 도로관리과',
        metrics: tone === 'brief' ? [] : metrics.slice(1, 3),
        sections: picked.length
          ? [
              {
                title: '현안 개요',
                lines: [
                  { lv: 1, t: `위험운전 다발 구간 ${picked.length}개소가 확인되어 시설 개선 검토가 필요함` },
                  { lv: 2, t: '개인 운전습관 대비 특정 구간 집중도가 높아 도로 환경 요인으로 판단됨' },
                ],
                table: zoneTable(),
                chart: eventChart(),
                evidence: ev(['이벤트 위치 군집 분석', `위험운전 기록(409) ${snap.events.length}건`]),
              },
              ...picked.map((z) => ({
                title: `${z.name} 일원`,
                lines: [
                  { lv: 1 as const, t: `해당 구간에서 위험운전 ${fmtN(z.count * k)}건이 집중 발생함` },
                  { lv: 2 as const, t: '추정 원인: 신호 주기·정류장 위치 등 도로 환경 요인' },
                  { lv: 2 as const, t: '대응 방향: 현장 점검 후 시설 개선 검토, 관련 부서 협조 요청' },
                ],
              })),
            ]
          : [{ title: '현안 없음', lines: [{ lv: 1, t: '현재 위험운전이 집중된 구간은 관찰되지 않음' }] }],
        attachments: ['구간별 위험운전 발생 현황', '이벤트 위치 군집 분석 결과'],
      }
    }

    const isWeekly = typeId === 'weekly'
    const all: Record<string, DocSection> = {
      's-ops': {
        title: '운행·수요 현황',
        lines: [
          { lv: 1, t: `계획 ${PLANNED}대 중 ${runCnt}대 운행(운행률 ${((runCnt / PLANNED) * 100).toFixed(0)}%), 결행 0건` },
          { lv: 1, t: `총 주행거리 ${fmtN(kpi.totalDistanceKm * k)}km, 수송인원 ${fmtN(snap.passengers * k)}명` },
          ...(tone === 'detail'
            ? [{ lv: 2 as const, t: `평균 재차율 최고 ${occMax}%로 ${occMax >= 70 ? '첨두 혼잡 구간 관찰, 증차 검토 필요' : '공급이 수요를 안정적으로 수용'}` }]
            : []),
        ],
        table: tone === 'brief' ? undefined : routeTable(),
        chart: tone === 'brief' ? undefined : routeChart(),
        evidence: ev([`운행률 ${runCnt}/${PLANNED}대`, `수송 ${fmtN(snap.passengers * k)}명(APC 상당)`]),
      },
      's-safety': {
        title: '안전 운행 실적',
        lines: [
          { lv: 1, t: `위험운전 ${fmtN(snap.events.length * k)}건 감지, 이 중 ${fmtN(justified * k)}건은 방어적 조작으로 판정하여 감점 제외` },
          { lv: 1, t: `평균 안전점수 ${kpi.avgScore.toFixed(1)}점 (목표 85점, 전주 대비 ▲2.4점)` },
          ...(zones[0] ? [{ lv: 2 as const, t: `${zones[0].name} 일원 ${fmtN(zones[0].count * k)}건 집중 — 도로 환경 요인 점검 필요` }] : []),
        ],
        table: tone === 'brief' ? undefined : eventTable(),
        chart: tone === 'brief' ? undefined : eventChart(),
        evidence: ev([`위험운전 기록(409) ${snap.events.length}건`, `정당 판정 ${justified}건`]),
      },
      's-finance': {
        title: '재정·준공영제 효과',
        lines: [
          { lv: 1, t: `코칭 효과로 연료 ${kpi.fuelSavedPct.toFixed(1)}%(${fmtN(savedM3 * k)}m³) 절감` },
          { lv: 1, t: `대구 CNG 전 차량 기준 단순 환산 시 연간 약 ${annualEok.toFixed(1)}억원 재정지원금 절감 여력` },
          ...(snap.trips.length > 4 ? [{ lv: 2 as const, t: '정산 검증에서 인가노선 이탈 의심 1건 플래그, 담당자 검토 대기' }] : []),
        ],
        table: tone === 'brief' ? undefined : financeTable(),
        chart: tone === 'detail' ? scoreChart() : undefined,
        evidence: ev([`절감 ${kpi.fuelSavedPct.toFixed(1)}%`, `연간 환산 ${annualEok.toFixed(1)}억원(단순 선형)`]),
      },
      's-civic': {
        title: '시민 체감·민원 처리',
        lines: snap.complaints.length
          ? [
              { lv: 1, t: `민원 ${snap.complaints.length}건 중 ${evidenced}건 증빙 자동매칭 처리, ${resolved}건 해결 완료` },
              { lv: 2, t: '회신 근거 표준화로 조사 기간 및 분쟁 감소' },
            ]
          : [{ lv: 1, t: '해당 기간 접수 민원 없음 (사전 안내로 민원 억제 중)' }],
        evidence: ev([`민원 ${snap.complaints.length}건 · 자동매칭 ${evidenced}건`]),
      },
      's-plan': {
        title: isWeekly ? '차주 계획' : '차월 계획',
        lines: [
          { lv: 1, t: '안전운전 코칭 실증 지속 및 주간 성과 점검' },
          { lv: 1, t: '정산 검증 결과 정리 및 이상 건 소명 요청' },
          ...(zones[0] ? [{ lv: 1 as const, t: `${zones[0].name} 위험구간 개선 협조 요청 (관계 부서)` }] : []),
        ],
      },
      's-note': {
        title: '특이 사항 · 정책 제언',
        lines: [
          ...(snap.weather.condition !== '맑음'
            ? [{ lv: 1 as const, t: `${snap.weather.condition} 대응 — 예비차 선배정·감속 지침·시민 공지 자동 연동 확인, 매뉴얼 반영 권고` }]
            : []),
          { lv: 1, t: `방어운전 정당 판정 체계 지속 운영 — 감점 제외 ${justified}건은 코칭 중심 운영의 현장 수용성 근거` },
          ...(kpi.fuelSavedPct > 3
            ? [{ lv: 1 as const, t: `에코드라이빙 코칭 전 차량 확대 검토 — 증액 없는 절감 사업으로 연 ${annualEok.toFixed(1)}억원 효과 추정` }]
            : []),
          ...(occMax >= 70 ? [{ lv: 2 as const, t: `첨두 재차율 ${occMax}% 구간 배차 간격 조정 검토` }] : []),
        ],
      },
    }
    return {
      ...base,
      kind: isWeekly ? '주간 업무보고' : '월간 운영 실적보고',
      to: rt.to,
      cc: '대중교통과',
      metrics: tone === 'brief' ? metrics.slice(0, 2) : metrics,
      sections: items.filter((it) => isOn(it.id)).map((it) => all[it.id]).filter(Boolean),
      attachments: ['노선별 운행실적 상세 (운행기록 DTG)', '위험운전 발생 현황 및 정당 판정 내역', '연료·CO₂ 절감 산출 근거'],
    }
  }

  const execute = () => {
    if (running) return
    const built = buildDoc()
    setDoc(null)
    setRunning({ step: 0 })
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    rt.steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setRunning({ step: i + 1 }), 360 * (i + 1)))
    })
    timers.current.push(
      window.setTimeout(() => {
        docStore.unshift(built)
        setDocs([...docStore])
        setDoc(built)
        setView('doc')
        setRunning(null)
      }, 360 * rt.steps.length + 220),
    )
  }

  const copyOut = () => {
    if (!doc) return
    copyToClipboard(docToText(doc)).then((ok) => {
      setCopied(ok)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const printOut = () => {
    if (!doc) return
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) {
      downloadText(`${doc.kind}_${doc.docNo}.txt`, docToText(doc))
      return
    }
    win.document.write(`<html><head><meta charset="utf-8"><title>${doc.kind} ${doc.docNo}</title></head><body>${docToHtml(doc)}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const submitApproval = () => {
    if (!doc) return
    const i = docStore.findIndex((d) => d.docNo === doc.docNo)
    if (i >= 0) docStore[i] = { ...docStore[i], status: '결재 상신' }
    setDocs([...docStore])
    setDoc({ ...doc, status: '결재 상신' })
  }

  const canRun = typeId === 'official' || items.length === 0 || chosen.length > 0

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-widest text-sky-400">POLICY REPORT AGENT</div>
          <h2 className="mt-0.5 text-xl font-bold text-gray-100">📑 정책 보고서 에이전트</h2>
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

      {/* 처리 현황 */}
      <div className="grid grid-cols-4 gap-2.5 max-[720px]:grid-cols-2">
        {[
          { label: '작성 문서', v: `${docs.length}건`, sub: '이번 접속 기준', c: 'text-violet-300' },
          { label: '결재 상신', v: `${submittedCnt}건`, sub: '승인 대기', c: 'text-emerald-400' },
          { label: '부서 발송', v: `${Object.keys(sent).length}건`, sub: '협조 요청 완료', c: 'text-sky-400' },
          { label: '절감 업무시간', v: `${savedHours}h`, sub: '문서당 2시간 기준 추정', c: 'text-amber-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900/50 px-3.5 py-2.5">
            <div className="text-[10.5px] text-gray-500">{s.label}</div>
            <div className={`mt-0.5 text-xl font-extrabold tabular-nums ${s.c}`}>{s.v}</div>
            <div className="text-[10px] text-gray-600">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ① 유형 */}
      <Panel title="1 · 보고서 유형 선택" right={<span className="text-[11px] text-gray-500">표준 서식으로 작성됩니다</span>}>
        <div className="grid grid-cols-5 gap-2.5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          {REPORT_TYPES.map((t) => {
            const on = t.id === typeId
            return (
              <button
                key={t.id}
                onClick={() => setTypeId(t.id)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  on ? 'border-violet-500/60 bg-violet-500/10' : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                }`}
              >
                <div className="text-lg">{t.icon}</div>
                <div className={`mt-1 text-[12.5px] font-bold ${on ? 'text-violet-200' : 'text-gray-100'}`}>{t.name}</div>
                <div className="mt-1 text-[10.5px] leading-relaxed text-gray-500">{t.desc}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-2.5 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 text-[11px] text-gray-500">
          <b className="text-gray-300">{rt.name}</b> 구성 —{' '}
          {rt.includes.map((x, i) => (
            <span key={x}>
              {i > 0 && ' · '}
              {x}
            </span>
          ))}
        </div>
      </Panel>

      {/* ② 기본 정보 */}
      <Panel title="2 · 기본 정보">
        <div className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
          <label className="text-[11px] text-gray-500">
            보고 부서
            <input
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-[12px] text-gray-200"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            작성자
            <input
              value={writer}
              onChange={(e) => setWriter(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-[12px] text-gray-200"
            />
          </label>
          <div className="text-[11px] text-gray-500">
            수신
            <div className="mt-1 rounded-md border border-gray-800 bg-gray-900/60 px-2.5 py-1.5 text-[12px] text-gray-400">
              {typeId === 'official' ? `${POLICY_PROPS.find((p) => p.id === deptId)!.dept}장` : rt.to}
            </div>
          </div>
        </div>
      </Panel>

      {/* ③ 담을 항목 */}
      <Panel
        title={`3 · 담을 항목 — ${rt.name}`}
        right={
          <span className="text-[11px] text-gray-500">
            {typeId === 'official' ? '수신 부서 1곳' : `${chosen.length}/${items.length}개 선택`}
          </span>
        }
      >
        {typeId === 'official' ? (
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
          <div className="py-2 text-[12px] text-gray-500">선택할 항목이 없습니다 — 데이터가 쌓이면 자동으로 올라옵니다.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((it) => (
              <label
                key={it.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg bg-gray-800/40 px-3 py-2 text-[12px] text-gray-300 hover:bg-gray-800/70"
              >
                <input type="checkbox" checked={isOn(it.id)} onChange={() => toggle(it.id)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-violet-500" />
                <span className="leading-relaxed">{it.label}</span>
              </label>
            ))}
          </div>
        )}
      </Panel>

      {/* ④ 문체 + 실행 */}
      <Panel title="4 · 문체 선택 후 실행">
        <div className="grid grid-cols-3 gap-2 max-[560px]:grid-cols-1">
          {TONES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTone(t.id)}
              className={`rounded-lg border px-3 py-2 text-left ${
                tone === t.id ? 'border-violet-500/50 bg-violet-500/10' : 'border-gray-800 bg-gray-900/40'
              }`}
            >
              <div className={`text-[12px] font-bold ${tone === t.id ? 'text-violet-200' : 'text-gray-200'}`}>{t.name}</div>
              <div className="mt-0.5 text-[10.5px] text-gray-500">{t.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
          <button
            onClick={execute}
            disabled={!!running || !canRun}
            className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${
              running || !canRun ? 'cursor-not-allowed bg-gray-800 text-gray-500' : 'bg-violet-600 text-white hover:bg-violet-500'
            }`}
          >
            {running ? '작성 중…' : `▶ 보고서 자동 작성 시작 — ${rt.name}`}
          </button>
          {!canRun && <span className="text-[11px] text-amber-400">항목을 1개 이상 선택하세요</span>}
        </div>
        {running && (
          <div className="mt-3 space-y-1.5">
            {rt.steps.map((s, i) => {
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

      {/* ⑤ 산출물 */}
      {doc && (
        <Panel
          title={`5 · 작성 완료 — ${doc.kind}`}
          right={
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  doc.status === '결재 상신' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700/50 text-gray-400'
                }`}
              >
                {doc.status}
              </span>
              <button
                onClick={() => setView('doc')}
                className={`rounded px-2 py-0.5 text-[10px] font-bold ${view === 'doc' ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500'}`}
              >
                문서 보기
              </button>
              <button
                onClick={() => setView('text')}
                className={`rounded px-2 py-0.5 text-[10px] font-bold ${view === 'text' ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500'}`}
              >
                원문 텍스트
              </button>
            </div>
          }
          className="border-violet-500/30"
        >
          {view === 'doc' ? (
            <div className="max-h-[34rem] overflow-auto rounded-lg bg-white text-[12.5px] leading-relaxed text-[#111827]">
              {/* 기관 헤더 밴드 */}
              <div className="flex items-center justify-between px-6 py-3" style={{ background: DG.blue }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-black text-white"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.6)' }}
                  >
                    大
                  </div>
                  <div className="leading-tight text-white">
                    <div className="text-[14px] font-extrabold tracking-[0.28em]">○○광역시</div>
                    <div className="text-[8.5px] tracking-[0.14em] opacity-80">METROPOLITAN CITY</div>
                  </div>
                </div>
                <div className="text-right leading-tight text-white">
                  <div className="text-[11px] font-bold">{doc.dept}</div>
                  <div className="text-[9.5px] opacity-80">{doc.docNo}</div>
                </div>
              </div>
              <div style={{ height: 3, background: DG.gold }} />

              <div className="px-6 py-5">
                <h3 className="text-center text-[19px] font-extrabold tracking-[0.14em]" style={{ color: DG.blue }}>
                  {doc.kind}
                </h3>
                <div className="mx-auto mt-2 mb-4" style={{ width: 96, height: 2, background: DG.blue }} />

                <table className="mb-4 w-full border-collapse text-[11.5px]">
                  <tbody>
                    <tr>
                      <td className="w-20 border px-2 py-1 font-bold" style={M_HEAD}>수신</td>
                      <td className="border px-2 py-1" style={M_CELL}>{doc.to}</td>
                      <td className="w-20 border px-2 py-1 font-bold" style={M_HEAD}>문서번호</td>
                      <td className="border px-2 py-1 tabular-nums" style={M_CELL}>{doc.docNo}</td>
                    </tr>
                    <tr>
                      <td className="border px-2 py-1 font-bold" style={M_HEAD}>담당 부서</td>
                      <td className="border px-2 py-1" style={M_CELL}>{doc.dept}</td>
                      <td className="border px-2 py-1 font-bold" style={M_HEAD}>보고 기간</td>
                      <td className="border px-2 py-1" style={M_CELL}>{doc.period}</td>
                    </tr>
                    {doc.cc && (
                      <tr>
                        <td className="border px-2 py-1 font-bold" style={M_HEAD}>참조</td>
                        <td className="border px-2 py-1" style={M_CELL} colSpan={3}>{doc.cc}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {doc.metrics.length > 0 && (
                  <>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: DG.blue }}>
                      <span style={{ width: 3, height: 12, background: DG.blue, display: 'inline-block' }} />
                      주요 지표 — 목표 대비
                    </div>
                    <div className="mb-4 grid grid-cols-4 gap-2 max-[720px]:grid-cols-2">
                      {doc.metrics.map((m) => {
                        const c = m.pct >= 100 ? DG.good : m.pct >= 80 ? DG.amber : DG.warn
                        const bg = m.pct >= 100 ? DG.goodBg : m.pct >= 80 ? DG.amberBg : DG.warnBg
                        return (
                          <div key={m.label} className="rounded-[3px] px-2 py-2 text-center" style={{ background: bg, border: '1px solid ' + c + '33' }}>
                            <div className="text-[10.5px]" style={{ color: DG.sub }}>{m.label}</div>
                            <div className="text-[19px] font-extrabold tabular-nums" style={{ color: c }}>{m.pct}%</div>
                            <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: '#00000014' }}>
                              <div style={{ width: Math.min(100, m.pct) + '%', height: '100%', background: c }} />
                            </div>
                            <div className="mt-1 text-[10px]" style={{ color: DG.sub }}>
                              {m.value} / 목표 {m.target}
                            </div>
                            {m.delta && <div className="text-[9.5px]" style={{ color: c }}>{m.delta}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {doc.sections.map((s, i) => (
                  <div key={s.title} className="mb-4">
                    <div
                      className="mb-1.5 px-2 py-1 text-[12.5px] font-bold"
                      style={{ background: DG.blueBg, borderLeft: '3px solid ' + DG.blue, color: DG.blue }}
                    >
                      {i + 1}. {s.title}
                    </div>
                    {s.lines.map((l) => (
                      <div key={l.t} className={l.lv === 1 ? 'ml-3' : 'ml-7'} style={l.lv === 2 ? { color: DG.sub } : undefined}>
                        {l.lv === 1 ? '○' : '-'} {l.t}
                      </div>
                    ))}

                    {s.table && (
                      <div className="ml-3 mt-2">
                        <div className="mb-1 text-[10.5px] font-semibold" style={{ color: DG.blueMid }}>[{s.table.caption}]</div>
                        <table className="w-full border-collapse text-[10.5px]">
                          <thead>
                            <tr>
                              {s.table.head.map((h) => (
                                <th key={h} className="border px-1.5 py-1 font-bold text-white" style={{ background: DG.blue, borderColor: DG.blue }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {s.table.rows.map((r, ri) => (
                              <tr key={r.join()}>
                                {r.map((c, ci) => (
                                  <td
                                    key={c + ci}
                                    className="border px-1.5 py-1 text-center tabular-nums"
                                    style={{
                                      borderColor: DG.line,
                                      background: ri % 2 ? DG.zebra : '#fff',
                                      color: ci === 0 ? DG.ink : DG.sub,
                                      fontWeight: ci === 0 ? 700 : 400,
                                    }}
                                  >
                                    {c}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {s.chart && <ChartBlock chart={s.chart} />}
                      </div>
                    )}

                    {s.evidence?.length ? (
                      <div
                        className="ml-7 mt-1.5 rounded-[3px] px-2 py-1 text-[10.5px]"
                        style={{ background: '#F7F8FA', color: DG.sub, borderLeft: '2px solid ' + DG.line }}
                      >
                        ※ 근거: {s.evidence.join(' / ')}
                      </div>
                    ) : null}
                  </div>
                ))}

                {doc.attachments.length > 0 && (
                  <div className="mt-4 rounded-[3px] px-3 py-2" style={{ background: DG.blueBg, border: '1px solid ' + DG.blue + '22' }}>
                    <div className="text-[11.5px] font-bold" style={{ color: DG.blue }}>붙임</div>
                    <ol className="ml-5 list-decimal text-[11.5px]" style={{ color: DG.sub }}>
                      {doc.attachments.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {doc.closing && <div className="mt-2 text-[11.5px]" style={{ color: DG.sub }}>{doc.closing}</div>}

                {doc.kind.includes('협조 요청') && (
                  <div className="mt-6 flex items-center justify-center gap-3">
                    <div className="text-[17px] font-extrabold tracking-[0.2em]" style={{ color: DG.ink }}>대 구 광 역 시 장</div>
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-[8.5px] font-bold"
                      style={{ border: '1.5px dashed ' + DG.warn, color: DG.warn }}
                    >
                      직인생략
                    </div>
                  </div>
                )}

                <table className="ml-auto mt-5 w-60 border-collapse text-center text-[10.5px]">
                  <tbody>
                    <tr>
                      {['작성자', '검토자', '승인자'].map((r) => (
                        <td key={r} className="border px-1 py-0.5 font-bold" style={{ background: DG.blueBg, borderColor: DG.line, color: DG.blue }}>
                          {r}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="h-11 border" style={{ borderColor: DG.line }}>{doc.writer}</td>
                      <td className="border" style={{ borderColor: DG.line }} />
                      <td className="border" style={{ borderColor: DG.line }} />
                    </tr>
                  </tbody>
                </table>

                <div className="mt-4 text-[10.5px]" style={{ color: DG.sub }}>
                  ※ 본 문서는 Qdrive 정책 보고서 에이전트가 운행 데이터로 자동 작성한 초안이며, 담당자 검토·결재 후 확정됩니다.
                </div>
              </div>

              <div
                className="flex flex-wrap items-center justify-between gap-1 px-6 py-2 text-[9.5px] text-white"
                style={{ background: DG.blue }}
              >
                <span>○○광역시 {doc.dept}</span>
                <span className="opacity-85">
                  작성 {doc.createdAt} · {doc.docNo}
                </span>
              </div>
            </div>
          ) : (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-950/60 px-4 py-3 text-[12px] leading-relaxed text-gray-300">
              {docToText(doc)}
            </pre>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button onClick={copyOut} className="rounded-md bg-violet-600/80 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-600">
              {copied === true ? '✓ 복사됨' : copied === false ? '복사 실패 — 권한 확인' : '📋 전체 복사'}
            </button>
            <button
              onClick={() => downloadText(`${doc.kind}_${doc.docNo}.txt`, docToText(doc))}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100"
            >
              ⬇ 파일로 저장
            </button>
            <button onClick={printOut} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100">
              🖨 인쇄 / PDF
            </button>
            <button
              onClick={submitApproval}
              disabled={doc.status === '결재 상신'}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-bold ${
                doc.status === '결재 상신'
                  ? 'cursor-default border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {doc.status === '결재 상신' ? '✓ 결재 상신됨' : '✍ 결재 상신'}
            </button>
            <button
              onClick={() => setDoc(null)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200"
            >
              새 보고서
            </button>
          </div>
        </Panel>
      )}

      {/* 문서함 */}
      <Panel title="🗂️ 문서함" right={<span className="text-[11px] text-gray-500">작성한 문서를 다시 열 수 있습니다</span>}>
        {docs.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-gray-600">
            아직 작성한 문서가 없습니다 — 위에서 보고서를 작성하면 여기에 보관됩니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-gray-800 text-[10.5px] text-gray-500">
                  <th className="pb-1.5 pr-3 font-medium">문서번호</th>
                  <th className="pb-1.5 pr-3 font-medium">유형</th>
                  <th className="pb-1.5 pr-3 font-medium">수신</th>
                  <th className="pb-1.5 pr-3 font-medium">작성</th>
                  <th className="pb-1.5 pr-3 font-medium">상태</th>
                  <th className="pb-1.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.docNo} className="border-b border-gray-800/50 last:border-0">
                    <td className="py-1.5 pr-3 tabular-nums text-gray-400">{d.docNo}</td>
                    <td className="py-1.5 pr-3 font-semibold text-gray-200">{d.kind}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{d.to}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-gray-500">{d.createdAt}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          d.status === '결재 상신' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-700/50 text-gray-400'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => {
                          setDoc(d)
                          setView('doc')
                        }}
                        className="rounded border border-gray-700 px-2 py-0.5 text-[10px] font-semibold text-gray-400 hover:text-gray-100"
                      >
                        열기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 부서 발송 */}
      <Panel title="📤 부서 연계 — 승인 후 발송" right={<span className="text-[11px] text-gray-500">대외 발송은 사람이 확정합니다</span>}>
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
                {sent[p.id] ? `✓ ${p.dept} 발송 완료 (${sent[p.id]})` : `${p.dept}로 발송 승인`}
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-[10px] leading-relaxed text-gray-500">
        ⚠ 신뢰성 원칙: 표·수치는 전부 실시간 집계에서 산출(연간 환산은 단순 선형 가정, 전주 대비는 데모 표기).
        문장 생성부는 데모 규칙 기반 → 실증 시 LLM + 수치 검증 과정. 정책 결정의 참고자료이며 단독 근거로 사용할 수
        없습니다. 문서번호·결재 상신은 데모 표기이며, 실증 시 시 전자문서 체계와 연계합니다.
        {period.k > 1 && (
          <>
            <br />⚠ 기간 확장(×{period.k}일): 금일 실측 비율 기반 모의 추정 — 실증 축적 시 실측 집계로 대체.
          </>
        )}
      </div>
    </div>
  )
}
