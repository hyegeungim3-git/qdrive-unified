import { useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { CONNECTORS, RULES, fmt, type Rule } from './catalog'
import { Drawer, LogRow, RecordTable, Sec } from './ui'

/** 원천 × 룰 품질 매트릭스 — 어떤 원천의 어떤 검사가 걸리는지 */
const APPLIES: Record<string, string[]> = {
  'DTG 409': ['Q1', 'Q2', 'Q3', 'Q4', 'Q6'],
  'DTG 521': ['Q1', 'Q4', 'Q6'],
  'OBD/CAN': ['Q1', 'Q2', 'Q3', 'Q4', 'Q6'],
  RTK: ['Q1', 'Q4', 'Q5', 'Q6'],
  'BIS 공개 API': ['Q1', 'Q4', 'Q5', 'Q6'],
  '날씨·돌발': ['Q1', 'Q4'],
  정비이력: ['Q1', 'Q6'],
  '단말 상태': ['Q1', 'Q4'],
}

export default function Quality({
  snap,
  total,
  reprocessed,
  setReprocessed,
}: {
  snap: SimSnapshot
  total: number
  reprocessed: Record<string, number>
  setReprocessed: (fn: (p: Record<string, number>) => Record<string, number>) => void
}) {
  const [openCode, setOpenCode] = useState<string | null>(null)

  const open = RULES.find((r) => r.code === openCode) ?? null
  const failOf = (r: Rule) => Math.max(0, r.fail(snap, total) - (reprocessed[r.code] ?? 0))
  const liveFailed = RULES.reduce((n, r) => n + failOf(r), 0)
  const liveRate = total > 0 ? ((total - liveFailed) / total) * 100 : 100
  const doneCount = Object.values(reprocessed).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-3">
      <Panel
        title="품질 검사 — 6개 규칙"
        right={
          <span className="text-[11px] font-semibold text-gray-500">
            통과 {fmt(total - liveFailed)} / 검사 {fmt(total)}건 · 행을 클릭하면 격리 기록
          </span>
        }
      >
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-bold text-emerald-400 tabular-nums">{liveRate.toFixed(3)}% 통과</span>
          <span className="text-gray-500">
            격리 {fmt(liveFailed)}건{doneCount > 0 && <span className="ml-1 text-sky-300">· 재처리 완료 {fmt(doneCount)}건</span>}
          </span>
        </div>
        <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, liveRate)}%` }} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">규칙</th>
                <th className="py-2 pr-3 font-semibold">검사 내용</th>
                <th className="py-2 pr-3 font-semibold">방식</th>
                <th className="py-2 pr-3 text-right font-semibold">격리</th>
                <th className="py-2 text-right font-semibold">통과율</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => {
                const f = failOf(r)
                const rate = total > 0 ? ((total - f) / total) * 100 : 100
                return (
                  <tr
                    key={r.code}
                    onClick={() => setOpenCode(r.code)}
                    className="cursor-pointer border-b border-gray-800/60 transition-colors hover:bg-gray-800/40"
                  >
                    <td className="py-2 pr-3">
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-bold text-gray-300">{r.code}</span>
                      <span className="ml-2 font-bold text-gray-100">{r.name}</span>
                    </td>
                    <td className="py-2 pr-3 break-keep text-gray-400">{r.desc}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                          r.kind === '라이브 검사' ? 'bg-sky-500/12 text-sky-400' : 'bg-gray-700/40 text-gray-400'
                        }`}
                      >
                        {r.kind}
                      </span>
                    </td>
                    <td className={`py-2 pr-3 text-right font-bold tabular-nums ${f > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{fmt(f)}</td>
                    <td className="py-2 text-right font-bold tabular-nums text-emerald-400">{rate.toFixed(3)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="원천 × 규칙 대조표 — 어느 원천에 어떤 검사가 걸리나" right={<span className="text-[11px] text-gray-500">● 적용 · — 해당 없음</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">원천</th>
                {RULES.map((r) => (
                  <th key={r.code} className="py-2 pr-3 text-center font-semibold" title={r.name}>
                    {r.code}
                  </th>
                ))}
                <th className="py-2 text-right font-semibold">적용 규칙</th>
              </tr>
            </thead>
            <tbody>
              {CONNECTORS.filter((c) => c.stage === '1차').map((c) => {
                const set = APPLIES[c.code] ?? []
                return (
                  <tr key={c.code} className="border-b border-gray-800/60">
                    <td className="py-2 pr-3 font-bold text-gray-100">{c.code}</td>
                    {RULES.map((r) => (
                      <td key={r.code} className="py-2 pr-3 text-center">
                        {set.includes(r.code) ? <span className="text-emerald-400">●</span> : <span className="text-gray-700">—</span>}
                      </td>
                    ))}
                    <td className="py-2 text-right tabular-nums text-gray-400">{set.length}개</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 break-keep text-[11.5px] leading-relaxed text-gray-500">
          원천 성격에 맞는 검사만 겁니다 — 이벤트 기반 원천(정비이력)에 1초 시각 정합을 요구하지 않고, 위치가 없는 원천에 위치 이상 검사를 걸지 않습니다.
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="3중 교차검증 — 위치를 서로 대조한다">
          <div className="space-y-2">
            {[
              { a: 'DTG 409', b: '1초 법정 기록', c: '오큐브 자체 자산', dot: '#34d399' },
              { a: 'RTK', b: 'cm급 초정밀', c: '단말 + 국가 무료 보정', dot: '#38bdf8' },
              { a: 'BIS 공개 API', b: '3초 주기 시 공개 데이터', c: '대구시 공개', dot: '#a78bfa' },
            ].map((s) => (
              <div key={s.a} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-gray-100">{s.a}</div>
                  <div className="text-[11px] text-gray-500">
                    {s.b} · {s.c}
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11.5px] leading-relaxed break-keep text-gray-300">
              서로 <b className="text-emerald-400">독립된 세 소스</b>가 같은 위치를 말하는지 대조합니다. 하나가 조작·오류여도 나머지 둘이 잡아냅니다 —
              정산 검증이 방어 가능한 근거가 되는 이유.
            </div>
          </div>
        </Panel>

        <Panel
          title="격리함 — 통과하지 못한 데이터"
          right={<span className="text-[11px] font-semibold text-amber-400">{fmt(liveFailed)}건</span>}
        >
          {liveFailed === 0 ? (
            <div className="py-6 text-center text-[12px] text-gray-500">
              {doneCount > 0 ? `재처리 완료 — 격리 0건 (${fmt(doneCount)}건 복구)` : '현재 격리된 기록이 없습니다 — 전 규칙 통과'}
            </div>
          ) : (
            <div className="space-y-2">
              {RULES.filter((r) => failOf(r) > 0).map((r) => (
                <div key={r.code} className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-gray-100">
                        <span className="mr-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-400">{r.code}</span>
                        {r.name} — {fmt(failOf(r))}건
                      </div>
                      <div className="mt-0.5 break-keep text-[11px] leading-relaxed text-gray-400">{r.action}</div>
                    </div>
                    <button
                      onClick={() => setReprocessed((p) => ({ ...p, [r.code]: (p[r.code] ?? 0) + r.fail(snap, total) }))}
                      className="shrink-0 whitespace-nowrap rounded-md border border-sky-500/40 bg-sky-500/12 px-2 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      재처리
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-[11px] leading-relaxed break-keep text-gray-500">
            격리된 데이터는 <b className="text-gray-300">버리지 않고 원본 그대로 보관</b>합니다. 원인(단말 고장·통신 유실)을 고치면 재처리되고, 그 이력
            자체가 단말 관리의 근거가 됩니다.
          </div>
        </Panel>
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpenCode(null)}
        title={open ? `${open.code} — ${open.name}` : ''}
        sub={open ? `${open.kind} · 격리 ${fmt(open ? failOf(open) : 0)}건` : ''}
      >
        {open && (
          <>
            <Sec t="검사 정의">
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 break-keep text-[12px] leading-relaxed text-gray-300">
                {open.desc}
              </div>
            </Sec>
            <Sec t="적용 원천">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(APPLIES)
                  .filter(([, v]) => v.includes(open.code))
                  .map(([k]) => (
                    <span key={k} className="rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1 text-[11px] font-semibold text-gray-300">
                      {k}
                    </span>
                  ))}
              </div>
            </Sec>
            <Sec t="격리 데이터 예시" right={<span className="text-[11px] text-gray-500">최근 {Math.min(4, failOf(open))}건</span>}>
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <RecordTable rows={failOf(open) > 0 ? open.sample(snap, failOf(open)) : []} empty="격리된 데이터가 없습니다" />
              </div>
            </Sec>
            <Sec t="조치">
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 break-keep text-[12px] leading-relaxed text-gray-200">
                {open.action}
              </div>
            </Sec>
            <Sec t="처리 이력">
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1">
                <LogRow at="—" level="정보" msg={`${open.code} 검사 활성 · 적용 원천 ${Object.entries(APPLIES).filter(([, v]) => v.includes(open.code)).length}종`} />
                {(reprocessed[open.code] ?? 0) > 0 && (
                  <LogRow at="방금" level="정보" msg={`재처리 ${fmt(reprocessed[open.code])}건 — 원인 해소 후 정제 저장소로 재적재`} />
                )}
              </div>
            </Sec>
          </>
        )}
      </Drawer>
    </div>
  )
}
