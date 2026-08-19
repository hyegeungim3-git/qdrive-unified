import { useEffect, type ReactNode } from 'react'
import type { Row } from './catalog'

/** 스파크라인 — 24시간 수신량 추이 (SVG, 애니메이션 없음) */
export function Spark({ data, color = '#38bdf8', h = 30 }: { data: number[]; color?: string; h?: number }) {
  const max = Math.max(1, ...data)
  const w = 120
  const step = w / Math.max(1, data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[30px] w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity={0.12} stroke="none" />
    </svg>
  )
}

/** 상태 점 + 라벨 */
export function Dot({ tone }: { tone: 'ok' | 'warn' | 'off' }) {
  const c = tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-gray-600'
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${c} ${tone === 'ok' ? 'animate-pulse' : ''}`} />
}

/** 작은 통계 쌍 */
export function Stat({ label, value, tone = 'text-gray-200' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-gray-500">{label}</div>
      <div className={`truncate text-[12.5px] font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

/** 라벨-값 정의행 */
export function Def({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-gray-800/60 py-1.5 last:border-0">
      <div className="w-[86px] shrink-0 text-[11px] font-semibold text-gray-500">{k}</div>
      <div className="min-w-0 flex-1 break-keep text-[11.5px] leading-relaxed text-gray-300">{v}</div>
    </div>
  )
}

/** 레코드 표 — 원천 샘플·격리 샘플 공용 */
export function RecordTable({ rows, empty = '표시할 데이터가 없습니다' }: { rows: Row[]; empty?: string }) {
  if (!rows.length) return <div className="py-5 text-center text-[11.5px] text-gray-500">{empty}</div>
  const cols = Object.keys(rows[0])
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11.5px]">
        <thead>
          <tr className="border-b border-gray-800 text-[10.5px] text-gray-500">
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap py-1.5 pr-3 font-semibold last:pr-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-800/50 last:border-0">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-gray-300 last:pr-0">
                  {r[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 우측 상세 드로어 — ESC·배경 클릭으로 닫힘 */
export function Drawer({
  open,
  title,
  sub,
  onClose,
  children,
}: {
  open: boolean
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[3000] flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[560px] flex-col border-l border-gray-800 bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="상세 보기"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-black text-gray-50">{title}</div>
            {sub && <div className="mt-0.5 truncate text-[11.5px] text-gray-500">{sub}</div>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:text-gray-100 focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            ✕ 닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  )
}

/** 드로어 내부 섹션 */
export function Sec({ t, right, children }: { t: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="text-[12px] font-black tracking-wide text-sky-300">{t}</h4>
        {right}
      </div>
      {children}
    </section>
  )
}

/** 로그 라인 */
export function LogRow({ at, level, msg }: { at: string; level: '정보' | '경고' | '오류'; msg: string }) {
  const tone =
    level === '오류' ? 'bg-red-500/15 text-red-400' : level === '경고' ? 'bg-amber-500/15 text-amber-400' : 'bg-gray-700/40 text-gray-400'
  return (
    <div className="flex items-start gap-2 border-b border-gray-800/50 py-1.5 last:border-0">
      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-gray-600">{at}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{level}</span>
      <span className="min-w-0 break-keep text-[11.5px] leading-relaxed text-gray-400">{msg}</span>
    </div>
  )
}

/** 검색 입력 */
export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-600">🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-800 bg-gray-900 py-1.5 pl-7 pr-7 text-[12px] text-gray-200 placeholder:text-gray-600 focus:border-sky-600 focus:outline-none"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="검색어 지우기"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 hover:text-gray-300"
        >
          ✕
        </button>
      )}
    </div>
  )
}

/** 필터 칩 그룹 */
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
            value === o ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40' : 'bg-gray-800/60 text-gray-400 hover:text-gray-200'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
