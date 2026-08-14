import { useState } from 'react'
import { Panel } from '../../components/ui'
import { CONNECTORS, LINEAGE, stageTone } from './catalog'

export default function Lineage({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [pick, setPick] = useState<string>('DTG 409')

  const impacted = LINEAGE.filter((l) => l.src.includes(pick))
  const liveSrc = CONNECTORS.filter((c) => c.stage === '1차').map((c) => c.code)

  return (
    <div className="space-y-3">
      <Panel title="데이터 계보 — 어느 원천이 어느 화면을 움직이나" right={<span className="text-[11px] text-gray-500">서비스명을 누르면 그 화면으로</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">원천</th>
                <th className="py-2 pr-3 font-semibold">→ AI-Ready 데이터셋</th>
                <th className="py-2 pr-3 font-semibold">→ 서비스 화면</th>
                <th className="py-2 font-semibold">단계</th>
              </tr>
            </thead>
            <tbody>
              {LINEAGE.map((l) => (
                <tr key={l.ds} className="border-b border-gray-800/60">
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {l.src.map((s) => (
                        <button
                          key={s}
                          onClick={() => setPick(s)}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors ${
                            pick === s ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'text-emerald-400 hover:bg-gray-800/60'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-gray-100">{l.ds}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {l.svc.map((s) => (
                        <button
                          key={s.name}
                          onClick={() => onNavigate?.(s.tab)}
                          className="rounded border border-gray-800 px-1.5 py-0.5 text-[11px] text-gray-400 transition-colors hover:border-sky-600 hover:text-sky-300 focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          {s.name} →
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-2">
                    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] font-bold ${stageTone[l.stage]}`}>{l.stage}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="영향도 분석 — 이 원천이 끊기면 무엇이 멈추나"
        right={<span className="text-[11px] text-gray-500">원천을 선택하세요</span>}
      >
        <div className="mb-3 flex flex-wrap gap-1">
          {CONNECTORS.map((c) => (
            <button
              key={c.code}
              onClick={() => setPick(c.code)}
              className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                pick === c.code
                  ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40'
                  : liveSrc.includes(c.code)
                    ? 'bg-gray-800/60 text-gray-300 hover:text-gray-100'
                    : 'bg-gray-800/30 text-gray-600 hover:text-gray-400'
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>

        {impacted.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-5 text-center text-[12px] text-gray-500">
            <b className="text-gray-300">{pick}</b> 은(는) 아직 계보에 연결된 데이터셋이 없습니다 — 연동 시 이 자리에 영향 범위가 표시됩니다.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 break-keep text-[12px] leading-relaxed text-gray-200">
              <b className="text-amber-400">{pick}</b> 수집이 중단되면 데이터셋 {impacted.length}종,{' '}
              서비스 {new Set(impacted.flatMap((l) => l.svc.map((s) => s.name))).size}개가 영향을 받습니다.
            </div>
            {impacted.map((l) => (
              <div key={l.ds} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-bold text-gray-100">{l.ds}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-bold ${stageTone[l.stage]}`}>{l.stage}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {l.svc.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => onNavigate?.(s.tab)}
                      className="rounded border border-gray-800 px-1.5 py-0.5 text-[11px] text-gray-400 hover:border-sky-600 hover:text-sky-300"
                    >
                      {s.name} →
                    </button>
                  ))}
                </div>
                <div className="mt-1 break-keep text-[11px] text-gray-500">
                  대체 경로 — {l.src.filter((s) => s !== pick).length > 0 ? `${l.src.filter((s) => s !== pick).join(' · ')} 로 부분 동작 (정밀도 하향)` : '대체 원천 없음 — 기능 중단'}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 break-keep text-[11.5px] leading-relaxed text-gray-500">
          계보를 기록하는 이유 — <b className="text-gray-300">어떤 화면의 숫자든 원천까지 거슬러 확인할 수 있어야</b> 의회·감사·검증기관에 방어할 수
          있습니다. 원천이 바뀌거나 품질 문제가 생기면 영향받는 서비스가 바로 특정됩니다.
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
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 break-keep text-[11.5px] leading-relaxed text-gray-300">
              <b className="text-emerald-400">구조를 바꾸지 않습니다.</b> 새 원천은 커넥터를 하나 추가하고 같은 중심축(운행 단위)에 연결하면 끝 — 품질
              룰·온톨로지·데이터셋 정의는 그대로 재사용됩니다. 이것이 지금 1차만으로도 시작할 수 있는 이유입니다.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
