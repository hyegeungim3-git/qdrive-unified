import { useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { ONTO, ONTO_QUERIES, fmt } from './catalog'
import { Drawer, RecordTable, Sec } from './ui'

export default function Ontology({ snap }: { snap: SimSnapshot }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const open = ONTO.find((c) => c.key === openKey) ?? null

  const hub = ONTO[0]
  const spokes = ONTO.slice(1)
  const cx = 300
  const cy = 150
  const R = 118
  const max = Math.max(1, ...ONTO.map((c) => c.count(snap)))
  /** 로그 스케일 — 3개와 24,000개를 한 화면에서 함께 읽히게 */
  const barPct = (n: number) => (n <= 0 ? 2 : Math.max(4, (Math.log10(n + 1) / Math.log10(max + 1)) * 100))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1.15fr_1fr] gap-3 max-[1000px]:grid-cols-1">
        <Panel
          title="운행 단위(Trip) 중심 온톨로지"
          right={<span className="text-[11px] font-semibold text-gray-500">클래스 {ONTO.length} · 관계 {spokes.length} · 노드 클릭</span>}
        >
          <svg viewBox="0 0 600 300" className="w-full" role="img" aria-label="운행 단위 중심 온톨로지 그래프">
            {spokes.map((s, i) => {
              const a = (Math.PI * 2 * i) / spokes.length - Math.PI / 2
              const x = cx + Math.cos(a) * R
              const y = cy + Math.sin(a) * R * 0.82
              return (
                <g key={s.key} onClick={() => setOpenKey(s.key)} style={{ cursor: 'pointer' }}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke={s.color} strokeOpacity={0.45} strokeWidth={1.6} />
                  <circle cx={x} cy={y} r={22} fill={s.color} fillOpacity={0.16} stroke={s.color} strokeOpacity={0.75} strokeWidth={1.4} />
                  <text x={x} y={y - 1} textAnchor="middle" fontSize={10} fontWeight={800} fill={s.color}>
                    {fmt(s.count(snap))}
                  </text>
                  <text x={x} y={y + 10} textAnchor="middle" fontSize={7.5} fill={s.color} fillOpacity={0.85}>
                    {s.en}
                  </text>
                </g>
              )
            })}
            <g onClick={() => setOpenKey(hub.key)} style={{ cursor: 'pointer' }}>
              <circle cx={cx} cy={cy} r={40} fill={hub.color} fillOpacity={0.2} stroke={hub.color} strokeWidth={2} />
              <text x={cx} y={cy - 4} textAnchor="middle" fontSize={15} fontWeight={900} fill={hub.color}>
                {fmt(hub.count(snap))}
              </text>
              <text x={cx} y={cy + 11} textAnchor="middle" fontSize={9} fontWeight={700} fill={hub.color}>
                Trip
              </text>
            </g>
          </svg>
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
            {spokes.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="text-gray-500">{c.rel}</span>
                <span className="font-semibold text-gray-400">{c.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

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
            <Sec t="속성 · 관계 스키마">
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
              </div>
            </Sec>
          </>
        )}
      </Drawer>
    </div>
  )
}
