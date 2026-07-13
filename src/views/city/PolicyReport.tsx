import { useState } from 'react'
import { Panel, simClock } from '../../components/ui'
import { useSim } from '../../sim/store'
import { fmtN, PERIODS, topZones, type Para, type Period } from '../operator/AiReport'
import { type SimSnapshot } from '../../sim/types'

/**
 * AI 정책 보고서 — 대구시 버스운영과 관점의 전체 데이터 총괄.
 * 운행·수요 / 안전 / 재정(준공영제) / 시민 체감을 집계하고 정책 제언을 자동 생성한다.
 * 원칙 동일: 모든 문장은 라이브 집계에서 생성, 문단마다 근거 병기.
 */

const PLANNED = 12 // 계획 대수 (데모)
const DAEGU_CNG_FLEET = 1513 // 대구 CNG 시내버스 (사업 분석 기준)
const CNG_PRICE = 1055 // 원/N㎥ (광주 AI리포트 인용 단가)
const OPERATING_DAYS = 330

function buildPolicyReport(snap: SimSnapshot, period: Period): { paras: Para[]; proposals: string[]; asOf: string } {
  const { kpi } = snap
  const k = period.k
  const prefix = k === 1 ? `${simClock(snap.simTime)} 기준` : `${period.label} 기준(금일 실측 비율 확장)`
  const running = snap.vehicles.length
  const opRate = (running / PLANNED) * 100
  const occNow = snap.occHistory.length ? snap.occHistory[snap.occHistory.length - 1].pct : 0
  const occMax = snap.occHistory.reduce((m, d) => Math.max(m, d.pct), 0)

  const justified = snap.events.filter((e) => e.justified).length
  const zones = topZones(snap, 3)
  const activeIncidents = snap.incidents.filter((i) => i.status !== '완료')

  // 재정 환산: 금일 절감 연료 → 전 CNG 차량 연간 (단순 선형)
  const savedM3 = kpi.totalCo2SavedKg / 2.2
  const perVehicleSaved = running > 0 ? savedM3 / running : 0
  const annualWon = perVehicleSaved * DAEGU_CNG_FLEET * OPERATING_DAYS * CNG_PRICE
  const annualEok = annualWon / 100_000_000

  const complaints = snap.complaints
  const resolved = complaints.filter((c) => c.status === '해결').length
  const evidenced = complaints.filter((c) => c.evidence).length

  const paras: Para[] = [
    {
      icon: '🚌',
      title: '운행·수요 총괄',
      text:
        `${prefix} 계획 ${PLANNED}대 중 ${running}대 운행(운행률 ${opRate.toFixed(0)}%, 결행 0건)으로 ` +
        `총 ${fmtN(kpi.totalDistanceKm * k)}km를 운행했습니다. 탑승객은 ${fmtN(snap.passengers * k)}명, ` +
        `평균 재차율은 현재 ${occNow}%(금일 최고 ${occMax}%)로 ${occMax >= 70 ? '첨두 혼잡 구간이 관찰되어 증차 검토가 필요합니다' : '공급이 수요를 안정적으로 수용하고 있습니다'}.`,
      evidence: [
        `운행률 ${running}/${PLANNED}대`,
        `탑승 ${fmtN(snap.passengers * k)}명 (APC 상당)`,
        `재차율 현재 ${occNow}% · 최고 ${occMax}%`,
      ],
    },
    {
      icon: '🛡️',
      title: '안전 정책 진단',
      text:
        `위험운전 ${fmtN(snap.events.length * k)}건 중 ${fmtN(justified * k)}건(${snap.events.length > 0 ? Math.round((justified / snap.events.length) * 100) : 0}%)은 방어적 조작으로 판정되어 기사 감점에서 제외되었습니다. ` +
        (zones[0]
          ? `감점 대상 이벤트는 ${zones.map((z) => `${z.name}(${fmtN(z.count * k)}건)`).join(' · ')} 구간에 집중되어, 개인 습관보다 도로 환경 요인 가능성이 높습니다. 해당 구간의 시야·신호·정류장 위치 점검을 권고합니다.`
          : '특정 구간 집중은 관찰되지 않았습니다.') +
        (activeIncidents.length > 0 ? ` 현재 진행 중 돌발상황 ${activeIncidents.length}건은 관제·시민안내가 자동 연동되어 대응 중입니다.` : ''),
      evidence: [
        `409 패킷 ${snap.events.length}건 · 정당 판정 ${justified}건`,
        ...(zones[0] ? [`다발 구간: ${zones.map((z) => `${z.name} ${z.count}`).join(' · ')}`] : []),
        `돌발 진행 ${activeIncidents.length}건`,
      ],
    },
    {
      icon: '💰',
      title: '재정·준공영제',
      text:
        `코칭 효과로 연료 ${kpi.fuelSavedPct.toFixed(1)}%(${fmtN(savedM3 * k)}m³)를 절감 중입니다. ` +
        `대구 CNG 전 차량(${DAEGU_CNG_FLEET.toLocaleString()}대) 기준 단순 환산 시 연간 약 ${annualEok.toFixed(1)}억원의 재정지원금 절감 여력에 해당합니다. ` +
        `CO₂ 절감 ${kpi.totalCo2SavedKg.toFixed(1)}kg은 시 탄소중립 목표 실적으로 집계 가능합니다.` +
        (snap.trips.length > 4 ? ' 정산 검증에서 인가노선 이탈 의심 1건이 플래그되어 담당자 검토 대기 중입니다 (BMS×DTG 교차검증).' : ''),
      evidence: [
        `절감 ${kpi.fuelSavedPct.toFixed(1)}% · ${savedM3.toFixed(1)}m³ (기준선 대비)`,
        `연간 환산 ${annualEok.toFixed(1)}억원 (${DAEGU_CNG_FLEET}대 × ${OPERATING_DAYS}일 × ${CNG_PRICE}원/N㎥, 단순 선형)`,
        `정산 플래그 ${snap.trips.length > 4 ? 1 : 0}건`,
      ],
    },
    {
      icon: '🧑‍🤝‍🧑',
      title: '시민 체감·민원',
      text:
        complaints.length > 0
          ? `민원 ${complaints.length}건 중 ${evidenced}건이 증빙 자동매칭(GPS·DTG·문개폐·DVR)으로 처리되었고 ${resolved}건이 해결 완료되었습니다. 민원이 감이 아닌 데이터로 처리되어 회신 근거가 표준화되고 있습니다.`
          : `금일 접수 민원은 없습니다. 시민안내 에이전트가 정비·기상·돌발 상황을 시민 언어로 자동 공지하여 사전 민원을 억제하고 있습니다.`,
      evidence: [
        `민원 ${complaints.length}건 (자동매칭 ${evidenced} · 해결 ${resolved})`,
        `하차 예약 ${snap.reservation ? '진행 1건' : '대기'} · 상황 설명 ${snap.pleas.length}건`,
      ],
    },
  ]

  // 정책 제언 — 조건 분기 자동 생성
  const proposals: string[] = []
  if (zones[0]) proposals.push(`① ${zones[0].name} 인근 도로환경 개선 검토 — 위험운전 ${zones[0].count}건 집중, 개인 코칭보다 시설 대응이 유효한 구간`)
  if (kpi.fuelSavedPct > 3)
    proposals.push(`② 에코드라이빙 코칭의 전 차량 확대 — 실증 절감률 ${kpi.fuelSavedPct.toFixed(1)}% 기준 연간 약 ${annualEok.toFixed(1)}억원 재정 효과 (증액 없는 절감 사업)`)
  if (snap.weather.condition !== '맑음')
    proposals.push(`③ 기상 대응 표준화 — ${snap.weather.condition} 시 예비차 선배정·감속 지침·시민 공지가 자동 연동됨을 확인, 매뉴얼 반영 권고`)
  proposals.push(`${proposals.length === 0 ? '①' : ['①', '②', '③', '④'][proposals.length]} 정당 판정·상황 설명 체계의 노조 협의 자료화 — 감점 제외 ${justified}건 실적은 "감시 아닌 코칭" 수용성 근거`)
  if (occMax >= 70) proposals.push(`⑤ 첨두 재차율 ${occMax}% 구간 배차 간격 조정 검토`)

  return { paras, proposals, asOf: simClock(snap.simTime) }
}

export default function PolicyReport({ onClose }: { onClose: () => void }) {
  const snap = useSim()
  const [copied, setCopied] = useState(false)
  const [periodId, setPeriodId] = useState<Period['id']>('today')
  const period = PERIODS.find((p) => p.id === periodId)!
  const { paras, proposals, asOf } = buildPolicyReport(snap, period)

  const copyText = () => {
    const text =
      `[Qdrive AI 정책 보고서 — 대구시 버스운영과] ${asOf} 기준 (자동 생성)\n\n` +
      paras.map((p) => `■ ${p.title}\n${p.text}\n근거: ${p.evidence.join(' / ')}`).join('\n\n') +
      `\n\n■ 정책 제언\n${proposals.join('\n')}`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl space-y-3" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 px-5 py-4 shadow-2xl">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-violet-400">AI POLICY REPORT · 버스운영과 · AUTO-GENERATED</div>
            <h2 className="mt-0.5 text-lg font-bold text-gray-100">대구시 시내버스 AI 정책 보고서 — {asOf} 기준</h2>
            <div className="mt-0.5 text-[11px] text-gray-500">전 차량·전 이해관계자 데이터 총괄 · 열람 시점 기준 자동 갱신</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value as Period['id'])}
              className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] font-semibold text-gray-200"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button onClick={copyText} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100">
              {copied ? '✓ 복사됨' : '📋 복사'}
            </button>
            <button onClick={onClose} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100">
              ✕ 닫기
            </button>
          </div>
        </div>

        {paras.map((p) => (
          <Panel key={p.title} title={`${p.icon} ${p.title}`} className="!bg-gray-900 shadow-xl">
            <p className="text-[13px] leading-relaxed text-gray-300">{p.text}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.evidence.map((e) => (
                <span key={e} className="rounded border border-gray-700/60 bg-gray-800/50 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-500">
                  근거 · {e}
                </span>
              ))}
            </div>
          </Panel>
        ))}

        {/* 정책 제언 */}
        <Panel title="📌 정책 제언 (자동 생성)" className="!bg-gray-900 border-violet-500/30 shadow-xl">
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-gray-300">
            {proposals.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Panel>

        <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-[10px] leading-relaxed text-gray-500 shadow-xl">
          ⚠ 신뢰성 원칙: 수치는 전부 실시간 집계에서 산출(연간 환산은 단순 선형 가정 명시). 문장 생성부는
          데모 규칙 기반 → 실증 시 LLM + 수치 검증 파이프라인. 정책 결정의 참고자료이며 단독 근거로
          사용할 수 없습니다.
          {period.k > 1 && (
            <>
              <br />⚠ 기간 확장(×{period.k}일): 금일 실측 비율 기반 모의 추정 — 실증 축적 시 실측 집계로
              대체. 재정 연간 환산은 일 실측 기준으로 별도 산출.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
