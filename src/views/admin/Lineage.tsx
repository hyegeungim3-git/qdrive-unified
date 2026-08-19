import { useMemo, useState } from 'react'
import { Panel } from '../../components/ui'
import { CONNECTORS, LINEAGE, stageTone, type Stage } from './catalog'

/**
 * ⑤ 서비스 연결 — 계보를 표가 아니라 **온톨로지와 같은 데이터 맵**으로 관리한다.
 * 원천(Source) ─생성→ 데이터셋(Dataset) ─공급→ 서비스 화면(Service)
 * 노드를 고르면 그 노드가 걸린 경로만 살아나고, 끊겼을 때의 영향 범위가 함께 나온다.
 */

type Kind = 'src' | 'ds' | 'svc'
type Node = { id: string; kind: Kind; label: string; sub?: string; stage: Stage; x: number; y: number; w: number; h: number; tab?: string }

const SVC_TABS: { tab: string; name: string }[] = [
  { tab: 'city', name: '시티 대시보드' },
  { tab: 'policy', name: '정책 보고서 에이전트' },
  { tab: 'operator', name: '운수사 관제' },
  { tab: 'driver', name: '기사 앱' },
  { tab: 'passenger', name: '승객 앱' },
  { tab: 'carbon', name: '탄소중립 분석' },
  { tab: 'proof', name: '성과 검증' },
]

const stageColor: Record<Stage, string> = { '1차': '#34d399', '2차': '#38bdf8', '3차': '#a78bfa' }

const COL = { src: { x: 16, w: 148 }, ds: { x: 356, w: 188 }, svc: { x: 736, w: 152 } }

export default function Lineage({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const { nodes, edges, byId, height } = useMemo(() => {
    /* 원천 — 계보에 등장하는 것만, 커넥터 정의 순서로 */
    const srcNames = CONNECTORS.map((c) => c.code).filter((c) => LINEAGE.some((l) => l.src.includes(c)))
    const srcStage = (name: string) => CONNECTORS.find((c) => c.code === name)?.stage ?? '1차'
    const srcY = (i: number) => 34 + i * 34
    const dsY = (i: number) => 46 + i * 48
    const svcY = (i: number) => 44 + i * 54

    const ns: Node[] = [
      ...srcNames.map((name, i) => ({
        id: `src:${name}`, kind: 'src' as const, label: name, stage: srcStage(name),
        x: COL.src.x, y: srcY(i), w: COL.src.w, h: 26,
      })),
      ...LINEAGE.map((l, i) => ({
        id: `ds:${l.ds}`, kind: 'ds' as const, label: l.ds, stage: l.stage,
        x: COL.ds.x, y: dsY(i), w: COL.ds.w, h: 34,
      })),
      ...SVC_TABS.filter((t) => LINEAGE.some((l) => l.svc.some((s) => s.tab === t.tab))).map((t, i) => {
        const fns = LINEAGE.flatMap((l) => l.svc.filter((s) => s.tab === t.tab).map((s) => s.name))
        const stages = LINEAGE.filter((l) => l.svc.some((s) => s.tab === t.tab)).map((l) => l.stage)
        return {
          id: `svc:${t.tab}`, kind: 'svc' as const, label: t.name, sub: `${new Set(fns).size}개 기능`,
          stage: (stages.includes('1차') ? '1차' : stages.includes('2차') ? '2차' : '3차') as Stage,
          x: COL.svc.x, y: svcY(i), w: COL.svc.w, h: 34, tab: t.tab,
        }
      }),
    ]
    const map = new Map(ns.map((n) => [n.id, n]))
    const es: { a: string; b: string; stage: Stage }[] = []
    LINEAGE.forEach((l) => {
      l.src.forEach((s) => es.push({ a: `src:${s}`, b: `ds:${l.ds}`, stage: l.stage }))
      new Set(l.svc.map((s) => s.tab)).forEach((tab) => es.push({ a: `ds:${l.ds}`, b: `svc:${tab}`, stage: l.stage }))
    })
    const maxY = Math.max(...ns.map((n) => n.y + n.h))
    return { nodes: ns, edges: es, byId: map, height: maxY + 20 }
  }, [])

  /* 선택/호버 노드에서 양방향으로 이어지는 경로 */
  const focus = hover ?? sel
  const litSet = useMemo(() => {
    if (!focus) return null
    const keep = new Set<string>([focus])
    let grew = true
    while (grew) {
      grew = false
      edges.forEach((e) => {
        if (keep.has(e.a) && !keep.has(e.b)) { keep.add(e.b); grew = true }
        if (keep.has(e.b) && !keep.has(e.a)) { keep.add(e.a); grew = true }
      })
    }
    return keep
  }, [focus, edges])
  const on = (id: string) => !litSet || litSet.has(id)
  const edgeOn = (e: { a: string; b: string }) => !litSet || (litSet.has(e.a) && litSet.has(e.b))

  const selNode = sel ? byId.get(sel) : null
  const selRows = LINEAGE.filter((l) =>
    !selNode ? false : selNode.kind === 'src' ? l.src.includes(selNode.label) : selNode.kind === 'ds' ? l.ds === selNode.label : l.svc.some((s) => `svc:${s.tab}` === selNode.id),
  )

  return (
    <div className="space-y-3">
      <Panel
        title="데이터 계보 맵 — 원천 → 데이터셋 → 서비스"
        right={
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">노드를 누르면 그 경로만</span>
            {sel && (
              <button
                onClick={() => setSel(null)}
                className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px] font-bold text-gray-300 hover:text-gray-100"
              >
                선택 해제
              </button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 904 ${height}`} className="w-full min-w-[720px]" role="img" aria-label="데이터 계보 맵">
            {/* 컬럼 머리 */}
            <g>
              {[
                [COL.src.x, COL.src.w, '원천 (Source)'],
                [COL.ds.x, COL.ds.w, '데이터셋 (Dataset)'],
                [COL.svc.x, COL.svc.w, '서비스 화면 (Service)'],
              ].map(([x, w, t]) => (
                <text key={t as string} x={(x as number) + (w as number) / 2} y={16} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="var(--color-gray-500)">
                  {t as string}
                </text>
              ))}
            </g>
            {/* ① 엣지 — 노드보다 먼저 (선이 박스 위로 올라오지 않게) */}
            <g fill="none">
              {edges.map((e, i) => {
                const a = byId.get(e.a)!
                const b = byId.get(e.b)!
                const x1 = a.x + a.w
                const y1 = a.y + a.h / 2
                const x2 = b.x
                const y2 = b.y + b.h / 2
                const c = (x1 + x2) / 2
                const lit = edgeOn(e)
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} C ${c} ${y1}, ${c} ${y2}, ${x2} ${y2}`}
                    stroke={stageColor[e.stage]}
                    strokeOpacity={lit ? 0.5 : 0.07}
                    strokeWidth={lit ? 1.5 : 1}
                  />
                )
              })}
            </g>
            {/* ② 노드 */}
            <g>
              {nodes.map((n) => {
                const c = stageColor[n.stage]
                const lit = on(n.id)
                const isSel = sel === n.id
                return (
                  <g
                    key={n.id}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => (n.kind === 'svc' && isSel && n.tab ? onNavigate?.(n.tab) : setSel(isSel ? null : n.id))}
                    style={{ cursor: 'pointer' }}
                    opacity={lit ? 1 : 0.22}
                  >
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill="var(--color-gray-900)" stroke={c} strokeWidth={isSel ? 2 : 1.2} strokeOpacity={isSel ? 1 : 0.7} />
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill={c} fillOpacity={isSel ? 0.22 : 0.1} />
                    <text x={n.x + 10} y={n.y + (n.sub ? 15 : n.h / 2 + 3.5)} fontSize={10} fontWeight={700} fill={c}>
                      {n.label}
                    </text>
                    {n.sub && (
                      <text x={n.x + 10} y={n.y + 27} fontSize={8} fill="var(--color-gray-500)">
                        {n.sub}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-500">
          {(['1차', '2차', '3차'] as Stage[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-sm" style={{ background: stageColor[s] }} />
              {s}
            </span>
          ))}
          <span>· 서비스 노드는 한 번 더 누르면 그 화면으로 이동</span>
          <span>· 단말 상태는 품질 진단 전용이라 데이터셋에 직접 들어가지 않습니다</span>
        </div>
      </Panel>

      {/* 선택 노드 상세 — 표는 필요한 만큼만 */}
      <Panel
        title={selNode ? `선택: ${selNode.label}` : '노드를 고르면 상세 계보가 나옵니다'}
        right={selNode && <span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-bold ${stageTone[selNode.stage]}`}>{selNode.stage}</span>}
      >
        {!selNode ? (
          <div className="py-4 text-center text-[12px] text-gray-500">
            위 맵에서 원천·데이터셋·서비스 노드를 누르면 — 무엇으로 만들어져 어디에 쓰이는지, 끊겼을 때 무엇이 멈추는지가 여기에 표시됩니다.
          </div>
        ) : (
          <div className="space-y-2">
            {selNode.kind === 'src' && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 break-keep text-[12px] leading-relaxed text-gray-200">
                <b className="text-amber-400">{selNode.label}</b> 수집이 중단되면 데이터셋 {selRows.length}종,{' '}
                서비스 {new Set(selRows.flatMap((l) => l.svc.map((s) => s.tab))).size}개가 영향을 받습니다.
              </div>
            )}
            {selRows.map((l) => (
              <div key={l.ds} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.src.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSel(`src:${s}`)}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        selNode.kind === 'src' && s === selNode.label ? 'bg-emerald-500/20 text-emerald-300' : 'text-emerald-400 hover:bg-gray-800'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                  <span className="text-gray-600">→</span>
                  <button onClick={() => setSel(`ds:${l.ds}`)} className="text-[12px] font-bold text-gray-100 hover:text-sky-300">
                    {l.ds}
                  </button>
                  <span className="text-gray-600">→</span>
                  {l.svc.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => onNavigate?.(s.tab)}
                      className="rounded border border-gray-800 px-1.5 py-0.5 text-[11px] text-gray-400 transition-colors hover:border-sky-600 hover:text-sky-300"
                    >
                      {s.name} →
                    </button>
                  ))}
                </div>
                {selNode.kind === 'src' && (
                  <div className="mt-1 break-keep text-[11px] text-gray-500">
                    대체 경로 —{' '}
                    {l.src.filter((s) => s !== selNode.label).length > 0
                      ? `${l.src.filter((s) => s !== selNode.label).join(' · ')} 로 부분 동작 (정밀도 하향)`
                      : '대체 원천 없음 — 기능 중단'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 break-keep text-[11.5px] leading-relaxed text-gray-500">
          계보도 결국 <b className="text-gray-300">온톨로지와 같은 그래프</b>입니다 — 운행 데이터가 클래스·관계로 엮이듯, 원천·데이터셋·서비스도
          노드와 간선으로 관리합니다. 그래서 <b className="text-gray-300">어떤 화면의 숫자든 원천까지 거슬러 확인</b>할 수 있고, 원천이 바뀌거나 품질
          문제가 생기면 영향받는 서비스가 즉시 특정됩니다.
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="거버넌스 — 데이터를 다루는 규칙">
          <div className="space-y-2">
            {[
              ['개인정보', '기사·승객 식별정보는 수집 단계에서 분리 보관 · 분석셋은 가명 처리', '운영 중'],
              ['보존 기간', '원본 5년(법정 운행기록) · 분석셋 3년 · 격리 로그 1년', '운영 중'],
              ['접근 권한', '시·운수사·기사 각자 자기 범위만 — 화면 단위 권한 분리', '운영 중'],
              ['감사 로그', '누가 무엇을 조회·승인·발송했는지 전량 기록', '운영 중'],
              ['불이익 결정', '평가·징계·정산 확정은 신뢰도와 무관하게 자동화하지 않음', '원칙'],
            ].map(([t, d, st]) => (
              <div key={t} className="flex items-start gap-2.5 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                    st === '원칙' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {st}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-gray-100">{t}</div>
                  <div className="break-keep text-[11px] leading-relaxed text-gray-500">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="확장 — 데이터가 늘어도 구조는 그대로">
          <div className="space-y-2.5">
            {[
              ['2차 · 컨소시엄 자산', 'AFC · APC · 민원', '수요·혼잡 축이 붙으면 배차 최적화·혼잡 안내가 열립니다', 'sky'],
              ['3차 · 대구시 소관', 'BMS · ITS · DVR', '계획-실적 대조·신호 예측·영상 안전 — 도시 통합 레이어', 'violet'],
            ].map(([t, srcs, d, tone]) => (
              <div
                key={t}
                className={`rounded-lg border border-dashed px-3 py-2.5 ${
                  tone === 'sky' ? 'border-sky-500/40 bg-sky-500/5' : 'border-violet-500/40 bg-violet-500/5'
                }`}
              >
                <div className={`text-[12.5px] font-bold ${tone === 'sky' ? 'text-sky-300' : 'text-violet-300'}`}>{t}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-gray-400">{srcs}</div>
                <div className="mt-1 break-keep text-[11px] leading-relaxed text-gray-500">{d}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
