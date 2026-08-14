import { useMemo, useState } from 'react'
import { Panel } from '../../components/ui'
import type { SimSnapshot } from '../../sim/types'
import { CONNECTORS, fmt, stageTone, type Conn } from './catalog'
import { INTEGRATION, PENDING_PREP, connLogs, hourly } from './integration'
import { Chips, Def, Dot, Drawer, LogRow, RecordTable, Search, Sec, Spark, Stat } from './ui'

const FILTERS = ['전체', '1차', '2차', '3차', '수집 중', '연결 대기'] as const
type Filter = (typeof FILTERS)[number]
type DetailTab = '개요' | '스키마·매핑' | '최근 데이터' | '수집 로그'
const DETAIL_TABS: DetailTab[] = ['개요', '스키마·매핑', '최근 데이터', '수집 로그']

const isLive = (c: Conn) => c.stage === '1차'

export default function Ingest({ snap, total }: { snap: SimSnapshot; total: number }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('전체')
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('개요')

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return CONNECTORS.filter((c) => {
      if (filter === '1차' || filter === '2차' || filter === '3차') return c.stage === filter
      if (filter === '수집 중') return isLive(c)
      if (filter === '연결 대기') return !isLive(c)
      return true
    }).filter((c) => !kw || [c.code, c.name, c.owner, c.note].some((t) => t.toLowerCase().includes(kw)))
  }, [q, filter])

  const open = CONNECTORS.find((c) => c.code === openCode) ?? null
  const liveCount = CONNECTORS.filter(isLive).length

  return (
    <div className="space-y-3">
      <Panel
        title="원천 통합 관리"
        right={
          <span className="text-[11px] font-semibold text-gray-500">
            {liveCount}종 수집 중 · 오늘 {fmt(total)}건 · 행을 클릭하면 연동 상세
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="w-56 max-[520px]:w-full">
            <Search value={q} onChange={setQ} placeholder="원천·보유주체·설명 검색" />
          </div>
          <Chips value={filter} options={FILTERS} onChange={setFilter} />
          <span className="ml-auto text-[11px] text-gray-500">{rows.length}종 표시</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">원천</th>
                <th className="py-2 pr-3 font-semibold">보유 주체</th>
                <th className="py-2 pr-3 font-semibold">주기</th>
                <th className="py-2 pr-3 text-right font-semibold">오늘 수집</th>
                <th className="py-2 pr-3 text-right font-semibold">지연 p50/p95</th>
                <th className="py-2 pr-3 font-semibold">24h 추이</th>
                <th className="py-2 pr-3 font-semibold">스키마</th>
                <th className="py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const live = isLive(c)
                const n = c.count(snap)
                return (
                  <tr
                    key={c.code}
                    onClick={() => {
                      setOpenCode(c.code)
                      setTab('개요')
                    }}
                    className="cursor-pointer border-b border-gray-800/60 transition-colors hover:bg-gray-800/40"
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${stageTone[c.stage]}`}>{c.stage}</span>
                        <span className="font-bold text-gray-100">{c.code}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-gray-500">{c.name}</div>
                    </td>
                    <td className="py-2 pr-3 text-gray-400">{c.owner}</td>
                    <td className="py-2 pr-3 text-gray-400">{c.hz}</td>
                    <td className={`py-2 pr-3 text-right font-bold tabular-nums ${live ? 'text-sky-300' : 'text-gray-600'}`}>
                      {live ? fmt(n) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-400">
                      {live ? `${c.latency[0]} / ${c.latency[1]}ms` : '—'}
                    </td>
                    <td className="w-[110px] py-2 pr-3">
                      {live ? <Spark data={hourly(c.code, n)} /> : <div className="h-[30px]" />}
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{c.schemaVer}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Dot tone={live ? 'ok' : 'off'} />
                        <span className={`text-[11px] font-bold ${live ? 'text-emerald-400' : 'text-gray-500'}`}>
                          {live ? '수집 중' : '연결 대기'}
                        </span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-8 text-center text-[12px] text-gray-500">조건에 맞는 원천이 없습니다</div>}
      </Panel>

      <div className="grid grid-cols-[1.35fr_1fr] gap-3 max-[1000px]:grid-cols-1">
        <Panel title="통합의 실체 — 서로 다른 원천을 무엇으로 붙이나">
          <div className="space-y-2">
            {[
              ['차량번호', 'vehicleId', 'DTG 409 · DTG 521 · OBD/CAN · RTK · BIS · 정비이력 · 단말 상태', '표기가 제각각이라 정규화 후 결합 — 통합의 1차 키'],
              ['운행 단위', 'Trip (start~end)', 'DTG 521이 정의 · 나머지 원천이 시각으로 귀속', '"언제의 데이터인가"를 운행 단위로 묶는 축'],
              ['시각', 'simTime (1초)', 'DTG · OBD · RTK 3소스 교차 · BIS 3초', '단말 시계 오차를 3소스로 보정 (품질 룰 Q4)'],
              ['정류장', 'stopName', 'BIS 정류소명 ↔ 노선 정류장 사전', '미매칭은 보류 큐 — 임의 매칭 금지'],
            ].map(([k, key, srcs, why]) => (
              <div key={k} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[12.5px] font-bold text-gray-100">{k}</span>
                  <code className="rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] text-sky-300">{key}</code>
                </div>
                <div className="mt-1 break-keep text-[11px] text-gray-500">{srcs}</div>
                <div className="mt-0.5 break-keep text-[11px] text-gray-400">{why}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="수집 파이프라인 — 단말에서 저장소까지">
          <div className="space-y-1.5">
            {[
              ['차내 단말', 'DTG·OBD·RTK 통합 수집', `${snap.vehicles.length}대 연결`],
              ['전송', 'LTE 스트림 · 유실 시 재전송', '지연 중앙값 0.8초'],
              ['수신 게이트', '스키마 검증 · 중복 제거 · 표기 정규화', `${fmt(total)}건 수신`],
              ['원본 보관', '변경 불가 원본(raw) 보존', '감사·분쟁 대응 근거'],
              ['정제 적재', '품질 통과분만 분석 저장소로', '다음 단계 ②'],
            ].map(([t, d, m], i) => (
              <div key={t} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-black text-gray-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-gray-100">{t}</div>
                  <div className="truncate text-[11px] text-gray-500">{d}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] font-bold text-sky-300">{m}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── 원천 상세 드로어 ── */}
      <Drawer
        open={!!open}
        onClose={() => setOpenCode(null)}
        title={open ? `${open.code} — ${open.name}` : ''}
        sub={open ? `${open.owner} · ${open.hz} 주기 · ${open.schemaVer}` : ''}
      >
        {open && <ConnDetail conn={open} snap={snap} tab={tab} setTab={setTab} />}
      </Drawer>
    </div>
  )
}

function ConnDetail({
  conn,
  snap,
  tab,
  setTab,
}: {
  conn: Conn
  snap: SimSnapshot
  tab: DetailTab
  setTab: (t: DetailTab) => void
}) {
  const live = isLive(conn)
  const n = conn.count(snap)
  const integ = INTEGRATION[conn.code]
  const prep = PENDING_PREP[conn.code]

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {DETAIL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
              tab === t ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40' : 'bg-gray-800/60 text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === '개요' && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
              <Stat label="오늘 수집" value={live ? `${fmt(n)}건` : '—'} tone={live ? 'text-sky-300' : 'text-gray-600'} />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
              <Stat label="지연 p50 / p95" value={live ? `${conn.latency[0]} / ${conn.latency[1]}ms` : '—'} />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
              <Stat label="필드 수" value={`${conn.fields.length}개 정의`} />
            </div>
          </div>

          {live && (
            <Sec t="24시간 수신량">
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                <Spark data={hourly(conn.code, n)} h={44} />
                <div className="mt-1 flex justify-between text-[10.5px] text-gray-600">
                  <span>00시</span>
                  <span>첨두 07·18시</span>
                  <span>23시</span>
                </div>
              </div>
            </Sec>
          )}

          {integ ? (
            <>
              <Sec t="연동 설정">
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1">
                  <Def k="엔드포인트" v={<code className="break-all text-[11px] text-sky-300">{integ.endpoint}</code>} />
                  <Def k="인증" v={integ.auth} />
                  <Def k="재시도" v={integ.retry} />
                  <Def k="중복 제거 키" v={<code className="text-[11px] text-gray-300">{integ.dedupKey}</code>} />
                </div>
              </Sec>

              <Sec t="다른 원천과 붙는 키">
                <div className="flex flex-wrap gap-1.5">
                  {integ.joinKeys.map((k) => (
                    <span key={k} className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
                      {k}
                    </span>
                  ))}
                </div>
              </Sec>

              <Sec t="적재 전 정규화 규칙">
                <ol className="space-y-1.5">
                  {integ.transforms.map((t, i) => (
                    <li key={t} className="flex gap-2 break-keep text-[11.5px] leading-relaxed text-gray-300">
                      <span className="shrink-0 font-bold text-gray-600">{i + 1}.</span>
                      {t}
                    </li>
                  ))}
                </ol>
              </Sec>

              <Sec t="스키마 버전 이력">
                <div className="space-y-1.5">
                  {integ.history.map((h) => (
                    <div key={h.ver} className="flex gap-2.5 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5">
                      <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10.5px] font-bold text-gray-300">{h.ver}</span>
                      <div className="min-w-0">
                        <div className="text-[11px] text-gray-500">{h.when}</div>
                        <div className="break-keep text-[11.5px] text-gray-300">{h.what}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Sec>
            </>
          ) : prep ? (
            <Sec t="연동 준비 상태">
              <div className="space-y-2">
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-gray-500">필요한 것</div>
                  <div className="break-keep text-[12px] text-gray-200">{prep.need}</div>
                </div>
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-400">이미 준비된 것</div>
                  <div className="break-keep text-[12px] text-gray-200">{prep.ready}</div>
                </div>
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                  <div className="text-[11px] font-semibold text-amber-400">막혀 있는 것</div>
                  <div className="break-keep text-[12px] text-gray-200">{prep.blocked}</div>
                </div>
              </div>
              <div className="mt-2 break-keep text-[11.5px] leading-relaxed text-gray-500">
                스키마와 매핑은 이미 정의돼 있어, 협약·승인이 나면 <b className="text-gray-300">커넥터만 켜면 됩니다.</b> 구조 변경은 없습니다.
              </div>
            </Sec>
          ) : null}
        </>
      )}

      {tab === '스키마·매핑' && (
        <>
          <Sec t="스키마 필드" right={<span className="text-[11px] text-gray-500">{conn.fields.length}개</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-gray-800 text-[10.5px] text-gray-500">
                    <th className="py-1.5 pr-3 font-semibold">필드</th>
                    <th className="py-1.5 pr-3 font-semibold">타입</th>
                    <th className="py-1.5 font-semibold">설명</th>
                  </tr>
                </thead>
                <tbody>
                  {conn.fields.map((f) => (
                    <tr key={f.name} className="border-b border-gray-800/50 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-[11px] text-gray-200">{f.name}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{f.type}</td>
                      <td className="py-1.5 break-keep text-gray-400">{f.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sec>

          {integ && (
            <Sec t="필드 매핑 — 원천 → 표준 → 온톨로지">
              <div className="space-y-1.5">
                {integ.mapping.map((m) => (
                  <div key={m.src} className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <code className="rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-400">{m.src}</code>
                      <span className="text-gray-600">→</span>
                      <code className="rounded bg-sky-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">{m.std}</code>
                      <span className="text-gray-600">→</span>
                      <code className="rounded bg-violet-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-violet-300">{m.onto}</code>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 break-keep text-[11.5px] leading-relaxed text-gray-500">
                원천마다 다른 필드명을 <b className="text-sky-300">표준 필드</b>로 모으고, 다시 <b className="text-violet-300">온톨로지 속성</b>에 연결합니다.
                원천이 바뀌어도 표준 이후는 그대로라 서비스 화면은 영향받지 않습니다.
              </div>
            </Sec>
          )}
        </>
      )}

      {tab === '최근 데이터' && (
        <Sec t="최근 수신 레코드" right={<span className="text-[11px] text-gray-500">엔진 실데이터</span>}>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
            <RecordTable
              rows={conn.sample(snap)}
              empty={live ? '아직 수신된 레코드가 없습니다 — 이벤트 기반 원천입니다' : '연결 대기 중인 원천입니다'}
            />
          </div>
          <div className="mt-2 break-keep text-[11.5px] leading-relaxed text-gray-500">
            표시되는 값은 지금 돌아가는 엔진의 실제 레코드입니다. 실단말 전환 시 이 자리에 실차 패킷이 그대로 들어옵니다.
          </div>
        </Sec>
      )}

      {tab === '수집 로그' && (
        <Sec t="수집 로그" right={<span className="text-[11px] text-gray-500">최근순</span>}>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1">
            {connLogs(snap, conn.code).map((l, i) => (
              <LogRow key={i} {...l} />
            ))}
          </div>
        </Sec>
      )}
    </>
  )
}
