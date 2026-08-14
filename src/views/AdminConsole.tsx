import { useState } from 'react'
import { KpiCard } from '../components/ui'
import { useSim } from '../sim/store'
import { CONNECTORS, DATASETS, ONTO, RULES, fmt } from './admin/catalog'
import Ingest from './admin/Ingest'
import Quality from './admin/Quality'
import Ontology from './admin/Ontology'
import Datasets from './admin/Datasets'
import Lineage from './admin/Lineage'
import Operations from './admin/Operations'

/**
 * 🔗 데이터 관리자 — Qdrive의 AX(AI 전환) 데이터 체계 운영 콘솔.
 *
 * 서사: 흩어진 시스템의 데이터를 ①모으고 → ②믿을 수 있게 걸러내고 → ③운행 단위(Trip) 온톨로지로 엮어
 * → ④AI가 바로 학습·추론할 수 있는 형태로 만들고 → ⑤서비스 화면에 연결하고 → ⑥운영한다.
 * 수치는 전부 시뮬레이터 스냅샷 파생 — 배속을 올리면 수집량·인스턴스가 실제로 늘어난다.
 */

const STEPS = [
  { id: 'ingest', n: '①', label: '수집', desc: '흩어진 원천을 하나의 파이프로' },
  { id: 'quality', n: '②', label: '품질', desc: '믿을 수 있는 것만 통과' },
  { id: 'ontology', n: '③', label: '온톨로지', desc: '운행 단위로 의미를 연결' },
  { id: 'dataset', n: '④', label: 'AI-Ready', desc: 'AI가 바로 쓰는 형태로' },
  { id: 'lineage', n: '⑤', label: '서비스 연결', desc: '어느 화면이 무엇을 쓰는가' },
  { id: 'ops', n: '⑥', label: '운영', desc: '잡·저장·감사 관리' },
] as const
type StepId = (typeof STEPS)[number]['id']

export default function AdminConsole({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const snap = useSim()
  const [step, setStep] = useState<StepId>('ingest')
  /** 격리 재처리 이력 — 품질 단계에서 조작하고 총괄 KPI·알림이 함께 반영된다 */
  const [reprocessed, setReprocessed] = useState<Record<string, number>>({})

  const live = CONNECTORS.filter((c) => c.stage === '1차')
  const totalRecords = live.reduce((n, c) => n + c.count(snap), 0)
  const failed = RULES.reduce((n, r) => n + Math.max(0, r.fail(snap, totalRecords) - (reprocessed[r.code] ?? 0)), 0)
  const recovered = Object.values(reprocessed).reduce((a, b) => a + b, 0)
  const passRate = totalRecords > 0 ? ((totalRecords - failed) / totalRecords) * 100 : 100
  const ontoTotal = ONTO.reduce((n, c) => n + c.count(snap), 0)
  const dsRows = DATASETS.reduce((n, d) => n + d.rows(snap), 0)

  /** 지금 신경 써야 할 것 — 스냅샷에서 파생한 운영 알림 */
  const alerts: { tone: 'warn' | 'info'; msg: string; go?: StepId }[] = []
  if (snap.fault)
    alerts.push({ tone: 'warn', msg: `OBD 냉각수온 이상 감지 — 품질 룰 Q2 보류 후 고장 예측으로 회부`, go: 'quality' })
  if (failed > 0) alerts.push({ tone: 'info', msg: `격리 ${fmt(failed)}건 대기 — 원인 확인 후 재처리 가능`, go: 'quality' })
  if (recovered > 0) alerts.push({ tone: 'info', msg: `재처리 완료 ${fmt(recovered)}건 — 정제 저장소로 재적재됨`, go: 'quality' })
  if (snap.workOrders.length === 0)
    alerts.push({ tone: 'info', msg: '정비이력 오늘 신규 없음 — 이벤트 기반 원천이라 정상', go: 'ingest' })
  alerts.push({ tone: 'info', msg: '2·3차 원천 6종 연결 대기 — 스키마·매핑은 이미 정의 완료', go: 'ingest' })

  const stepStat: Record<StepId, string> = {
    ingest: `${live.length}종 · ${fmt(totalRecords)}건`,
    quality: `${passRate.toFixed(2)}% 통과`,
    ontology: `${fmt(ontoTotal)} 인스턴스`,
    dataset: `${DATASETS.length}종 · ${fmt(dsRows)}행`,
    lineage: `${CONNECTORS.length}원천 → 서비스`,
    ops: '잡 5 · 정상',
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.2em] text-sky-400">AX DATA PLATFORM</div>
          <h2 className="mt-0.5 text-lg font-black tracking-tight text-gray-50">🔗 데이터 관리자</h2>
          <p className="mt-1 max-w-3xl break-keep text-[12.5px] leading-relaxed text-gray-400">
            시스템마다 흩어져 있던 버스 데이터를 <b className="text-gray-200">모으고 · 걸러내고 · 운행 단위로 엮어</b>, AI가 바로 쓸 수 있는 형태로
            만들어 서비스 화면에 연결합니다. 아래 수치는 전부 지금 돌아가는 엔진에서 집계된 값입니다 — 배속을 올리면 실제로 늘어납니다.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          파이프라인 가동 중
        </span>
      </div>

      {/* 총괄 KPI — 클릭 시 해당 단계로 */}
      <div className="grid grid-cols-5 gap-3 max-[1100px]:grid-cols-3 max-[720px]:grid-cols-2">
        {(
          [
            ['ingest', '연결 원천', `${live.length}`, `/ ${CONNECTORS.length}종`, '1차 자체·공개 데이터 전부 연결', 'text-emerald-400'],
            ['ingest', '오늘 수집 레코드', fmt(totalRecords), '건', '엔진 실집계 · 배속 반영', 'text-sky-400'],
            ['quality', '품질 통과율', passRate.toFixed(2), '%', `격리 ${fmt(failed)}건 — 6개 룰 검사`, passRate >= 99 ? 'text-emerald-400' : 'text-amber-400'],
            ['ontology', '온톨로지 인스턴스', fmt(ontoTotal), '개', `${ONTO.length}개 클래스 · 운행 단위 연결`, 'text-violet-400'],
            ['dataset', 'AI-Ready 데이터셋', `${DATASETS.length}`, '종', `학습 가능 행 ${fmt(dsRows)}건`, 'text-amber-400'],
          ] as const
        ).map(([go, label, value, unit, sub, accent]) => (
          <button key={label} onClick={() => setStep(go)} className="text-left focus-visible:ring-2 focus-visible:ring-sky-500">
            <KpiCard label={label} value={value} unit={unit} sub={sub} accent={accent} />
          </button>
        ))}
      </div>

      {/* 운영 알림 */}
      <div className="flex flex-wrap gap-2">
        {alerts.map((a) => (
          <button
            key={a.msg}
            onClick={() => a.go && setStep(a.go)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
              a.tone === 'warn'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>{a.tone === 'warn' ? '⚠' : 'ℹ'}</span>
            <span className="break-keep text-left">{a.msg}</span>
          </button>
        ))}
      </div>

      {/* 6단계 내비 */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[900px] grid-cols-6 gap-2">
          {STEPS.map((s, i) => {
            const on = step === s.id
            const done = STEPS.findIndex((x) => x.id === step) > i
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  on ? 'border-sky-500/60 bg-sky-500/10' : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-black ${on ? 'text-sky-400' : done ? 'text-emerald-500/70' : 'text-gray-600'}`}>{s.n}</span>
                  <span className={`text-[13px] font-bold ${on ? 'text-gray-50' : 'text-gray-300'}`}>{s.label}</span>
                  {i < STEPS.length - 1 && <span className="ml-auto text-[11px] text-gray-700">→</span>}
                </div>
                <div className="mt-0.5 truncate text-[11px] leading-tight text-gray-500">{s.desc}</div>
                <div className={`mt-1 truncate text-[11px] font-bold tabular-nums ${on ? 'text-sky-300' : 'text-gray-600'}`}>{stepStat[s.id]}</div>
              </button>
            )
          })}
        </div>
      </div>

      {step === 'ingest' && <Ingest snap={snap} total={totalRecords} />}
      {step === 'quality' && <Quality snap={snap} total={totalRecords} reprocessed={reprocessed} setReprocessed={setReprocessed} />}
      {step === 'ontology' && <Ontology snap={snap} />}
      {step === 'dataset' && <Datasets snap={snap} onNavigate={onNavigate} />}
      {step === 'lineage' && <Lineage onNavigate={onNavigate} />}
      {step === 'ops' && <Operations snap={snap} total={totalRecords} failed={failed} />}

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 break-keep text-[11.5px] leading-relaxed text-gray-500">
        ⚙️ <b className="text-gray-300">실단말 전환 시</b> — 이 화면의 커넥터는 시뮬레이터 대신 실단말 스트림(<code className="text-gray-400">PacketSource</code>)을
        바라보게 바꾸면 그대로 동작합니다. 품질 룰·온톨로지 스키마·데이터셋 정의는 원천이 바뀌어도 유지됩니다 —{' '}
        <b className="text-gray-300">2·3차 데이터는 같은 중심축(운행 단위)에 꽂기만 하면 됩니다.</b>
      </div>
    </div>
  )
}
