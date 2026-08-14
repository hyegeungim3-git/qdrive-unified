import { useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { BASIS_CAP, IMPACT_ON_LEVER, LEVERS, simulate, spaceOf, type Basis, type LeverDef } from './meta'
import { fmt } from '../admin/catalog'

const basisTone: Record<Basis, string> = {
  실측: 'bg-emerald-500/15 text-emerald-400',
  환산: 'bg-sky-500/15 text-sky-400',
  추정: 'bg-amber-500/15 text-amber-400',
  정성: 'bg-gray-700/40 text-gray-400',
}
const stageTone: Record<LeverDef['stage'], string> = {
  '1차': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  '2차': 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  '3차': 'border-violet-500/30 bg-violet-500/10 text-violet-400',
}

const num = (v: number, d: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * 조치 시뮬레이터 — 온톨로지의 `조치 ─올린다→ 성과` 관계를 따라 예측한다.
 * 관계가 없으면 예측도 없다. 계수의 출처(근거 유형)를 함께 표시하고,
 * 근거가 약한 것은 신뢰도 상한 자체를 낮춘다.
 */
export default function Simulator({ snap }: { snap: SimSnapshot }) {
  const [key, setKey] = useState(LEVERS[0].key)
  const [mag, setMag] = useState(0.5)
  const lever = LEVERS.find((l) => l.key === key)!
  const lv = spaceOf('lever')
  const oc = spaceOf('outcome')

  return (
    <div className="space-y-3">
      <Panel
        title="조치 시뮬레이터 — 손잡이를 당기면 성과가 얼마나 움직이나"
        right={<span className="text-[11px] font-semibold text-gray-500">조치 {LEVERS.length}종 · 온톨로지 관계를 따라 계산</span>}
      >
        {/* 조치 선택 */}
        <div className="grid grid-cols-5 gap-2 max-[1100px]:grid-cols-3 max-[720px]:grid-cols-2">
          {LEVERS.map((l) => {
            const on = l.key === key
            return (
              <button
                key={l.key}
                onClick={() => setKey(l.key)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  on ? 'border-pink-400/60 bg-pink-400/10' : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[12.5px] font-bold ${on ? 'text-gray-50' : 'text-gray-300'}`}>{l.ko}</span>
                  <span className={`shrink-0 rounded border px-1 py-0.5 text-[9.5px] font-bold ${stageTone[l.stage]}`}>{l.stage}</span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-gray-500">{l.targets.length}개 성과에 연결</div>
                <div className="mt-1 text-[11px] font-bold tabular-nums" style={{ color: on ? lv.color : undefined }}>
                  {l.liveLabel} {fmt(l.live(snap))}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-black" style={{ color: lv.color }}>
                  {lever.ko}
                </span>
                <code className="text-[10.5px] text-gray-600">{lever.en}</code>
              </div>
              <div className="mt-0.5 break-keep text-[11.5px] text-gray-500">{lever.desc}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {IMPACT_ON_LEVER.map((i) => (
                <span key={i.id} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400" title={i.why}>
                  {i.id} {i.ko}
                </span>
              ))}
            </div>
          </div>

          {/* 강도 */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-[11.5px] font-bold text-gray-300">조치 강도</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(mag * 100)}
              onChange={(e) => setMag(Number(e.target.value) / 100)}
              className="h-1.5 min-w-[220px] flex-1 cursor-pointer accent-pink-400"
              aria-label="조치 강도"
            />
            <span className="w-[52px] shrink-0 text-right text-[15px] font-black tabular-nums" style={{ color: lv.color }}>
              {Math.round(mag * 100)}%
            </span>
            <div className="flex gap-1">
              {[0, 0.25, 0.5, 0.75, 1].map((m) => (
                <button
                  key={m}
                  onClick={() => setMag(m)}
                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${mag === m ? 'bg-pink-400/20 text-pink-300' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
                >
                  {m * 100}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1.5 break-keep text-[11px] text-gray-500">
            강도 100% = 지금 이 조치가 만들어내고 있는 효과의 전부. 0%면 조치를 끈 상태 — 그때의 성과가 곧 <b className="text-gray-400">기준선</b>입니다.
          </div>
        </div>
      </Panel>

      <Panel
        title="예측 결과 — 조치 → 성과"
        right={<span className="text-[11px] text-gray-500">현재 엔진 값에서 출발</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">성과</th>
                <th className="py-2 pr-3 font-semibold">관계</th>
                <th className="py-2 pr-3 text-right font-semibold">현재</th>
                <th className="py-2 pr-3 text-right font-semibold">예측</th>
                <th className="py-2 pr-3 text-right font-semibold">변화</th>
                <th className="py-2 pr-3 font-semibold">근거</th>
                <th className="py-2 text-right font-semibold">신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {lever.targets.map((t) => {
                const r = simulate(t, mag, snap)
                const up = r.delta > 0.0001
                const down = r.delta < -0.0001
                return (
                  <tr key={t.outcome} className="border-b border-gray-800/60">
                    <td className="py-2 pr-3">
                      <div className="font-bold" style={{ color: oc.color }}>
                        {t.outcome}
                      </div>
                      <div className="break-keep text-[10.5px] text-gray-500">{t.why}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="whitespace-nowrap rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-300">{t.rel}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-400">
                      {num(r.base, t.decimals)}
                      <span className="ml-0.5 text-[10px] text-gray-600">{t.unit}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tabular-nums text-gray-100">
                      {t.rel === '안정시킨다' ? '—' : num(r.predicted, t.decimals)}
                      {t.rel !== '안정시킨다' && <span className="ml-0.5 text-[10px] text-gray-500">{t.unit}</span>}
                    </td>
                    <td className={`py-2 pr-3 text-right font-bold tabular-nums ${up ? 'text-emerald-400' : down ? 'text-sky-400' : 'text-gray-500'}`}>
                      {t.rel === '안정시킨다' ? (
                        <span className="text-sky-400">편차 −{(r.spreadCut * 100).toFixed(1)}%</span>
                      ) : (
                        <>
                          {up ? '+' : ''}
                          {num(r.delta, t.decimals)}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-bold ${basisTone[t.basis]}`}>{t.basis}</span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-800">
                          <div
                            className={`h-full rounded-full ${r.confidence >= 0.85 ? 'bg-emerald-500' : r.confidence >= 0.7 ? 'bg-sky-500' : 'bg-amber-500'}`}
                            style={{ width: `${r.confidence * 100}%` }}
                          />
                        </div>
                        <span className="w-[34px] text-right font-bold tabular-nums text-gray-300">{Math.round(r.confidence * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 max-[900px]:grid-cols-1">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
            <div className="mb-1 text-[11px] font-bold text-gray-300">근거 유형별 신뢰도 상한</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(BASIS_CAP) as Basis[]).map((b) => (
                <span key={b} className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${basisTone[b]}`}>
                  {b} ≤ {Math.round(BASIS_CAP[b] * 100)}%
                </span>
              ))}
            </div>
            <div className="mt-1.5 break-keep text-[11px] leading-relaxed text-gray-500">
              근거가 약한 계수는 강도를 아무리 올려도 신뢰도가 상한을 넘지 않습니다. <b className="text-gray-400">모르는 것을 아는 척하지 않는 장치</b>입니다.
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
            <div className="mb-1 text-[11px] font-bold text-amber-400">이 조치를 실제로 움직이면</div>
            {IMPACT_ON_LEVER.map((i) => (
              <div key={i.id} className="break-keep text-[11px] leading-relaxed text-gray-300">
                <b className="text-amber-400">{i.id} {i.ko}</b> — {i.why}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 break-keep text-[11.5px] leading-relaxed text-gray-500">
          이 시뮬레이션은 추측이 아니라 <b className="text-gray-300">온톨로지에 등록된 조치→성과 관계</b>를 따라 계산됩니다. 관계가 없으면 예측도
          없습니다. 실증에서는 각 계수를 실측으로 교체하고, 근거 유형이 «추정»인 항목부터 «실측»으로 승격시키는 것이 목표입니다.
        </div>
      </Panel>
    </div>
  )
}
