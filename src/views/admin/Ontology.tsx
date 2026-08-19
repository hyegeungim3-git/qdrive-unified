import { useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { ONTO, ONTO_QUERIES, fmt } from './catalog'
import { EDGES, NODES, trim } from './graph'
import Explorer from './Explorer'
import { Drawer, RecordTable, Sec } from './ui'

export default function Ontology({ snap }: { snap: SimSnapshot }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const open = ONTO.find((c) => c.key === openKey) ?? null

  const max = Math.max(1, ...ONTO.map((c) => c.count(snap)))
  /** 로그 스케일 — 3개와 24,000개를 한 화면에서 함께 읽히게 */
  const barPct = (n: number) => (n <= 0 ? 2 : Math.max(4, (Math.log10(n + 1) / Math.log10(max + 1)) * 100))

  const pos = (k: string) => NODES.find((n) => n.key === k)!
  const cls = (k: string) => ONTO.find((c) => c.key === k)!
  /** 강조 — 노드에 올리면 그 노드에 걸린 관계만 살아난다 */
  const lit = (e: { from: string; to: string }) => !hover || e.from === hover || e.to === hover
  /** 관계 인스턴스 수 — 두 클래스 중 실제로 연결이 성립하는 건수 */
  const relCount = (e: { from: string; to: string }) => Math.min(cls(e.from).count(snap), cls(e.to).count(snap))
  const litNode = (k: string) => !hover || k === hover || EDGES.some((e) => (e.from === hover && e.to === k) || (e.to === hover && e.from === k))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1.15fr_1fr] gap-3 max-[1000px]:grid-cols-1">
        <Panel
          title="운행 단위(Trip) 중심 온톨로지"
          right={<span className="text-[11px] font-semibold text-gray-500">클래스 {ONTO.length} · 관계 {EDGES.length} · 노드 클릭</span>}
        >
          <svg viewBox="0 0 760 360" className="w-full" role="img" aria-label="운행 단위 중심 온톨로지 그래프">
            {/* ① 엣지 — 노드보다 먼저 그려 선이 원 위로 올라오지 않게 한다 */}
            <g>
              {EDGES.map((e) => {
                const a = pos(e.from)
                const b = pos(e.to)
                const t = trim(a, b)
                const color = cls(e.to).color
                const on = lit(e)
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={t.x1}
                    y1={t.y1}
                    x2={t.x2}
                    y2={t.y2}
                    stroke={color}
                    strokeOpacity={on ? (e.kind === 'core' ? 0.55 : 0.32) : 0.08}
                    strokeWidth={e.kind === 'core' ? 1.8 : 1.2}
                    strokeDasharray={e.kind === 'core' ? undefined : '4 3'}
                  />
                )
              })}
            </g>
            {/* ② 관계 라벨 */}
            <g>
              {EDGES.map((e) => {
                const a = pos(e.from)
                const b = pos(e.to)
                const t = trim(a, b)
                const at = e.at ?? 0.5
                const mx = t.x1 + (t.x2 - t.x1) * at
                const my = t.y1 + (t.y2 - t.y1) * at
                const on = lit(e)
                return (
                  <text
                    key={`l-${e.from}-${e.to}`}
                    x={mx}
                    y={my - 3}
                    textAnchor="middle"
                    fontSize={7.5}
                    fontWeight={700}
                    fill={cls(e.to).color}
                    fillOpacity={on ? 0.9 : 0.12}
                    style={{ paintOrder: 'stroke', stroke: 'var(--color-gray-900)', strokeWidth: 3, strokeLinejoin: 'round' }}
                  >
                    {e.label}
                  </text>
                )
              })}
            </g>
            {/* ③ 노드 — 항상 선 위에 */}
            <g>
              {NODES.map((n) => {
                const c = cls(n.key)
                const on = litNode(n.key)
                const isHub = n.key === 'trip'
                return (
                  <g
                    key={n.key}
                    onClick={() => setOpenKey(n.key)}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                    opacity={on ? 1 : 0.25}
                  >
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r}
                      fill="var(--color-gray-900)"
                      stroke={c.color}
                      strokeWidth={isHub ? 2.2 : hover === n.key ? 2 : 1.4}
                      strokeOpacity={isHub ? 1 : 0.8}
                    />
                    <circle cx={n.x} cy={n.y} r={n.r} fill={c.color} fillOpacity={isHub ? 0.2 : 0.14} />
                    <text
                      x={n.x}
                      y={n.y - (isHub ? 4 : 2)}
                      textAnchor="middle"
                      fontSize={isHub ? 15 : 10.5}
                      fontWeight={isHub ? 900 : 800}
                      fill={c.color}
                    >
                      {fmt(c.count(snap))}
                    </text>
                    <text x={n.x} y={n.y + (isHub ? 11 : 9)} textAnchor="middle" fontSize={isHub ? 9 : 7.5} fill={c.color} fillOpacity={0.85}>
                      {c.en}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <svg width="16" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              중심축 직접 관계
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="16" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
              </svg>
              클래스 사이 파생 관계
            </span>
            <span>원 안 숫자 = 지금 쌓인 인스턴스 · 노드에 올리면 걸린 관계만 표시</span>
          </div>
          <div className="mt-1 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 break-keep text-[11.5px] leading-relaxed text-gray-300">
            어떤 데이터든 <b className="text-sky-300">운행 단위에 걸리는 순간 맥락이 생깁니다.</b> "3742호가 급감속했다"는 사실이{' '}
            <span className="text-gray-400">언제·어느 노선·어느 정류장 앞·어떤 날씨에·어느 기사가</span>까지 함께 붙어야 판단·설명·학습에 쓸 수 있는
            데이터가 됩니다.
          </div>
        </Panel>

        <Panel title="클래스별 인스턴스" right={<span className="text-[11px] font-semibold text-gray-500">LIVE · 로그 스케일</span>}>
          <div className="space-y-1.5">
            {ONTO.map((c) => {
              const n = c.count(snap)
              return (
                <button
                  key={c.key}
                  onClick={() => setOpenKey(c.key)}
                  className="flex w-full items-center gap-2.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-800/50"
                >
                  <div className="w-[104px] shrink-0 text-[11.5px] font-bold text-gray-200">{c.label}</div>
                  <div className="h-3.5 flex-1 overflow-hidden rounded bg-gray-800">
                    <div className="h-full rounded" style={{ width: `${barPct(n)}%`, background: c.color, opacity: 0.75 }} />
                  </div>
                  <div className="w-[68px] shrink-0 text-right text-[11.5px] font-bold tabular-nums text-gray-300">{fmt(n)}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-3 space-y-1">
            <div className="mb-1 text-[11px] font-bold text-sky-300">관계 {EDGES.length}종 — 실제 연결 건수</div>
            {EDGES.map((e) => (
              <div key={`${e.from}-${e.to}`} className="flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cls(e.to).color }} />
                <span className="shrink-0 text-gray-500">{cls(e.from).en}</span>
                <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300">{e.label}</span>
                <span className="shrink-0 text-gray-500">{cls(e.to).en}</span>
                <span className="ml-auto shrink-0 font-bold tabular-nums text-gray-400">{fmt(relCount(e))}건</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Explorer snap={snap} />

      <Panel title="온톨로지 질의 — 표만 있을 때는 답할 수 없던 것" right={<span className="text-[11px] text-gray-500">답은 지금 데이터로 계산</span>}>
        <div className="space-y-2">
          {ONTO_QUERIES.map((qq) => (
            <div key={qq.q} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5">
              <div className="text-[12.5px] font-bold text-gray-100">{qq.q}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">순회 경로</span>
                <code className="break-keep text-[11px] text-violet-300">{qq.path}</code>
              </div>
              <div className="mt-1.5 flex items-start gap-1.5">
                <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">답</span>
                <span className="break-keep text-[11.5px] font-semibold leading-relaxed text-gray-200">{qq.answer(snap)}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Drawer
        open={!!open}
        onClose={() => setOpenKey(null)}
        title={open ? `${open.label} · ${open.en}` : ''}
        sub={open ? `인스턴스 ${fmt(open.count(snap))}개 · ${open.rel}` : ''}
      >
        {open && (
          <>
            <Sec t="속성 · 관계 정의">
              <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <table className="w-full text-left text-[11.5px]">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10.5px] text-gray-500">
                      <th className="py-1.5 pr-3 font-semibold">속성</th>
                      <th className="py-1.5 pr-3 font-semibold">타입</th>
                      <th className="py-1.5 font-semibold">설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.props.map((p) => (
                      <tr key={p.name} className="border-b border-gray-800/50 last:border-0">
                        <td className="py-1.5 pr-3 font-mono text-[11px] text-gray-200">{p.name}</td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                              p.type === 'rel' ? 'bg-violet-500/15 text-violet-300' : 'bg-gray-800 text-gray-400'
                            }`}
                          >
                            {p.type}
                          </span>
                        </td>
                        <td className="py-1.5 break-keep text-gray-400">{p.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>

            <Sec t="인스턴스 샘플" right={<span className="text-[11px] text-gray-500">엔진 실데이터</span>}>
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <RecordTable rows={open.sample(snap)} empty="아직 생성된 인스턴스가 없습니다" />
              </div>
            </Sec>

            <Sec t="이 클래스를 쓰는 곳">
              <div className="break-keep text-[11.5px] leading-relaxed text-gray-400">
                {open.key === 'trip' && '전 서비스의 기준축 — 정산 검증·탄소 산정·성과 검증·보고서 통계표가 모두 운행 단위로 집계됩니다.'}
                {open.key === 'vehicle' && '운수사 차량 관리·진단 스캐너·시티 이상 차량 선별.'}
                {open.key === 'driver' && '기사 앱 리포트·사내 랭킹·운수사 기사 관리 (분석셋은 가명 처리).'}
                {open.key === 'route' && '노선 관리·정산 검증(인가노선 대조)·정책 보고서 노선별 실적표.'}
                {open.key === 'stop' && '승객 앱 ETA·정차 품질 분석·배차 간격 산출.'}
                {open.key === 'event' && '기사 앱 실시간 코칭·상황 설명 왕복·시티 위험 히트맵·eTAS 제출.'}
                {open.key === 'sensor' && '진단 스캐너 21종 시계열·고장 예측·연료→CO₂ 산정.'}
                {open.key === 'loc' && '지도 관제·차로 단위 정산 검증·민원 증빙 매칭.'}
                {open.key === 'ctx' && '정당 판정 보정·수요 예측·성과 검증의 외부요인 분리.'}
                {open.key === 'work' && '예지정비 작업지시·정비 이력 관리 — 고장 예측 학습셋의 라벨 공급원.'}
                {open.key === 'plea' && '기사 상황 설명 왕복·감점 복원 — 안전 판정 학습셋의 라벨 공급원.'}
              </div>
            </Sec>
          </>
        )}
      </Drawer>
    </div>
  )
}
