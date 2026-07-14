import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { KpiCard, Panel, simClock } from '../../components/ui'
import { useSim } from '../../sim/store'

/**
 * 🚌 차량 관리 — 원본 탄소 플랫폼 「차량 관리(dash V)」 자산·대장 렌즈 이식.
 * 운영(ops) 렌즈와 분리: 여기선 자산 컬럼(유종·차령·누적주행·운수회사·최근정비일)만 다룬다.
 * 스케일 3단 분리 — 준공영제 참여 5개사(412) / 예시 대장(정적) / 실증 9대(라이브).
 *   주의: 412는 '시 전체'가 아니다. 대구 CNG 시내버스는 약 1,513대·26개사(PolicyReport DAEGU_CNG_FLEET),
 *   412는 준공영제 참여 5개사(CarbonAnalysis CO_RANKS 합계 98+86+84+76+68)의 부분집합.
 * 예지정비·진단·정비비 예측 등 살아있는 코어는 재현하지 않고 관제·진단으로 딥링크한다.
 */

/** 준공영제 5개사 — 회사명·규모는 CarbonAnalysis CO_RANKS 정본과 정합(합계 412대) */
const COMPANY_KPI = {
  registered: 412,
  newThisMonth: 6,
  inMaint: 12,
  releaseToday: 4,
  predictive: 5,
  avgAgeY: 5.8,
  replaceRec: 21,
} as const

/** 차량 상태 분포(회사 스케일 정적) — 운행 356 / 정비 12 / 대기 44 = 412 */
const STATUS_DONUT = [
  { name: '운행', v: 356, color: '#34d399' },
  { name: '정비', v: 12, color: '#fbbf24' },
  { name: '대기', v: 44, color: '#64748b' },
]

/** 자산 대장 예시(정적) — 5개사 표본. 검색만 실동작, snap 바인딩 없음.
 *  차량번호는 실증 9대(대구70자37xx대)와 겹치지 않는 표본 번호. */
type Reg = { no: string; co: string; fuel: '경유' | 'CNG' | '전기'; ageY: number; odo: number; lastFix: string; status: '운행중' | '정비중' | '교체 권장' }
const REGISTRY: Reg[] = [
  { no: '대구70자1204', co: '세운버스(주)', fuel: 'CNG', ageY: 3.2, odo: 214800, lastFix: '2026-06-28', status: '운행중' },
  { no: '대구70자2210', co: '세운버스(주)', fuel: '전기', ageY: 1.1, odo: 68200, lastFix: '2026-07-02', status: '운행중' },
  { no: '대구70자3388', co: '세진교통(주)', fuel: '경유', ageY: 9.4, odo: 612400, lastFix: '2026-05-19', status: '교체 권장' },
  { no: '대구70자4519', co: '경북교통(주)', fuel: 'CNG', ageY: 5.8, odo: 398600, lastFix: '2026-06-11', status: '운행중' },
  { no: '대구70자5563', co: '세진교통(주)', fuel: '경유', ageY: 8.1, odo: 501200, lastFix: '2026-06-30', status: '정비중' },
  { no: '대구70자6702', co: '신흥버스(주)', fuel: 'CNG', ageY: 4.5, odo: 331900, lastFix: '2026-07-05', status: '운행중' },
  { no: '대구70자7815', co: '동명교통(주)', fuel: '전기', ageY: 2.3, odo: 142700, lastFix: '2026-06-22', status: '운행중' },
]

/** 완료된 정비 실적(정적) — ID는 관제현황 '정비비 예측'(3742·5563·0917)과 동일해 '예측→완료' 서사 정합 */
const FIX_LOGS = [
  { no: '대구70자3742', date: '2026-06-30', work: '브레이크 패드 교체 · 디스크 연마', cost: '182,000원' },
  { no: '대구70자5563', date: '2026-06-24', work: '냉각수 라인 누설 보수 · 서모스탯 교체', cost: '256,000원' },
  { no: '대구70자0917', date: '2026-06-18', work: '전·후륜 타이어 4본 교체', cost: '640,000원' },
]

const FUEL_CLS: Record<Reg['fuel'], string> = {
  경유: 'bg-gray-700/50 text-gray-300',
  CNG: 'bg-sky-500/15 text-sky-300',
  전기: 'bg-emerald-500/15 text-emerald-300',
}
const STATUS_CLS: Record<Reg['status'], string> = {
  운행중: 'bg-emerald-500/15 text-emerald-400',
  정비중: 'bg-amber-500/20 text-amber-400',
  '교체 권장': 'bg-red-500/15 text-red-400',
}

/** 정적/라이브 시각 구분 칩 */
function StaticChip() {
  return <span className="rounded bg-gray-700/60 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">준공영제 5개사 · 예시 대장</span>
}
function LiveChip() {
  return (
    <span className="flex items-center gap-1 rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      실증 9대 · 실시간
    </span>
  )
}

export default function VehicleRegistry({ onSub }: { onSub?: (t: 'scanner') => void }) {
  const snap = useSim()
  const [q, setQ] = useState('')
  const [registered, setRegistered] = useState(false)

  // 라이브 카운트 — 기존 필드에서 파생(엔진/타입 확장 없음)
  const liveCount = snap.vehicles.length
  const issuedWO = snap.workOrders.filter((w) => w.status === '발행됨').length
  const draftWO = snap.workOrders.filter((w) => w.status === '초안').length
  const predicted = snap.fault?.predicted ?? false

  // 자산 대장 검색(정적 데이터의 클라이언트 필터 — 실동작). 대소문자 무시(유종 'CNG' 소문자 검색 대응)
  const kw = q.trim()
  const kwl = kw.toLowerCase()
  const rows = kw
    ? REGISTRY.filter((r) => r.no.toLowerCase().includes(kwl) || r.co.toLowerCase().includes(kwl) || r.fuel.toLowerCase().includes(kwl))
    : REGISTRY

  // 최근 정비 이력 — 3742 발행 작업지시가 있으면 라이브 승격 1건 prepend(비용은 예상치로 구분)
  const liveFix = snap.workOrders
    .filter((w) => w.status === '발행됨')
    .slice(0, 1)
    .map((w) => ({
      no: w.vehicleId,
      date: `${simClock(w.createdAt)} (금일)`,
      work: `${w.kind} · ${w.items.slice(0, 2).join(' · ')}`,
      cost: `약 ${(Math.round(w.estHours * 80000 + 280000)).toLocaleString()}원 (예상)`,
      live: true as const,
    }))
  const fixLogs = [...liveFix, ...FIX_LOGS.map((f) => ({ ...f, live: false as const }))].slice(0, 3)

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 서브탭 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-gray-100">🚌 차량 관리</div>
          <div className="text-xs text-gray-500">차량 등록·조회와 정비 이력, AI 예지정비를 자산 대장 관점에서 관리해요</div>
        </div>
        <span className="text-[10px] text-gray-600">
          준공영제 참여 5개사 412대 (세운 98 포함) · <b className="text-emerald-400">실증 9대 라이브</b>
        </span>
      </div>

      {/* A. 플릿 요약 KPI 4카드 — 헤드라인 정적(회사) + sub 라이브 각주 */}
      <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        <KpiCard label="등록 차량" value={COMPANY_KPI.registered.toLocaleString()} unit="대" sub={`이번 달 신규 ${COMPANY_KPI.newThisMonth}대 · 실증 ${liveCount}대 라이브`} />
        <KpiCard label="정비 입고" value={String(COMPANY_KPI.inMaint)} unit="대" sub={`금일 출고 예정 ${COMPANY_KPI.releaseToday}대 · 실증 발행 ${issuedWO}건`} accent="text-amber-400" />
        <KpiCard label="예지정비 알림" value={String(COMPANY_KPI.predictive)} unit="건" sub={`고장 예측 30일 이내 · 실증 초안 ${draftWO}건`} accent="text-red-400" />
        <KpiCard label="평균 차령" value={COMPANY_KPI.avgAgeY.toFixed(1)} unit="년" sub={`교체 권장 ${COMPANY_KPI.replaceRec}대 (노후 경유)`} />
      </div>

      {/* C. 라이브 9대 브리지 — 실증 차량 실시간 자산·상태 */}
      <Panel
        title="실증 차량 9대 · 자산 현황"
        right={<LiveChip />}
      >
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-[11px] text-gray-500">
              <th className="pb-2 pr-3 font-medium">차량번호</th>
              <th className="pb-2 pr-3 font-medium">운수회사</th>
              <th className="pb-2 pr-3 font-medium">유종</th>
              <th className="pb-2 pr-3 font-medium">누적주행</th>
              <th className="pb-2 pr-3 font-medium">최근 정비</th>
              <th className="pb-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {snap.vehicles.map((v) => {
              const odoBase = 150000 + (Number(v.id.slice(-4)) % 400) * 1000
              const isFault = predicted && snap.fault?.vehicleId === v.id
              // 발행된 작업지시의 createdAt을 시간 소스로 사용 — 하단 '최근 정비 이력' 라이브 카드와 완전 일치
              const demoWO = snap.workOrders.find((w) => w.status === '발행됨' && w.vehicleId === v.id)
              return (
                <tr key={v.id} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2 pr-3 font-mono font-semibold text-gray-200">{v.id}</td>
                  <td className="py-2 pr-3 text-gray-400">세운버스(주)</td>
                  <td className="py-2 pr-3">
                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">CNG</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-gray-400">{(odoBase + v.distanceKm).toLocaleString(undefined, { maximumFractionDigits: 0 })} km</td>
                  <td className="py-2 pr-3 tabular-nums text-gray-500">{demoWO ? `${simClock(demoWO.createdAt)} 발행` : '—'}</td>
                  <td className="py-2">
                    {isFault ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">점검필요</span>
                    ) : v.dwellRemaining > 0 ? (
                      <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">정차</span>
                    ) : (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">운행중</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-1.5 text-[10px] text-gray-600">누적주행 = 차량별 기준 주행거리 + 이번 세션 실주행(라이브) · 유종은 엔진 단일 CNG 모델 · 최근 정비는 예지정비 발행 시 실시간 표시(그 외 '—')</div>
      </Panel>

      {/* B. 자산 대장 조회(정적 5개사 예시) + 검색 */}
      <Panel
        title="차량 자산 대장 · 조회"
        right={
          <div className="flex items-center gap-2">
            <StaticChip />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="차량번호·회사·유종 검색"
              className="w-40 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
            />
            <button
              onClick={() => setRegistered(true)}
              disabled={registered}
              className="whitespace-nowrap rounded-md border border-gray-700 px-2.5 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200 disabled:opacity-50"
            >
              {registered ? '정식 버전 제공' : '+ 차량 등록'}
            </button>
          </div>
        }
      >
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-[11px] text-gray-500">
              <th className="pb-2 pr-3 font-medium">차량번호</th>
              <th className="pb-2 pr-3 font-medium">운수회사</th>
              <th className="pb-2 pr-3 font-medium">유종</th>
              <th className="pb-2 pr-3 font-medium">차령</th>
              <th className="pb-2 pr-3 font-medium">누적주행</th>
              <th className="pb-2 pr-3 font-medium">최근 정비일</th>
              <th className="pb-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.no} className="border-b border-gray-800/50 last:border-0">
                <td className="py-2 pr-3 font-mono font-semibold text-gray-200">{r.no}</td>
                <td className="py-2 pr-3 text-gray-400">{r.co}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${FUEL_CLS[r.fuel]}`}>{r.fuel}</span>
                </td>
                <td className="py-2 pr-3 tabular-nums text-gray-400">{r.ageY.toFixed(1)}년</td>
                <td className="py-2 pr-3 tabular-nums text-gray-400">{r.odo.toLocaleString()} km</td>
                <td className="py-2 pr-3 tabular-nums text-gray-500">{r.lastFix}</td>
                <td className="py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLS[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[11px] text-gray-600">
                  '{kw}' 검색 결과가 없어요 — 차량번호·회사명·유종으로 검색해 보세요
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-1.5 text-[10px] text-gray-600">* 준공영제 5개사 대장 예시(정적) · 검색은 실동작 · 실증 9대 실시간은 위 표에서</div>
      </Panel>

      {/* D·E. 상태 도넛 + 예지정비 딥링크 */}
      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="차량 상태 분포" right={<StaticChip />}>
          <div className="flex items-center gap-3">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={STATUS_DONUT} dataKey="v" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
                    {STATUS_DONUT.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#191f28', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#cbd5e1' }}
                    formatter={(v, n) => [`${v}대`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {STATUS_DONUT.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-gray-300">
                    <span className="h-2 w-2 rounded-sm" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="tabular-nums font-semibold text-gray-200">{d.v}대</span>
                </div>
              ))}
              <div className="mt-1 border-t border-gray-800 pt-1.5 text-[10px] text-gray-600">합계 412대 (참여 5개사)</div>
            </div>
          </div>
        </Panel>

        <Panel title="AI 예지정비" right={<span className="text-[10px] text-gray-500">살아있는 코어 · 딥링크</span>}>
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-gray-300">현재 예측 상태</span>
                {predicted ? (
                  <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">● 발화 중</span>
                ) : (
                  <span className="rounded bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold text-emerald-400">이상 없음</span>
                )}
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
                {predicted
                  ? `${snap.fault?.vehicleId.slice(-4)}호 ${snap.fault?.kind} 예측 — OBD 센서 이상 감지. 진단 스캐너에서 실시간 센서값을 확인하세요.`
                  : '실증 9대 OBD·DTG 실시간 감시 중 — 냉각수온·레일압력 이상 예측 시 작업지시 초안이 자동 생성돼요.'}
              </div>
            </div>
            <button
              onClick={() => onSub?.('scanner')}
              className="w-full rounded-lg border border-sky-600/40 bg-sky-500/10 px-3 py-2 text-[12px] font-bold text-sky-300 transition-colors hover:bg-sky-500/20"
            >
              🔧 진단 스캐너에서 실시간 센서 확인 →
            </button>
          </div>
        </Panel>
      </div>

      {/* F. 최근 정비 이력(완료 실적) */}
      <Panel title="🔧 최근 정비 이력" right={<span className="text-[10px] text-gray-500">완료 실적 · 예측(관제)의 짝</span>}>
        <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
          {fixLogs.map((f, i) => (
            <div key={`${f.no}-${i}`} className="rounded-xl border border-gray-800 bg-gray-900/60 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-bold text-gray-200">{f.no.slice(-4)}호</span>
                {f.live ? (
                  <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">라이브</span>
                ) : (
                  <span className="text-[10px] text-gray-600">{f.date}</span>
                )}
              </div>
              <div className="mt-2 text-[11.5px] leading-relaxed text-gray-400">{f.work}</div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-800 pt-2 text-[11px]">
                <span className="text-gray-600">{f.live ? f.date : '실집행 비용'}</span>
                <span className="font-bold tabular-nums text-gray-200">{f.cost}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-gray-600">
          완료 정비 실적(정적) · 차량번호는 관제 '정비비 예측'과 동일해 예측→완료 실적이 이어져요. 라이브 승격분은 예상 비용으로 표시.
        </div>
      </Panel>
    </div>
  )
}
