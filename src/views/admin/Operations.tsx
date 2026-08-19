import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { CONNECTORS, clock, fmt, shortId } from './catalog'
import { Dot, LogRow, Stat } from './ui'

/** 레코드당 평균 바이트 (원본/정제/피처) — 용량 환산 근사 */
const BYTES = { raw: 220, curated: 140, feature: 96 }

export default function Operations({ snap, total, failed }: { snap: SimSnapshot; total: number; failed: number }) {
  const t = snap.simTime
  const passed = total - failed
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

  const jobs = [
    { name: '실시간 수집', kind: '상시', last: clock(Math.max(0, t - 2)), next: '연속', done: total, state: '정상' as const,
      note: 'DTG·OBD·RTK·BIS 연결 → 수신 관문' },
    { name: '품질 검사', kind: '상시', last: clock(Math.max(0, t - 2)), next: '연속', done: total, state: '정상' as const,
      note: '6개 규칙 검사 → 통과분 정제 저장소 · 실패분 격리함' },
    { name: '온톨로지 적재', kind: '상시', last: clock(Math.max(0, t - 5)), next: '연속', done: passed, state: '정상' as const,
      note: '운행 단위에 귀속 · 인스턴스·관계 생성' },
    { name: '학습 항목 생성', kind: '회차/이벤트', last: snap.trips.length ? clock(snap.trips[0].endSimTime) : '—', next: '다음 회차 종료 시',
      done: snap.trips.length, state: snap.trips.length ? ('정상' as const) : ('대기' as const),
      note: '회차 종료 시 연비·탄소 학습 항목 생성 · 이벤트 발생 시 안전 항목 갱신' },
    { name: '일 마감 집계', kind: '일 1회', last: '전일 24:00', next: '금일 24:00', done: 0, state: '대기' as const,
      note: '정산 검증 대조셋 생성 · 탄소 실적 확정 · 보고서 에이전트 집계 기준' },
  ]

  const audit = [
    ...snap.recommendations
      .filter((r) => r.status !== '대기')
      .slice(0, 2)
      .map((r) => ({ at: clock(r.createdAt), level: '정보' as const, msg: `배차 권고 #${r.id} ${r.status} — 관제 담당자 · 대상 ${shortId(r.vehicleId)}` })),
    ...snap.workOrders
      .filter((w) => w.status === '발행됨')
      .slice(0, 2)
      .map((w) => ({ at: clock(w.createdAt), level: '정보' as const, msg: `작업지시 #${w.id} 발행 — 정비 담당자 · 대상 ${shortId(w.vehicleId)}` })),
    ...snap.pleas
      .filter((p) => p.status === '인정')
      .slice(0, 2)
      .map((p) => ({ at: clock(p.simTime), level: '정보' as const, msg: `상황 설명 인정 — ${p.driverName} 기사 · ${p.eventType} 감점 복원` })),
    { at: clock(Math.max(0, t - 180)), level: '정보' as const, msg: '정책 보고서 에이전트 — 주간 업무보고 초안 생성 (버스운영과)' },
    { at: clock(Math.max(0, t - 900)), level: '정보' as const, msg: '데이터 관리자 조회 — 원천 목록·품질 대시보드 (운영자)' },
  ]

  return (
    <div className="space-y-3">
      <Panel title="데이터 처리 작업" right={<span className="text-[11px] text-gray-500">상시 3 · 이벤트 1 · 일 1회 1</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">처리 작업</th>
                <th className="py-2 pr-3 font-semibold">주기</th>
                <th className="py-2 pr-3 font-semibold">마지막 실행</th>
                <th className="py-2 pr-3 font-semibold">다음 실행</th>
                <th className="py-2 pr-3 text-right font-semibold">처리 건수</th>
                <th className="py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.name} className="border-b border-gray-800/60">
                  <td className="py-2 pr-3">
                    <div className="font-bold text-gray-100">{j.name}</div>
                    <div className="break-keep text-[11px] text-gray-500">{j.note}</div>
                  </td>
                  <td className="py-2 pr-3 text-gray-400">{j.kind}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] tabular-nums text-gray-400">{j.last}</td>
                  <td className="py-2 pr-3 text-gray-400">{j.next}</td>
                  <td className="py-2 pr-3 text-right font-bold tabular-nums text-sky-300">{j.done > 0 ? fmt(j.done) : '—'}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Dot tone={j.state === '정상' ? 'ok' : 'off'} />
                      <span className={`text-[11px] font-bold ${j.state === '정상' ? 'text-emerald-400' : 'text-gray-500'}`}>{j.state}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="저장 현황" right={<span className="text-[11px] text-gray-500">오늘 누적 · 건수 기반 환산</span>}>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['원본 (raw)', mb(total * BYTES.raw), '변경 불가 · 5년 보존', 'text-gray-200'],
              ['정제 (curated)', mb(passed * BYTES.curated), '품질 통과분 · 3년 보존', 'text-sky-300'],
              ['학습 항목 (AI-Ready)', mb((snap.trips.length + snap.kpi.totalEvents) * BYTES.feature * 40), '학습셋 · 3년 보존', 'text-emerald-400'],
            ].map(([k, v, sub, tone]) => (
              <div key={k} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5">
                <div className="text-[10.5px] text-gray-500">{k}</div>
                <div className={`mt-0.5 text-lg font-extrabold tabular-nums ${tone}`}>
                  {v}
                  <span className="ml-1 text-[11px] font-semibold text-gray-500">MB</span>
                </div>
                <div className="mt-0.5 break-keep text-[10.5px] text-gray-500">{sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 space-y-1.5">
            {[
              ['원본 보존', '법정 운행기록 5년 — 감사·분쟁 시 원본 그대로 제출'],
              ['가명 처리', '기사 식별정보는 분석셋에서 분리 — 원본에만 존재'],
              ['격리 로그', '통과하지 못한 데이터도 1년 보관 — 단말 관리 근거'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2.5 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5">
                <span className="w-[62px] shrink-0 text-[11px] font-bold text-gray-300">{k}</span>
                <span className="break-keep text-[11px] leading-relaxed text-gray-500">{v}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="감사 로그" right={<span className="text-[11px] text-gray-500">조회·승인·발송 전량 기록</span>}>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1">
            {audit.map((a, i) => (
              <LogRow key={i} {...a} />
            ))}
          </div>
          <div className="mt-2 break-keep text-[11px] leading-relaxed text-gray-500">
            <b className="text-gray-300">누가 무엇을 했는지</b>가 남아야 AI가 만든 초안도 책임 소재가 분명해집니다. 승인·발송은 전부 사람 계정으로
            기록됩니다.
          </div>
        </Panel>
      </div>

      <Panel title="원천별 운영 지표" right={<span className="text-[11px] text-gray-500">1차 8종 · 응답 목표(SLA) 기준</span>}>
        <div className="grid grid-cols-4 gap-2 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1">
          {CONNECTORS.filter((c) => c.stage === '1차').map((c) => {
            const n = c.count(snap)
            const slaOk = c.latency[1] <= 5000
            return (
              <div key={c.code} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-bold text-gray-100">{c.code}</span>
                  <span className={`shrink-0 text-[10.5px] font-bold ${slaOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {slaOk ? '목표 충족' : '목표 주의'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-end gap-3">
                  <Stat label="수집" value={fmt(n)} tone="text-sky-300" />
                  <Stat label="지연 상위5%" value={`${c.latency[1]}ms`} />
                </div>
                <div className="mt-1 truncate text-[10.5px] text-gray-500">{c.schemaVer}</div>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
