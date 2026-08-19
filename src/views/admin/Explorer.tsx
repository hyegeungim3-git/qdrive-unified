import { useMemo, useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { ONTO } from './catalog'
import { entryPoints, neighborhood, type InstNode } from './instance'

/**
 * 인스턴스 탐색기 — 클래스가 아니라 **실제 레코드 사이의 연결**을 걷는다.
 * 노드를 누를 때마다 그 레코드가 중심이 되고, 지나온 길이 경로로 남는다.
 */

const colorOf = (cls: string) => ONTO.find((c) => c.key === cls)?.color ?? '#94a3b8'
const nameOf = (cls: string) => ONTO.find((c) => c.key === cls)?.label ?? cls

export default function Explorer({ snap }: { snap: SimSnapshot }) {
  const entries = useMemo(() => entryPoints(snap), [snap.trips.length, snap.events.length, snap.vehicles.length])
  const [focus, setFocus] = useState<string | null>(null)
  const [trail, setTrail] = useState<InstNode[]>([])

  const active = focus ?? entries[0]?.id ?? null
  const hood = active ? neighborhood(snap, active) : null

  const go = (n: InstNode) => {
    setTrail((prev) => {
      const cut = prev.findIndex((x) => x.id === n.id)
      if (cut >= 0) return prev.slice(0, cut + 1)
      const head = hood ? [...prev.filter((x) => x.id !== hood.center.id), hood.center] : prev
      return head.slice(-5)
    })
    setFocus(n.id)
  }

  if (!hood) {
    return (
      <Panel title="기록 탐색 — 실제 기록 사이의 연결">
        <div className="py-8 text-center text-[12px] text-gray-500">
          아직 걸어볼 기록이 없습니다 — 배속을 올려 운행이 쌓이면 여기서 연결을 따라갈 수 있습니다.
        </div>
      </Panel>
    )
  }

  /* 방사형 배치 — 중심 1 + 이웃 n */
  const W = 760
  const H = 340
  const cx = W / 2
  const cy = H / 2
  const R = 235
  const RY = 128
  const nodes = hood.nodes.slice(0, 9)
  const layout = nodes.map((n, i) => {
    const a = (Math.PI * 2 * i) / nodes.length - Math.PI / 2
    return { n, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * RY }
  })
  const NW = 116
  const NH = 34
  const CW = 150
  const CH = 44

  /** 사각 노드 경계에서 선을 끊는다 — 선이 상자 위로 올라오지 않게 */
  const edgePoint = (fx: number, fy: number, tx: number, ty: number, hw: number, hh: number) => {
    const dx = tx - fx
    const dy = ty - fy
    const s = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
    return { x: fx + dx * s, y: fy + dy * s }
  }

  return (
    <Panel
      title="기록 탐색 — 실제 기록 사이의 연결"
      right={<span className="text-[11px] text-gray-500">동그라미를 누르면 그 기록이 중심이 됩니다</span>}
    >
      {/* 시작점 + 경로 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-gray-500">시작점</span>
        {entries.slice(0, 6).map((e) => (
          <button
            key={e.id}
            onClick={() => {
              setTrail([])
              setFocus(e.id)
            }}
            className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
              active === e.id ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40' : 'bg-gray-800/60 text-gray-400 hover:text-gray-200'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>
      {trail.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-gray-800 bg-gray-900/50 px-2.5 py-1.5">
          <span className="text-[10.5px] font-semibold text-gray-500">지나온 경로</span>
          {trail.map((t) => (
            <span key={t.id} className="flex items-center gap-1">
              <button onClick={() => go(t)} className="text-[11px] font-semibold hover:underline" style={{ color: colorOf(t.cls) }}>
                {t.label}
              </button>
              <span className="text-gray-700">→</span>
            </span>
          ))}
          <span className="text-[11px] font-bold text-gray-200">{hood.center.label}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" role="img" aria-label="인스턴스 연결 그래프">
          {/* ① 간선 */}
          <g>
            {layout.map(({ n, x, y }) => {
              const a = edgePoint(cx, cy, x, y, CW / 2 + 4, CH / 2 + 4)
              const b = edgePoint(x, y, cx, cy, NW / 2 + 4, NH / 2 + 4)
              return <line key={`e-${n.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorOf(n.cls)} strokeOpacity={0.5} strokeWidth={1.6} />
            })}
          </g>
          {/* ② 관계 이름 */}
          <g>
            {layout.map(({ n, x, y }) => {
              const rel = hood.edges.find((e) => e.to === n.id || e.from === n.id)?.rel ?? ''
              const a = edgePoint(cx, cy, x, y, CW / 2 + 4, CH / 2 + 4)
              const b = edgePoint(x, y, cx, cy, NW / 2 + 4, NH / 2 + 4)
              return (
                <text
                  key={`r-${n.id}`}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 3}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={700}
                  fill={colorOf(n.cls)}
                  fillOpacity={0.95}
                  style={{ paintOrder: 'stroke', stroke: 'var(--color-gray-900)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                >
                  {rel}
                </text>
              )
            })}
          </g>
          {/* ③ 노드 */}
          <g>
            {layout.map(({ n, x, y }) => {
              const c = colorOf(n.cls)
              return (
                <g key={n.id} onClick={() => go(n)} style={{ cursor: 'pointer' }}>
                  <rect x={x - NW / 2} y={y - NH / 2} width={NW} height={NH} rx={7} fill="var(--color-gray-900)" stroke={c} strokeWidth={1.3} strokeOpacity={0.8} />
                  <rect x={x - NW / 2} y={y - NH / 2} width={NW} height={NH} rx={7} fill={c} fillOpacity={0.12} />
                  <text x={x} y={y - 2} textAnchor="middle" fontSize={9.5} fontWeight={800} fill={c}>
                    {n.label.length > 13 ? n.label.slice(0, 12) + '…' : n.label}
                  </text>
                  {n.sub && (
                    <text x={x} y={y + 9} textAnchor="middle" fontSize={7.5} fill="var(--color-gray-500)">
                      {n.sub.length > 18 ? n.sub.slice(0, 17) + '…' : n.sub}
                    </text>
                  )}
                </g>
              )
            })}
            {/* 중심 */}
            <g>
              <rect x={cx - CW / 2} y={cy - CH / 2} width={CW} height={CH} rx={9} fill="var(--color-gray-900)" stroke={colorOf(hood.center.cls)} strokeWidth={2.2} />
              <rect x={cx - CW / 2} y={cy - CH / 2} width={CW} height={CH} rx={9} fill={colorOf(hood.center.cls)} fillOpacity={0.2} />
              <text x={cx} y={cy - 3} textAnchor="middle" fontSize={11.5} fontWeight={900} fill={colorOf(hood.center.cls)}>
                {hood.center.label}
              </text>
              {hood.center.sub && (
                <text x={cx} y={cy + 11} textAnchor="middle" fontSize={8} fill="var(--color-gray-400)">
                  {hood.center.sub.length > 26 ? hood.center.sub.slice(0, 25) + '…' : hood.center.sub}
                </text>
              )}
            </g>
          </g>
        </svg>
      </div>

      {/* 트리플 — 주어 ─술어→ 목적어 */}
      <div className="mt-2 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-bold text-sky-300">연결 관계 (주어 ─ 관계 → 목적어)</span>
          <span className="text-[10.5px] text-gray-500">{hood.edges.length}건 · 지금 데이터에서 실제로 성립</span>
        </div>
        <div className="max-h-[168px] space-y-0.5 overflow-y-auto">
          {hood.edges.slice(0, 12).map((e, i) => {
            const from = e.from === hood.center.id ? hood.center : hood.nodes.find((n) => n.id === e.from)
            const to = e.to === hood.center.id ? hood.center : hood.nodes.find((n) => n.id === e.to)
            if (!from || !to) return null
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5 border-b border-gray-800/50 py-1 text-[11.5px] last:border-0">
                <button onClick={() => go(from)} className="font-bold hover:underline" style={{ color: colorOf(from.cls) }}>
                  {from.label}
                </button>
                <span className="text-gray-600">─</span>
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-300">{e.rel}</span>
                <span className="text-gray-600">→</span>
                <button onClick={() => go(to)} className="font-bold hover:underline" style={{ color: colorOf(to.cls) }}>
                  {to.label}
                </button>
                <span className="ml-auto text-[10.5px] text-gray-600">
                  {nameOf(from.cls)} → {nameOf(to.cls)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 break-keep text-[11.5px] leading-relaxed text-gray-500">
        이것이 온톨로지가 실제로 하는 일입니다 — <b className="text-gray-300">한 기록에서 옆 기록으로 계속 걸어갈 수 있다</b>는 것. 급감속 하나에서
        차량 → 기사 → 그날 날씨 → 상황 설명까지 이어지기 때문에 "왜 그랬나"에 근거를 대며 답할 수 있습니다.
      </div>
    </Panel>
  )
}
