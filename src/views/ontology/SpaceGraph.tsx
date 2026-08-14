import { useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { META_EDGES, RELATION_GLOSSARY, SPACES, spaceOf, type SpaceId } from './meta'
import { Drawer, Sec } from '../admin/ui'
import { fmt } from '../admin/catalog'

/** 스페이스 노드 크기 */
const W = 152
const H = 58

/** 사각 경계에서 선을 끊는다 — 선이 상자 위로 올라오지 않게 */
function edgePt(fx: number, fy: number, tx: number, ty: number, pad = 6) {
  const dx = tx - fx
  const dy = ty - fy
  const hw = W / 2 + pad
  const hh = H / 2 + pad
  const s = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: fx + dx * s, y: fy + dy * s }
}

export default function SpaceGraph({ snap }: { snap: SimSnapshot }) {
  const [open, setOpen] = useState<SpaceId | null>(null)
  const [hover, setHover] = useState<SpaceId | null>(null)
  const sp = open ? spaceOf(open) : null

  const lit = (e: { from: SpaceId; to: SpaceId }) => !hover || e.from === hover || e.to === hover
  const litNode = (id: SpaceId) => !hover || id === hover || META_EDGES.some((e) => (e.from === hover && e.to === id) || (e.to === hover && e.from === id))
  const total = SPACES.reduce((n, s) => n + s.types.reduce((m, t) => m + t.count(snap), 0), 0)
  const typeCount = SPACES.reduce((n, s) => n + s.types.length, 0)

  return (
    <div className="space-y-3">
      <Panel
        title="9개 스페이스 — 데이터가 서 있는 의미 구조"
        right={
          <span className="text-[11px] font-semibold text-gray-500">
            노드 타입 {typeCount} · 인스턴스 {fmt(total)} · 스페이스를 누르면 상세
          </span>
        }
      >
        <div className="overflow-x-auto">
          <svg viewBox="0 0 950 460" className="w-full min-w-[760px]" role="img" aria-label="메타 온톨로지 스페이스 그래프">
            {/* ① 간선 */}
            <g fill="none">
              {META_EDGES.map((e) => {
                const a = spaceOf(e.from)
                const b = spaceOf(e.to)
                const p1 = edgePt(a.x, a.y, b.x, b.y)
                const p2 = edgePt(b.x, b.y, a.x, a.y)
                const on = lit(e)
                const c = b.color
                const d = e.bow
                  ? `M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2 + e.bow} ${(p1.y + p2.y) / 2} ${p2.x} ${p2.y}`
                  : `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
                return (
                  <path
                    key={`${e.from}-${e.to}`}
                    d={d}
                    stroke={c}
                    strokeOpacity={on ? (e.core ? 0.75 : 0.4) : 0.07}
                    strokeWidth={e.core ? 2.4 : 1.4}
                  />
                )
              })}
            </g>
            {/* ② 관계 어휘 */}
            <g>
              {META_EDGES.map((e) => {
                const a = spaceOf(e.from)
                const b = spaceOf(e.to)
                const p1 = edgePt(a.x, a.y, b.x, b.y)
                const p2 = edgePt(b.x, b.y, a.x, a.y)
                const mx = e.bow ? (p1.x + p2.x) / 2 + e.bow * 0.5 : (p1.x + p2.x) / 2
                const my = (p1.y + p2.y) / 2
                const on = lit(e)
                const label = e.relations.length > 2 ? `${e.relations[0]} 외 ${e.relations.length - 1}` : e.relations.join(' · ')
                return (
                  <text
                    key={`l-${e.from}-${e.to}`}
                    x={mx}
                    y={my - 4}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontWeight={700}
                    fill={spaceOf(e.to).color}
                    fillOpacity={on ? 0.95 : 0.1}
                    style={{ paintOrder: 'stroke', stroke: 'var(--color-gray-900)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                  >
                    {label}
                  </text>
                )
              })}
            </g>
            {/* ③ 스페이스 노드 */}
            <g>
              {SPACES.map((s) => {
                const n = s.types.reduce((m, t) => m + t.count(snap), 0)
                const on = litNode(s.id)
                const isCore = s.id === 'evidence' || s.id === 'claim' || s.id === 'outcome' || s.id === 'lever'
                return (
                  <g
                    key={s.id}
                    onClick={() => setOpen(s.id)}
                    onMouseEnter={() => setHover(s.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                    opacity={on ? 1 : 0.22}
                  >
                    <rect
                      x={s.x - W / 2}
                      y={s.y - H / 2}
                      width={W}
                      height={H}
                      rx={9}
                      fill="var(--color-gray-900)"
                      stroke={s.color}
                      strokeWidth={isCore ? 2.2 : 1.3}
                      strokeOpacity={isCore ? 1 : 0.75}
                    />
                    <rect x={s.x - W / 2} y={s.y - H / 2} width={W} height={H} rx={9} fill={s.color} fillOpacity={isCore ? 0.16 : 0.09} />
                    <text x={s.x} y={s.y - 12} textAnchor="middle" fontSize={13} fontWeight={900} fill={s.color}>
                      {s.ko}
                    </text>
                    <text x={s.x} y={s.y + 1} textAnchor="middle" fontSize={8} fill={s.color} fillOpacity={0.75}>
                      {s.en}
                    </text>
                    <text x={s.x} y={s.y + 17} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--color-gray-400)">
                      {s.types.length}종 · {fmt(n)}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2.4" />
            </svg>
            핵심 사슬
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            일반 관계
          </span>
          <span>· 굵은 테두리 = 핵심 4스페이스 · 스페이스에 올리면 걸린 관계만 표시</span>
        </div>
        <div className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 break-keep text-[11.5px] leading-relaxed text-gray-300">
          <b className="text-sky-300">관측 → 판정 → 성과 ← 조치.</b> 이 네 칸이 Qdrive의 뼈대입니다 — 무슨 일이 있었고(관측), 그게 무슨 뜻이며(판정),
          결과가 어떻게 되었고(성과), 우리가 무엇을 당겼는가(조치). 어떤 숫자든 이 사슬을 거꾸로 되짚어 근거를 댈 수 있습니다.
        </div>
      </Panel>

      <Drawer open={!!sp} onClose={() => setOpen(null)} title={sp ? `${sp.ko} · ${sp.en}` : ''} sub={sp?.desc}>
        {sp && (
          <>
            <Sec t="노드 타입" right={<span className="text-[11px] text-gray-500">{sp.types.length}종</span>}>
              <div className="space-y-1.5">
                {sp.types.map((t) => (
                  <div key={t.en} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-bold text-gray-100">{t.ko}</span>
                        <code className="text-[10.5px] text-gray-500">{t.en}</code>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[12px] font-bold tabular-nums" style={{ color: sp.color }}>
                          {fmt(t.count(snap))}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${t.live ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700/40 text-gray-500'}`}>
                          {t.live ? 'LIVE' : '정적'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-0.5 break-keep text-[11px] leading-relaxed text-gray-500">{t.note}</div>
                  </div>
                ))}
              </div>
            </Sec>

            <Sec t="이 스페이스가 걸린 관계">
              <div className="space-y-1.5">
                {META_EDGES.filter((e) => e.from === sp.id || e.to === sp.id).map((e) => (
                  <div key={`${e.from}-${e.to}`} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <span className="font-bold" style={{ color: spaceOf(e.from).color }}>
                        {spaceOf(e.from).ko}
                      </span>
                      <span className="text-gray-600">→</span>
                      <span className="font-bold" style={{ color: spaceOf(e.to).color }}>
                        {spaceOf(e.to).ko}
                      </span>
                      {e.core && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-sky-300">핵심</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {e.relations.map((r) => (
                        <span key={r} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-300" title={RELATION_GLOSSARY[r]}>
                          {r}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 break-keep text-[11px] text-gray-500">{e.desc}</div>
                  </div>
                ))}
              </div>
            </Sec>
          </>
        )}
      </Drawer>
    </div>
  )
}
