import { useState } from 'react'
import { KpiCard } from '../components/ui'
import { useSim } from '../sim/store'
import { fmt } from './admin/catalog'
import Grammar from './ontology/Grammar'
import Simulator from './ontology/Simulator'
import SpaceGraph from './ontology/SpaceGraph'
import { LEVERS, META_EDGES, SPACES } from './ontology/meta'

/**
 * 🧭 온톨로지 스튜디오 — 데이터가 서 있는 **의미 구조**를 다루는 화면.
 *
 * 🔗 데이터 관리자가 "어떤 원천이 어떻게 들어오나"(파이프라인)를 다룬다면,
 * 여기는 "그 데이터가 무엇을 뜻하고 무엇을 움직이나"(문법·인과)를 다룬다.
 *
 * 핵심 사슬:  관측 ─뒷받침→ 판정 ─반영→ 성과 ←올림─ 조치
 */

const STEPS = [
  { id: 'spaces', n: '①', label: '스페이스', desc: '데이터가 서 있는 9개 자리' },
  { id: 'grammar', n: '②', label: '관계 문법', desc: '허용된 관계만 만든다' },
  { id: 'sim', n: '③', label: '조치 시뮬레이션', desc: '손잡이를 당기면 성과가' },
] as const
type StepId = (typeof STEPS)[number]['id']

export default function OntologyStudio() {
  const snap = useSim()
  const [step, setStep] = useState<StepId>('spaces')

  const typeCount = SPACES.reduce((n, s) => n + s.types.length, 0)
  const instances = SPACES.reduce((n, s) => n + s.types.reduce((m, t) => m + t.count(snap), 0), 0)
  const relations = new Set(META_EDGES.flatMap((e) => e.relations)).size
  const targets = LEVERS.reduce((n, l) => n + l.targets.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.2em] text-pink-400">META ONTOLOGY</div>
          <h2 className="mt-0.5 text-lg font-black tracking-tight text-gray-50">🧭 온톨로지 스튜디오</h2>
          <p className="mt-1 max-w-3xl break-keep text-[12.5px] leading-relaxed text-gray-400">
            데이터 관리자가 <b className="text-gray-200">어떻게 들어오나</b>를 다룬다면, 여기는{' '}
            <b className="text-gray-200">그 데이터가 무엇을 뜻하고 무엇을 움직이나</b>를 다룹니다. 관측 → 판정 → 성과 ← 조치의 사슬을 문법으로 못
            박고, 그 관계를 따라 "이 조치를 당기면 성과가 얼마나 움직이는가"까지 계산합니다.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-pink-400/30 bg-pink-400/10 px-2.5 py-1 text-[11px] font-bold text-pink-300">
          문법 v1.0 · 9 스페이스
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        <button onClick={() => setStep('spaces')} className="text-left focus-visible:ring-2 focus-visible:ring-sky-500">
          <KpiCard label="스페이스" value="9" unit="개" sub={`노드 타입 ${typeCount}종`} accent="text-pink-400" />
        </button>
        <button onClick={() => setStep('spaces')} className="text-left focus-visible:ring-2 focus-visible:ring-sky-500">
          <KpiCard label="인스턴스" value={fmt(instances)} unit="개" sub="엔진 실집계 · 배속 반영" accent="text-sky-400" />
        </button>
        <button onClick={() => setStep('grammar')} className="text-left focus-visible:ring-2 focus-visible:ring-sky-500">
          <KpiCard label="관계 어휘" value={`${relations}`} unit="종" sub={`${META_EDGES.length}개 방향에만 허용`} accent="text-emerald-400" />
        </button>
        <button onClick={() => setStep('sim')} className="text-left focus-visible:ring-2 focus-visible:ring-sky-500">
          <KpiCard label="조치 → 성과" value={`${LEVERS.length}`} unit="개 조치" sub={`성과 연결 ${targets}건 · 시뮬레이션 가능`} accent="text-amber-400" />
        </button>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[560px] grid-cols-3 gap-2">
          {STEPS.map((s, i) => {
            const on = step === s.id
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  on ? 'border-pink-400/60 bg-pink-400/10' : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-black ${on ? 'text-pink-300' : 'text-gray-600'}`}>{s.n}</span>
                  <span className={`text-[13px] font-bold ${on ? 'text-gray-50' : 'text-gray-300'}`}>{s.label}</span>
                  {i < STEPS.length - 1 && <span className="ml-auto text-[11px] text-gray-700">→</span>}
                </div>
                <div className="mt-0.5 truncate text-[11px] leading-tight text-gray-500">{s.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {step === 'spaces' && <SpaceGraph snap={snap} />}
      {step === 'grammar' && <Grammar />}
      {step === 'sim' && <Simulator snap={snap} />}

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 break-keep text-[11.5px] leading-relaxed text-gray-500">
        🧭 <b className="text-gray-300">왜 문법을 먼저 정하나</b> — 데이터가 늘어날 때 관계 어휘를 그때그때 만들면, 나중에 다른 도시·다른 사업자
        데이터와 합칠 수 없습니다. 스페이스와 관계를 먼저 못 박아 두면 새 원천은 <b className="text-gray-300">기존 자리에 꽂기만</b> 하면 됩니다.
        데이터 관리자(🔗)의 커넥터·계보와 같은 구조를 의미 층에서 한 번 더 지키는 것입니다.
      </div>
    </div>
  )
}
