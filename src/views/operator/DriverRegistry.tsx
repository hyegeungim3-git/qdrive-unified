import { KpiCard, Panel } from '../../components/ui'
import { useSim } from '../../sim/store'

/**
 * 👥 기사 관리 — 원본 탄소 플랫폼 「운전자 관리(dash D)」 인사·성과 렌즈 이식.
 * 🚌 차량 관리(VehicleRegistry, 자산 렌즈)와 대칭. 스케일 3단 분리:
 * 준공영제 참여 5개사(기사 486·차량 412, 세운 98 포함) ⊃ 세운버스(주)(98대·115 기사) ⊃ 실증 9명(라이브).
 * 회사 규모 수치는 정적, 실증 9명 파생은 emerald 라이브 각주로만 표기(규모 오도 방지).
 * 코칭 대상 선별·통보문은 재구현하지 않고 관제 조치함으로 딥링크한다.
 */

/** 회사 스케일 정적 서사값(준공영제 5개사) */
const COMPANY = {
  registered: 486, // 등록 기사 (5개사, CitizenPublic:214와 동일 소스)
  eduTargets: 23, // 교육 대상 (5개사)
  topDrivers: 64, // 우수 기사 (5개사)
  incentive: '12,800,000', // 7월 인센티브 지급 (5개사)
  trainingRate: 91, // 교육 이수율(수료 기준) — 정적
} as const

function StaticChip({ label = '준공영제 5개사' }: { label?: string }) {
  return <span className="shrink-0 rounded bg-gray-700/60 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">{label}</span>
}
function LiveChip() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      실증 9명 · 실시간
    </span>
  )
}

export default function DriverRegistry({ onSub }: { onSub?: (t: 'ops') => void }) {
  const snap = useSim()
  const n = snap.vehicles.length

  // 라이브 파생 — 기존 필드만(엔진/타입 확장 0)
  const avgScore = snap.kpi.avgScore
  const liveEduTargets = snap.vehicles.filter((v) => v.score < 78).length
  const liveTopDrivers = snap.vehicles.filter((v) => v.score >= 90).length
  const liveNormal = n - liveEduTargets - liveTopDrivers
  const ecoAvg = Math.round(snap.vehicles.reduce((s, v) => s + v.ecoScore, 0) / (n || 1))

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {/* 헤더 + 3단 스케일 각주 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-gray-100">👥 기사 관리</div>
          <div className="text-xs text-gray-500">기사 등록·성과·교육을 인사 관점에서 관리해요 · 코칭 실행은 관제 업무함으로</div>
        </div>
        <span className="text-[10px] text-gray-600">
          준공영제 참여 5개사 486명 · 412대 (세운버스 98대 포함) · <b className="text-emerald-400">실증 {n}명 라이브</b>
        </span>
      </div>

      {/* 상단 KPI 4카드 — 회사 정적 헤드라인 + 실증 라이브 각주 */}
      <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        <KpiCard label="등록 기사" value={COMPANY.registered.toLocaleString()} unit="명" sub={`준공영제 5개사 · 실증 ${n}명 라이브`} />
        <KpiCard label="평균 운전점수 (실증 9명)" value={avgScore.toFixed(1)} unit="점" accent="text-sky-400" sub="실시간 집계 · 5개사 미집계" />
        <KpiCard label="코칭 대상" value={String(COMPANY.eduTargets)} unit="명" accent="text-amber-400" sub={`78점 미만 AI 선별 · 실증 ${liveEduTargets}명`} />
        <KpiCard label="우수 기사" value={String(COMPANY.topDrivers)} unit="명" accent="text-emerald-400" sub={`90점 이상 인센티브 · 실증 ${liveTopDrivers}명`} />
      </div>

      {/* 성과 관리 — 에코 달성률(라이브) + 인센티브(정적) + 교육 이수율(정적) */}
      <Panel title="성과 관리" right={<span className="text-[11px] text-gray-500">에코=실측 참여 / 이수=수료 기준</span>}>
        <div className="flex flex-col gap-3">
          {/* 에코 드라이빙 달성률 — 라이브 ecoScore 평균 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="font-semibold text-gray-300">에코 드라이빙 달성률</span>
              <span className="flex items-center gap-2">
                <LiveChip />
                <b className="tabular-nums text-emerald-400">{ecoAvg}%</b>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${ecoAvg}%` }} />
            </div>
          </div>

          {/* 인센티브 지급 (7월) — 정적 */}
          <div className="flex items-center justify-between border-t border-gray-800 pt-3 text-[13px]">
            <span className="font-semibold text-gray-300">인센티브 지급 (7월)</span>
            <span className="flex items-center gap-2">
              <StaticChip label="5개사 · 7월" />
              <b className="tabular-nums text-gray-200">{COMPANY.incentive}원</b>
            </span>
          </div>

          {/* 교육 이수율 — 정적(수료 기준) */}
          <div className="border-t border-gray-800 pt-3">
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="font-semibold text-gray-300">교육 이수율 (수료)</span>
              <span className="flex items-center gap-2">
                <StaticChip />
                <b className="tabular-nums text-sky-400">{COMPANY.trainingRate}%</b>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${COMPANY.trainingRate}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-2.5 text-[10px] leading-relaxed text-gray-600">
          ※ 교육 이수율(수료 완결도)은 에코 드라이빙 실천율(주행 중 참여 빈도)과 다른 지표예요. 에코 달성률은 실증 9명 ecoScore 실시간 평균.
        </div>
      </Panel>

      {/* 실증 9명 성과 분포 — 라이브 카운트(회사 도넛의 실증 스케일판) */}
      <Panel title="실증 기사 성과 분포" right={<LiveChip />}>
        <div className="grid grid-cols-3 gap-2.5 max-[900px]:grid-cols-1">
          {[
            { label: '우수', sub: '90점 이상', v: liveTopDrivers, cls: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
            { label: '일반', sub: '78~89점', v: liveNormal, cls: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/25' },
            { label: '코칭 대상', sub: '78점 미만', v: liveEduTargets, cls: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25', go: true },
          ].map((g) => {
            const active = !!g.go && g.v > 0
            return (
              <button
                key={g.label}
                onClick={() => active && onSub?.('ops')}
                disabled={!active}
                className={`rounded-xl border px-3 py-2.5 text-left ${g.bg} ${active ? 'transition-colors hover:brightness-110' : 'cursor-default'}`}
                title={active ? '관제 현황으로 이동' : undefined}
              >
                <div className={`text-2xl font-extrabold tabular-nums ${g.cls}`}>
                  {g.v}
                  <span className="ml-0.5 text-xs font-semibold text-gray-500">명</span>
                </div>
                <div className="mt-0.5 text-[12px] font-bold text-gray-300">{g.label}</div>
                <div className="text-[10px] text-gray-500">{g.sub}{active ? ' · 코칭 →' : ''}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-2 text-[10px] text-gray-600">실증 9명 실시간 · 회사 전체 분포(우수 64·코칭대상 23)는 상단 KPI · 코칭 대상 클릭 시 관제 현황으로</div>
      </Panel>
    </div>
  )
}
