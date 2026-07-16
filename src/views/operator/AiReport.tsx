import { useState } from 'react'
import { copyToClipboard, Panel, simClock } from '../../components/ui'
import { useSim } from '../../sim/store'
import { ROUTES } from '../../sim/routes'
import { indexPolyline, pointAt, haversine } from '../../sim/geo'
import { RISK_EVENT_TYPES, type SimSnapshot, type VehicleState } from '../../sim/types'

/**
 * AI 운영 리포트 — 광주 'AI+ 리포트' 벤치마킹.
 * 원칙: 모든 문장은 실시간 집계 데이터에서 자동 생성되며, 문단마다 근거 수치를 병기한다.
 * 데모는 규칙 기반 문장 생성(결정적) — 실증 단계에서 이 생성부를 LLM+검증 파이프라인으로 교체.
 */

/** 이벤트 다발 구간을 격자 클러스터링 후 최근접 정류장 이름으로 라벨링 */
export function topZones(snap: SimSnapshot, n: number) {
  const cells = new Map<string, { lat: number; lng: number; count: number }>()
  for (const e of snap.events) {
    if (e.justified) continue
    const key = `${e.lat.toFixed(3)}|${e.lng.toFixed(3)}`
    const c = cells.get(key)
    if (c) c.count++
    else cells.set(key, { lat: e.lat, lng: e.lng, count: 1 })
  }
  const stops = ROUTES.flatMap((r) => {
    const idx = indexPolyline(r.points)
    return r.stops.map((s) => ({ name: s.name, pos: pointAt(idx, s.at * idx.totalM).pos }))
  })
  return [...cells.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((c) => {
      let best = stops[0]
      let bd = Infinity
      for (const s of stops) {
        const d = haversine([c.lat, c.lng], s.pos)
        if (d < bd) {
          bd = d
          best = s
        }
      }
      return { name: best.name, count: c.count }
    })
}

export interface Para {
  icon: string
  title: string
  text: string
  evidence: string[]
}

/** 리포트 기간 — 데모는 금일 실측 비율을 운행일수로 확장(모의), 실증 시 실측 집계로 대체 */
export const PERIODS = [
  { id: 'today', label: '오늘 (실시간)', k: 1 },
  { id: 'week', label: '최근 1주', k: 7 },
  { id: 'month', label: '최근 1개월', k: 26 },
  { id: 'year', label: '최근 1년', k: 312 },
] as const
export type Period = (typeof PERIODS)[number]

export const fmtN = (x: number) => Math.round(x).toLocaleString()

function buildReport(snap: SimSnapshot, period: Period): { paras: Para[]; asOf: string } {
  const { kpi } = snap
  const k = period.k
  const prefix = k === 1 ? `금일 ${simClock(snap.simTime)} 기준` : `${period.label} 기준(금일 실측 비율 확장)`
  const effective = snap.events.filter((e) => !e.justified)
  const justified = snap.events.length - effective.length
  const eff = kpi.totalFuelM3 > 0 ? kpi.totalDistanceKm / kpi.totalFuelM3 : 0

  // 유형별 최다
  const typeCounts = RISK_EVENT_TYPES.map((t) => ({ t, c: effective.filter((e) => e.eventType === t).length }))
  const topType = typeCounts.sort((a, b) => b.c - a.c)[0]
  const zones = topZones(snap, 3)

  // 기사 순위
  const sorted = [...snap.vehicles].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const worstEvents = RISK_EVENT_TYPES.map((t) => ({ t, c: worst.eventCounts[t] })).sort((a, b) => b.c - a.c)[0]

  const paras: Para[] = []

  paras.push({
    icon: '🚌',
    title: '운행 총평',
    text:
      `${prefix} ${snap.vehicles.length}대가 총 ${fmtN(kpi.totalDistanceKm * k)}km를 운행했습니다. ` +
      `평균 연비는 ${eff.toFixed(2)}km/m³로 미코칭 기준선 대비 ${kpi.fuelSavedPct.toFixed(1)}% 절감 중이며, ` +
      `CO₂ 절감량은 ${fmtN(kpi.totalCo2SavedKg * k)}kg입니다. 탑승객은 ${fmtN(snap.passengers * k)}명으로 집계되었습니다.`,
    evidence: [
      `주행거리 ∑ ${fmtN(kpi.totalDistanceKm * k)}km (운행기록 521)`,
      `연료 ∑ ${fmtN(kpi.totalFuelM3 * k)}m³ (차량 센서 CAN)`,
      `승차 집계 ${fmtN(snap.passengers * k)}명 (승객계수 APC 상당)`,
    ],
  })

  paras.push({
    icon: '🛡️',
    title: '안전 운행',
    text:
      `위험운전은 총 ${fmtN(snap.events.length * k)}건 감지되었고, 이 중 ${fmtN(justified * k)}건은 맥락 판정(사고 회피·정류장 접근·폭우 대응 등)으로 감점에서 제외되었습니다. ` +
      (topType && topType.c > 0
        ? `감점 대상 ${fmtN(effective.length * k)}건 중 최다 유형은 ${topType.t}(${fmtN(topType.c * k)}건)이며, ` +
          (zones[0] ? `${zones[0].name} 인근(${fmtN(zones[0].count * k)}건)에 집중되어 해당 구간 서행 안내를 권장합니다.` : '특정 구간 집중은 관찰되지 않았습니다.')
        : '감점 대상 이벤트가 없어 전반적으로 안정적인 운행입니다.'),
    evidence: [
      `위험운전 기록(409) ${fmtN(snap.events.length * k)}건`,
      `정당 판정 ${fmtN(justified * k)}건 (감점 제외)`,
      ...(zones[0] ? [`다발 구간: ${zones.map((z) => `${z.name} ${fmtN(z.count * k)}건`).join(' · ')}`] : []),
    ],
  })

  paras.push({
    icon: '👨‍✈️',
    title: '운전원 코칭 제안',
    text:
      `안전점수 최상위는 ${best.driverName} 기사(${Math.round(best.score)}점, ${best.id.slice(-4)}호)로 동료 모범사례 공유를 권장합니다. ` +
      `${worst.driverName} 기사(${Math.round(worst.score)}점)는 ` +
      (worstEvents && worstEvents.c > 0
        ? `${worstEvents.t} 빈도(${worstEvents.c}건)가 높아 해당 유형 중심의 맞춤 코칭이 필요합니다.`
        : `이벤트는 적으나 점수 회복 구간으로 지속 관찰이 필요합니다.`) +
      (snap.pleas.filter((p) => p.status === '인정').length > 0
        ? ` 금일 상황 설명 인정 ${snap.pleas.filter((p) => p.status === '인정').length}건이 반영되어 점수가 복원되었습니다.`
        : ''),
    evidence: [
      `점수 분포 ${Math.round(worst.score)}~${Math.round(best.score)}점 (${snap.vehicles.length}명)`,
      `상황 설명 ${snap.pleas.length}건 (인정 ${snap.pleas.filter((p) => p.status === '인정').length})`,
    ],
  })

  const activeFault = snap.fault?.predicted
  const issuedWo = snap.workOrders.filter((w) => w.status === '발행됨').length
  paras.push({
    icon: '🔧',
    title: '차량 상태·정비',
    text: activeFault
      ? `${snap.fault!.vehicleId.slice(-4)}호에서 ${snap.fault!.kind} 예측이 발화하여(현재 ${snap.fault!.coolantTemp.toFixed(1)}°C) ` +
        (issuedWo > 0 ? '작업지시가 발행되었습니다. 회차 종료 후 입고 예정으로, 운휴 없이 예방 정비로 대응 중입니다.' : '작업지시 승인 대기 중입니다. 조속한 검토를 권장합니다.')
      : `전 차량 주요 계통(전원·냉각·연료·배기) 이상 신호 없이 정상 운행 중입니다. 예방 정비 일정은 차고지·충전 탭의 자동 편성을 따릅니다.`,
    evidence: [
      `고장 예측 ${activeFault ? 1 : 0}건`,
      `작업지시 ${snap.workOrders.length}건 (발행 ${issuedWo})`,
      `돌발정보 진행 ${snap.incidents.filter((i) => i.status !== '완료').length}건`,
    ],
  })

  if (snap.weather.condition !== '맑음') {
    paras.push({
      icon: snap.weather.condition === '폭우' ? '🌧️' : '🥵',
      title: '기상 대응',
      text:
        snap.weather.condition === '폭우'
          ? `호우로 전 노선 평균 ${snap.weather.delayForecastMin}분 지연이 예상됩니다. 감속 계열 이벤트는 정당 판정으로 감점에서 제외 중이며, 예비차 선배정을 권고합니다.`
          : `폭염으로 냉방 부하가 증가해 연료 소모가 평시 대비 상승 중입니다. 공회전 최소화 안내를 권장합니다.`,
      evidence: [`기상: ${snap.weather.condition} ${snap.weather.tempC}°C`, `지연 예측 +${snap.weather.delayForecastMin}분`],
    })
  }

  return { paras, asOf: simClock(snap.simTime) }
}

/** 운전원별 리포트 — 광주 '운전원별 운전습관 리포트' 벤치마킹 */
function buildDriverReport(snap: SimSnapshot, v: VehicleState, period: Period): { paras: Para[]; asOf: string } {
  const k = period.k
  const dayLabel = k === 1 ? '금일' : `${period.label}(확장)`
  const sorted = [...snap.vehicles].sort((a, b) => b.score - a.score)
  const rank = sorted.findIndex((x) => x.id === v.id) + 1
  const grade = v.score >= 90 ? '양호' : v.score >= 75 ? '주의' : '위험'

  const eff = v.fuelM3 > 0 ? v.distanceKm / v.fuelM3 : 0
  const fleetEff = snap.kpi.totalFuelM3 > 0 ? snap.kpi.totalDistanceKm / snap.kpi.totalFuelM3 : 0
  const effDelta = fleetEff > 0 ? ((eff - fleetEff) / fleetEff) * 100 : 0
  const ecoRank = [...snap.vehicles]
    .map((x) => (x.fuelM3 > 0 ? x.distanceKm / x.fuelM3 : 0))
    .sort((a, b) => b - a)
    .findIndex((e) => e <= eff) + 1

  const myEvents = snap.events.filter((e) => e.vehicleId === v.id)
  const justified = myEvents.filter((e) => e.justified).length
  const effective = RISK_EVENT_TYPES.reduce((s, t) => s + v.eventCounts[t], 0)
  const topType = RISK_EVENT_TYPES.map((t) => ({ t, c: v.eventCounts[t] })).sort((a, b) => b.c - a.c)[0]
  const density = v.distanceKm > 0.5 ? effective / (v.distanceKm / 10) : 0
  const fleetDensity =
    snap.kpi.totalDistanceKm > 0.5
      ? snap.vehicles.reduce((s, x) => s + RISK_EVENT_TYPES.reduce((a, t) => a + x.eventCounts[t], 0), 0) /
        (snap.kpi.totalDistanceKm / 10)
      : 0
  const myPleas = snap.pleas.filter((p) => p.vehicleId === v.id)
  const personalSave = v.baselineFuelM3 > 0 ? ((v.baselineFuelM3 - v.fuelM3) / v.baselineFuelM3) * 100 : 0
  const myTrips = snap.trips.filter((t) => t.vehicleId === v.id).length
  const route = ROUTES.find((r) => r.id === v.routeId)!

  const COACH_TIP: Record<string, string> = {
    급감속: '차간거리를 여유 있게 확보하고 정류장·교차로 접근 시 조기 감속하는 습관이 효과적입니다',
    급정지: '전방 신호·정류장 예측을 앞당겨 제동 시점을 분산하는 것이 효과적입니다',
    급가속: '출발 시 3초간 완만한 가속을 유지하면 연비와 점수가 함께 개선됩니다',
    급출발: '출발 시 3초간 완만한 가속을 유지하면 연비와 점수가 함께 개선됩니다',
    급진로변경: '차로 변경 전 방향지시등 3초 규칙과 사이드 확인 여유를 권장합니다',
    급앞지르기: '앞지르기 전 충분한 가시거리 확보를 권장합니다',
    급좌우회전: '곡선·회전 구간 진입 전 감속을 권장합니다',
    급유턴: '유턴 시 대기 후 완만한 조향을 권장합니다',
  }

  const paras: Para[] = []

  paras.push({
    icon: '📊',
    title: 'AI 종합 진단',
    text:
      `${v.driverName} 기사(${v.id.slice(-4)}호 · ${route.name})는 ${dayLabel} ${fmtN(v.distanceKm * k)}km를 운행했으며(완료 회차 ${fmtN(myTrips * k)}회), ` +
      `안전점수 ${Math.round(v.score)}점으로 사내 ${rank}위/${snap.vehicles.length}명, ${grade} 등급입니다. ` +
      `경제운전은 연비 ${eff.toFixed(2)}km/m³(사내 ${ecoRank}위)로 사내 평균 대비 ${effDelta >= 0 ? '+' : ''}${effDelta.toFixed(1)}%이며, ` +
      `코칭 반영 기준 개인 연료 절감률은 ${personalSave.toFixed(1)}%입니다.`,
    evidence: [
      `안전점수 ${Math.round(v.score)}점 (${rank}/${snap.vehicles.length})`,
      `연비 ${eff.toFixed(2)} vs 사내 ${fleetEff.toFixed(2)}km/m³`,
      `개인 절감률 ${personalSave.toFixed(1)}% (기준선 대비)`,
    ],
  })

  paras.push({
    icon: '🛡️',
    title: '위험운행 행태',
    text:
      effective > 0
        ? `감점 대상 위험운전은 ${fmtN(effective * k)}건으로 10km당 ${density.toFixed(1)}건(사내 평균 ${fleetDensity.toFixed(1)}건)입니다. ` +
          `최다 유형은 ${topType.t}(${fmtN(topType.c * k)}건)이며, 별도로 ${fmtN(justified * k)}건은 맥락 판정(회피·정류장·기상)으로 감점에서 제외되었고 ` +
          `상황 설명 인정 ${fmtN(myPleas.filter((p) => p.status === '인정').length * k)}건을 포함해 방어운전 크레딧 ${fmtN(v.defenseCredits * k)}점을 보유합니다.`
        : `감점 대상 위험운전이 없습니다. 정당 판정 ${fmtN(justified * k)}건·방어운전 크레딧 ${fmtN(v.defenseCredits * k)}점으로 모범적인 방어 운행입니다.`,
    evidence: [
      `유형별: ${RISK_EVENT_TYPES.filter((t) => v.eventCounts[t] > 0)
        .map((t) => `${t} ${fmtN(v.eventCounts[t] * k)}`)
        .join(' · ') || '없음'}`,
      `밀도 ${density.toFixed(1)}건/10km (사내 ${fleetDensity.toFixed(1)})`,
      `정당 ${fmtN(justified * k)}건 · 상황 설명 ${fmtN(myPleas.length * k)}건 · 크레딧 ${fmtN(v.defenseCredits * k)}`,
    ],
  })

  paras.push({
    icon: '🎯',
    title: '맞춤 개선 제안',
    text:
      effective > 0 && topType.c > 0
        ? `${topType.t} 유형이 개선 우선순위입니다 — ${COACH_TIP[topType.t]}. ` +
          (density > fleetDensity
            ? `이벤트 밀도가 사내 평균을 상회하므로 4주 코칭 프로그램 대상 후보로 권장합니다.`
            : `밀도는 사내 평균 이하로, 해당 유형만 집중 관리하면 상위권 진입이 가능합니다.`)
        : `현재 운행 패턴 유지를 권장합니다. 동료 코칭의 모범 사례로 공유할 만한 수준입니다.`,
    evidence: [
      `우선 개선: ${effective > 0 ? `${topType.t} ${topType.c}건` : '해당 없음'}`,
      `사내 평균 대비 밀도 ${density > fleetDensity ? '상회' : '이하'}`,
    ],
  })

  return { paras, asOf: simClock(snap.simTime) }
}

export default function AiReport() {
  const snap = useSim()
  const [copied, setCopied] = useState<null | boolean>(null)
  const [target, setTarget] = useState('전체')
  const [periodId, setPeriodId] = useState<Period['id']>('today')
  const period = PERIODS.find((p) => p.id === periodId)!

  const targetVehicle = target === '전체' ? null : snap.vehicles.find((x) => x.id === target)
  const { paras, asOf } = targetVehicle ? buildDriverReport(snap, targetVehicle, period) : buildReport(snap, period)
  const reportTitle = targetVehicle
    ? `운전원 리포트 — ${targetVehicle.driverName} 기사 (${targetVehicle.id.slice(-4)}호)`
    : '금일 운영 리포트'

  const copyText = () => {
    const text =
      `[Qdrive AI ${reportTitle}] ${asOf} 기준 (자동 생성)\n\n` +
      paras.map((p) => `■ ${p.title}\n${p.text}\n근거: ${p.evidence.join(' / ')}`).join('\n\n')
    copyToClipboard(text).then((ok) => {
      setCopied(ok)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3 overflow-y-auto pr-1">
      {/* 리포트 헤더 */}
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gradient-to-r from-gray-900 to-gray-900/40 px-5 py-4">
        <div>
          <div className="text-[10px] font-semibold tracking-widest text-sky-400">AI OPERATIONS REPORT · AUTO-GENERATED</div>
          <h2 className="mt-0.5 text-lg font-bold text-gray-100">{reportTitle} — {asOf} 기준</h2>
          <div className="mt-0.5 text-[11px] text-gray-500">
            모든 문장은 실시간 집계 데이터에서 자동 생성되며 문단마다 근거 수치를 병기합니다 · 열람 시점 기준 자동 갱신
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value as Period['id'])}
            className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] font-semibold text-gray-200"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] font-semibold text-gray-200"
          >
            <option value="전체">전체 운영 리포트</option>
            {snap.vehicles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.driverName} 기사 · {x.id.slice(-4)}호
              </option>
            ))}
          </select>
          <button
            onClick={copyText}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100"
          >
            {copied === true ? '✓ 복사됨' : copied === false ? '복사 실패 — 권한 확인' : '📋 복사'}
          </button>
        </div>
      </div>

      {/* 자동 생성 문단 */}
      {paras.map((p) => (
        <Panel key={p.title} title={`${p.icon} ${p.title}`}>
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

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-[10px] leading-relaxed text-gray-600">
        ⚠ 신뢰성 원칙: 본 리포트의 수치는 전부 DTG/CAN/APC 집계에서 산출되며, 문장 생성부는 데모에서는
        규칙 기반(결정적), 실증 단계에서는 LLM + 수치 검증 과정으로 교체됩니다. AI가 생성한
        제안은 참고용이며 인사·평가 등 불이익 결정에 단독 사용할 수 없습니다.
        {period.k > 1 && (
          <>
            <br />⚠ 기간 확장(×{period.k}일): 금일 실측 비율 기반 모의 추정 — 실증 축적 시 해당 기간
            실측 집계로 대체됩니다.
          </>
        )}
      </div>
    </div>
  )
}
