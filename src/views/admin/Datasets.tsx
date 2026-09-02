import { useState } from 'react'
import { Panel } from '../../components/ui'
import { RISK_EVENT_TYPES, type SimSnapshot } from '../../sim/types'
import { DATASETS, ONTO, fmt, type Dataset } from './catalog'
import { Chips, Drawer, RecordTable, Sec, Stat } from './ui'

const SORTS = ['품질순', '행 수순', '이름순'] as const
type Sort = (typeof SORTS)[number]

export default function Datasets({ snap, onNavigate }: { snap: SimSnapshot; onNavigate?: (tab: string) => void }) {
  const [sort, setSort] = useState<Sort>('품질순')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const open = DATASETS.find((d) => d.key === openKey) ?? null

  const list = [...DATASETS].sort((a, b) =>
    sort === '품질순' ? b.ready - a.ready : sort === '행 수순' ? b.rows(snap) - a.rows(snap) : a.name.localeCompare(b.name, 'ko'),
  )

  return (
    <div className="space-y-3">
      <Panel
        title="AI-Ready 데이터셋 — AI가 바로 학습·추론할 수 있는 형태"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">카드 클릭 시 학습 항목·예시</span>
            <Chips value={sort} options={SORTS} onChange={setSort} />
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2.5 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
          {list.map((d) => {
            const rows = d.rows(snap)
            const tone = d.ready >= 95 ? 'text-emerald-400' : d.ready >= 85 ? 'text-sky-400' : 'text-amber-400'
            const bar = d.ready >= 95 ? 'bg-emerald-500' : d.ready >= 85 ? 'bg-sky-500' : 'bg-amber-500'
            return (
              <button
                key={d.key}
                onClick={() => setOpenKey(d.key)}
                className="rounded-lg border border-gray-800 bg-gray-900/60 px-3.5 py-3 text-left transition-colors hover:border-gray-700 focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-bold text-gray-100">{d.name}</div>
                  <span className={`shrink-0 text-[11px] font-bold tabular-nums ${tone}`}>{d.ready}점</span>
                </div>
                <div className="mt-0.5 break-keep text-[11px] text-gray-500">{d.purpose}</div>
                <div className="mt-2.5 flex items-end gap-3">
                  <Stat label="행" value={fmt(rows)} tone="text-sky-300" />
                  <Stat label="학습 항목" value={`${d.featureCount}`} />
                  <div className="ml-auto text-right">
                    <div className="text-[10.5px] text-gray-500">갱신</div>
                    <div className="text-[11.5px] font-bold text-gray-300">{d.refresh}</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${d.ready}%` }} />
                </div>
                <div className="mt-2 break-keep text-[11px] leading-relaxed text-gray-500">
                  <b className="text-gray-400">정답 라벨</b> — {d.label}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {d.services.map((s) => (
                    <span key={s.name} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-400">
                      {s.name}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="데이터 형식 고정 — 위험운전 8종이 그대로 학습 항목의 축이 된다" right={<span className="text-[11px] text-gray-500">공단 표준 DTG 409</span>}>
        <div className="flex flex-wrap gap-1.5">
          {RISK_EVENT_TYPES.map((t) => (
            <span key={t} className="rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1 text-[11.5px] font-semibold text-gray-300">
              {t}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="AI-Ready의 조건 — 무엇이 갖춰져야 학습이 되나">
          <div className="space-y-2">
            {[
              ['① 정답이 있다', '사람(관제·담당자)의 판정이 정답으로 쌓입니다 — 승인·소명 인정·회신 확정이 곧 정답 라벨', true],
              ['② 시점이 정확하다', '1초 단위 시각이 3소스 교차로 맞춰져 있어 인과 순서를 뒤집지 않습니다', true],
              ['③ 맥락이 붙어 있다', '같은 급감속도 폭우·정류장 접근·앞차 간격에 따라 의미가 다릅니다', true],
              ['④ 결측·이상이 걸러졌다', '품질 검사 6개 규칙을 통과한 데이터만 학습셋에 들어갑니다', true],
              ['⑤ 재현 가능하다', '원본 보존 + 처리 이력 → 같은 결과를 언제든 다시 만들 수 있습니다', true],
              ['⑥ 편향이 관리된다', '노선·시간대·기사군 분포를 함께 기록 — 특정 군에 치우친 학습 방지', false],
            ].map(([t, d, ok]) => (
              <div key={t as string} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                    ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {ok ? '충족' : '관리 중'}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-gray-100">{t as string}</div>
                  <div className="break-keep text-[11px] leading-relaxed text-gray-500">{d as string}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="AI 전환(AX) 성숙도 — 지금 어디까지 왔나">
          <div className="space-y-2">
            {[
              ['L0', '산재', '시스템마다 따로 — 위치는 안내용, 기록은 제출용, 상태는 정비용', 'done'],
              ['L1', '수집', '원천을 하나로 모음 (1차 8종 실시간)', 'done'],
              ['L2', '품질', '6개 규칙 + 3중 교차검증 통과분만 적재', 'done'],
              ['L3', '온톨로지', `운행 단위 중심축으로 의미 연결 — ${ONTO.length}개 종류`, 'done'],
              ['L4', 'AI-Ready', '정답·맥락·재현성을 갖춘 학습셋 6종', 'now'],
              ['L5', '지식그래프 에이전트', '온톨로지를 순회해 근거 사슬로 답하는 자율 판단', 'next'],
            ].map(([lv, name, d, st]) => (
              <div
                key={lv as string}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                  st === 'now'
                    ? 'border-sky-500/40 bg-sky-500/10'
                    : st === 'next'
                      ? 'border-dashed border-gray-800 bg-gray-900/30'
                      : 'border-gray-800 bg-gray-900/50'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-black ${
                    st === 'now' ? 'bg-sky-500/20 text-sky-300' : st === 'next' ? 'bg-gray-700/40 text-gray-500' : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {lv as string}
                </span>
                <div className="min-w-0">
                  <div className={`text-[12.5px] font-bold ${st === 'next' ? 'text-gray-400' : 'text-gray-100'}`}>
                    {name as string}
                    {st === 'now' && <span className="ml-2 text-[10.5px] font-bold text-sky-400">← 현재</span>}
                    {st === 'next' && <span className="ml-2 text-[10.5px] font-bold text-gray-600">다음 단계</span>}
                  </div>
                  <div className="break-keep text-[11px] leading-relaxed text-gray-500">{d as string}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpenKey(null)}
        title={open?.name ?? ''}
        sub={open ? `${fmt(open.rows(snap))}행 · 학습 항목 ${open.featureCount}개 · 품질 ${open.ready}점 · 결측 ${open.missing}%` : ''}
      >
        {open && <DsDetail ds={open} snap={snap} onNavigate={onNavigate} />}
      </Drawer>
    </div>
  )
}

function DsDetail({ ds, snap, onNavigate }: { ds: Dataset; snap: SimSnapshot; onNavigate?: (tab: string) => void }) {
  return (
    <>
      <Sec t="용도">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 break-keep text-[12px] leading-relaxed text-gray-300">
          {ds.purpose}
        </div>
      </Sec>

      <Sec t="정답 라벨 — 무엇을 정답으로 보나">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 break-keep text-[12px] leading-relaxed text-gray-200">
          {ds.label}
        </div>
        <div className="mt-1.5 break-keep text-[11.5px] leading-relaxed text-gray-500">
          정답이 없는 데이터는 학습셋이 아니라 그냥 기록입니다. Qdrive는 <b className="text-gray-300">담당자의 승인·판정이 그대로 정답이 되도록</b>{' '}
          업무 흐름을 설계했습니다.
        </div>
      </Sec>

      <Sec t="학습 항목 정의" right={<span className="text-[11px] text-gray-500">전체 {ds.featureCount}개 중 대표 {ds.features.length}개</span>}>
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
          <table className="w-full text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-gray-800 text-[10.5px] text-gray-500">
                <th className="py-1.5 pr-3 font-semibold">학습 항목</th>
                <th className="py-1.5 pr-3 font-semibold">형식</th>
                <th className="py-1.5 font-semibold">설명</th>
              </tr>
            </thead>
            <tbody>
              {ds.features.map((f) => (
                <tr key={f.name} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-gray-200">{f.name}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{f.type}</td>
                  <td className="py-1.5 break-keep text-gray-400">{f.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec t="샘플 행" right={<span className="text-[11px] text-gray-500">엔진 실데이터</span>}>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
          <RecordTable rows={ds.sample(snap)} empty="아직 학습 가능한 행이 없습니다 — 원천 수집이 시작되면 채워집니다" />
        </div>
      </Sec>

      <Sec t="이 데이터셋을 쓰는 서비스">
        <div className="flex flex-wrap gap-1.5">
          {ds.services.map((s) => (
            <button
              key={s.name}
              onClick={() => onNavigate?.(s.tab)}
              className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {s.name} →
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11.5px] text-gray-500">클릭하면 해당 서비스 화면으로 이동합니다.</div>
      </Sec>

      <Sec t="품질 지표">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
            <Stat label="AI-Ready 점수" value={`${ds.ready}점`} tone={ds.ready >= 95 ? 'text-emerald-400' : 'text-sky-300'} />
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
            <Stat label="결측률" value={`${ds.missing}%`} tone={ds.missing < 1 ? 'text-emerald-400' : 'text-amber-400'} />
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
            <Stat label="갱신 주기" value={ds.refresh} />
          </div>
        </div>
      </Sec>
    </>
  )
}
