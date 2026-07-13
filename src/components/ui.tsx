import type { ReactNode } from 'react'

export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900/60 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
          <div className="text-sm font-bold tracking-tight text-gray-100">{title}</div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function KpiCard({
  label,
  value,
  unit,
  sub,
  accent = 'text-gray-100',
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 transition-colors hover:border-gray-700">
      <div className="text-[11px] font-semibold tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tracking-tight tabular-nums ${accent}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-gray-400">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div>}
    </div>
  )
}

export function ScoreBadge({ score }: { score: number }) {
  const s = Math.round(score)
  const cls =
    s >= 90
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : s >= 80
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-red-500/15 text-red-400 border-red-500/30'
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums ${cls}`}>
      {s}점
    </span>
  )
}

export function PersonaChip({ persona }: { persona: 'A' | 'B' | 'C' }) {
  const map = {
    A: ['모범', 'text-emerald-400 border-emerald-500/30'],
    B: ['평균', 'text-sky-400 border-sky-500/30'],
    C: ['개선필요', 'text-red-400 border-red-500/30'],
  } as const
  const [label, cls] = map[persona]
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${cls}`}>{label}</span>
}

/** 시뮬레이션 시각 → HH:MM 표기 (데모는 06:00 출발 가정) */
export function simClock(simTime: number): string {
  const base = 6 * 3600
  const t = base + Math.floor(simTime)
  const h = Math.floor(t / 3600) % 24
  const m = Math.floor((t % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
