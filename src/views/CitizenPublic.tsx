import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSim } from '../sim/store'

/**
 * 시민 탄소 공개 페이지 — 대통합 별도 진입점(#citizen).
 * 탄소 플랫폼 「시민 탄소 대시보드.dc.html」을 React로 이식.
 * 히어로 카운터는 엔진 kpi.totalCo2SavedKg 실집계에 연결해 목업→실동작 승격
 * (원본의 랜덤 증분 대신 시뮬레이션이 실제로 쌓는 값이 오른다).
 */

type Grade = 'A' | 'B' | 'C'
const GRADE_COLOR: Record<Grade, string> = { A: '#03b26c', B: '#3182f6', C: '#fe9800' }

const ROUTES: {
  name: string
  seg: string
  grade: Grade
  co2: string
  pax: string
  save: string
  desc: string
}[] = [
  { name: '급행1', seg: '동대구역 ↔ 서부정류장', grade: 'A', co2: '0.84kg', pax: '18,420명', save: '3.9 tCO₂',
    desc: '대구에서 가장 친환경적인 노선이에요. 기사님들의 예측 감속 실천율이 91%로 가장 높아요.' },
  { name: '간선 401', seg: '반월당 ↔ 칠곡경대병원', grade: 'A', co2: '0.92kg', pax: '14,260명', save: '3.2 tCO₂',
    desc: '전기버스 비중이 높아 배출이 적은 노선이에요. 조용하고 매연 없는 승차감을 느껴보세요.' },
  { name: '간선 649', seg: '성서공단 ↔ 대구역', grade: 'B', co2: '1.03kg', pax: '11,830명', save: '2.7 tCO₂',
    desc: '평균 수준의 효율을 내는 노선이에요. 공회전 줄이기 코칭으로 계속 좋아지고 있어요.' },
  { name: '순환 2-1', seg: '범어네거리 순환', grade: 'B', co2: '1.12kg', pax: '7,940명', save: '1.9 tCO₂',
    desc: '짧은 정류장 간격에도 부드러운 가감속으로 효율을 지키고 있는 노선이에요.' },
  { name: '지선 356', seg: '두류역 ↔ 시지지구', grade: 'C', co2: '1.28kg', pax: '5,210명', save: '1.6 tCO₂',
    desc: '언덕 구간이 많아 배출이 높은 편이에요. 전기버스 우선 투입 검토 대상이에요.' },
  { name: '급행5', seg: '대구공항 ↔ 계명대', grade: 'C', co2: '1.34kg', pax: '4,080명', save: '1.4 tCO₂',
    desc: '장거리 고속 구간 노선이에요. 정속 주행 코칭을 집중 적용하고 있어요.' },
]

const MONTHLY = [
  { m: '2월', t: 57.4 },
  { m: '3월', t: 61.1 },
  { m: '4월', t: 64.6 },
  { m: '5월', t: 67.5 },
  { m: '6월', t: 70.5 },
  { m: '7월', t: 72.6 },
]

const IMPACT = [
  { month: '5월', text: '간선 649 배차 12분 → 10분', desc: '출근 시간 혼잡 데이터가 증차 결정의 근거가 됐어요.' },
  { month: '6월', text: '반월당 급감속 구간 신호 개선 건의', desc: '6개월 주행 데이터를 근거로 교통 부서가 검토 중이에요.' },
  { month: '7월', text: '지선 356에 저상버스 2대 우선 배치', desc: '교통약자 승하차 데이터가 배치 순서를 바꿨어요.' },
]

/** 공유 성공·실패 피드백 토스트 (원본 _toast 이식) */
function toast(msg: string) {
  const t = document.createElement('div')
  t.textContent = msg
  t.style.cssText =
    "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:rgba(25,31,40,0.92);color:#fff;font:700 13px/1.4 'Paperlogy',sans-serif;padding:11px 18px;border-radius:9999px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:9999;opacity:0;transition:opacity .25s;white-space:nowrap;"
  document.body.appendChild(t)
  requestAnimationFrame(() => {
    t.style.opacity = '1'
  })
  setTimeout(() => {
    t.style.opacity = '0'
    setTimeout(() => t.remove(), 300)
  }, 2200)
}

const chartTheme = {
  grid: '#94a3b8',
  tick: { fill: '#94a3b8', fontSize: 11, fontWeight: 600 },
  tooltip: {
    contentStyle: {
      background: '#191f28',
      border: '1px solid #374151',
      borderRadius: 8,
      fontSize: 12,
      color: '#fff',
    },
    labelStyle: { color: '#cbd5e1' },
  },
}

export default function CitizenPublic() {
  const snap = useSim()
  const [route, setRoute] = useState(0)
  const [calcKm, setCalcKm] = useState(12)

  // 히어로 — 아침 이전 누적(base) + 시뮬레이션이 지금 쌓는 실집계(engine)
  const heroKg = 2143 + Math.round(snap.kpi.totalCo2SavedKg)

  const sel = ROUTES[route]
  // 승용차 170g/km − 버스 1인당 24g/km = 146g/km 절감 × 연 240일
  const calcCo2 = Math.round(calcKm * 240 * 0.146)
  const calcPine = Math.round(calcCo2 / 6.6)

  async function onShare() {
    const text =
      '🌱 나는 버스로 1년에 CO₂ ' +
      calcCo2.toLocaleString() +
      'kg을 아껴요 — 소나무 ' +
      calcPine.toLocaleString() +
      '그루만큼! 당신은 얼마나 아낄 수 있을까요?'
    const url = location.origin + location.pathname + '#citizen'
    try {
      if (navigator.share) {
        await navigator.share({ title: '대구 시내버스 탄소 리포트', text, url })
        return
      }
      await navigator.clipboard.writeText(text + ' ' + url)
      toast('공유 문구가 복사됐어요 — 어디든 붙여넣어 보세요')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return // 사용자가 공유 취소
      // 클립보드 API가 막힌 브라우저용 레거시 폴백
      try {
        const ta = document.createElement('textarea')
        ta.value = text + ' ' + url
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        if (ok) {
          toast('공유 문구가 복사됐어요 — 어디든 붙여넣어 보세요')
          return
        }
      } catch {
        // 폴백도 실패 시 아래 안내
      }
      toast('복사에 실패했어요 — 브라우저 권한을 확인해 주세요')
    }
  }

  return (
    <div className="h-svh overflow-y-auto">
      {/* ============ HERO ============ */}
      <div
        className="px-6 pb-[88px] pt-11 text-white"
        style={{ background: 'linear-gradient(160deg,#0b2b18 0%,#0e4a26 55%,#0a5c2e 100%)' }}
      >
        <div className="mx-auto max-w-[1040px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white/15">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#7ee2a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6" />
                </svg>
              </div>
              <span className="text-[15px] font-bold tracking-tight">대구광역시 × Qdrive</span>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-xs font-bold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7ee2a8]" />
              운행 데이터 기준 실시간 반영
            </span>
          </div>

          <div className="mt-[52px] text-center">
            <div className="text-base font-bold text-[#a7d9bd]">오늘, 대구 준공영제 참여 버스 412대가 아낀 탄소</div>
            <div className="mt-2.5 text-[clamp(54px,10vw,76px)] font-bold leading-[1.1] tracking-[-3px] tabular-nums">
              {heroKg.toLocaleString()}
              <span className="ml-1.5 text-[30px] font-bold tracking-[-0.5px] text-[#a7d9bd]">kg CO₂</span>
            </div>
            <div className="mt-2.5 inline-flex items-center gap-2 text-[12.5px] font-bold text-[#7ee2a8]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7ee2a8]" />
              운행 중인 버스가 지금도 쌓는 중
            </div>
            <div className="mt-3 text-[15px] font-semibold leading-relaxed text-[#cfe9db]">
              기사님들의 안전운전이 연료 784L를 아꼈어요.
              <br />
              과속·급가속이 줄면, 도시의 공기가 달라져요.
            </div>
          </div>

          <div className="mx-auto mt-11 grid max-w-[760px] grid-cols-3 gap-3 max-[560px]:grid-cols-1">
            {[
              ['72.6t', '이번 달 CO₂ 감축'],
              ['393.7t', '올해 누적 감축'],
              ['59,600그루', '소나무 연간 흡수량 환산'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-[14px] bg-white/10 p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-bold tabular-nums">{v}</div>
                <div className="mt-1 text-xs font-semibold text-[#a7d9bd]">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ BODY ============ */}
      <div className="mx-auto -mt-12 max-w-[1040px] px-6 pb-10">
        {/* 월별 추이 + 함께한 사람들 */}
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3.5 max-[760px]:grid-cols-1">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 shadow-lg">
            <div className="text-[17px] font-bold text-gray-100">매달 조금씩, 꾸준히 줄고 있어요</div>
            <div className="mt-1 text-[13px] font-semibold text-gray-500">월별 CO₂ 감축량 (도입 전 대비 실측)</div>
            <div className="mt-4 h-60">
              <ResponsiveContainer>
                <BarChart data={MONTHLY} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} strokeOpacity={0.25} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="m" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}t`} />
                  <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'rgba(3,178,108,0.08)' }} formatter={(v) => [`${v}t`, 'CO₂ 감축']} />
                  <Bar dataKey="t" fill="#03b26c" radius={[9, 9, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex flex-col gap-3.5 rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 shadow-lg">
            <div className="text-[17px] font-bold text-gray-100">함께 만든 사람들</div>
            <div className="flex flex-1 flex-col justify-center gap-3">
              {[
                ['참여 버스', '412대', 'text-gray-100'],
                ['안전운전 기사님', '486명', 'text-gray-100'],
                ['친환경 버스 (전기·CNG)', '140대', 'text-emerald-400'],
                ['에코 드라이빙 실천율 (5개사 평균)', '78%', 'text-sky-400'],
              ].map(([k, v, cls]) => (
                <div key={k} className="flex items-baseline justify-between">
                  <span className="text-[13.5px] font-semibold text-gray-400">{k}</span>
                  <span className={`text-xl font-bold tabular-nums ${cls}`}>{v}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-gray-800/60 px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-gray-500">
              버스는 승용차보다 1인당 CO₂ 배출이 약 1/7이에요. 버스를 타는 것만으로도 감축에 동참하는 거예요.
            </div>
          </div>
        </div>

        {/* 내 노선 조회 */}
        <div className="mt-3.5 rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[17px] font-bold text-gray-100">내가 타는 버스는 얼마나 친환경일까요?</div>
            <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-bold text-emerald-400">노선별 효율 등급</span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {ROUTES.map((r, i) => {
              const active = i === route
              return (
                <button
                  key={r.name}
                  onClick={() => setRoute(i)}
                  className={`min-h-11 rounded-full border px-4 py-3 text-[13px] font-bold transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >
                  {r.name}
                </button>
              )
            })}
          </div>
          <div className="mt-3.5 grid grid-cols-[auto_1fr] items-center gap-5 rounded-2xl bg-gray-800/50 px-6 py-5">
            <div
              className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-[20px] text-[34px] font-bold text-white"
              style={{ background: GRADE_COLOR[sel.grade], boxShadow: `0 6px 18px ${GRADE_COLOR[sel.grade]}55` }}
            >
              {sel.grade}
            </div>
            <div>
              <div className="text-base font-bold text-gray-100">
                {sel.name}
                <span className="ml-1 text-[13px] font-semibold text-gray-500">{sel.seg}</span>
              </div>
              <div className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-gray-400">{sel.desc}</div>
              <div className="mt-2.5 flex flex-wrap gap-[18px] text-[12.5px] font-semibold text-gray-500">
                <span>km당 CO₂ <b className="text-gray-200">{sel.co2}</b></span>
                <span>하루 수송 <b className="text-gray-200">{sel.pax}</b></span>
                <span>이번 달 감축 기여 <b className="text-emerald-400">{sel.save}</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* 나의 절감 계산기 */}
        <div className="mt-3.5 rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[17px] font-bold text-gray-100">나도 버스로 바꾸면, 얼마나 아낄까요?</div>
            <span className="rounded-full bg-sky-500/12 px-2.5 py-1 text-xs font-bold text-sky-400">승용차 대비 계산기</span>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-5 max-[760px]:grid-cols-1">
            <div className="flex flex-col justify-center">
              <div className="flex items-baseline justify-between">
                <span className="text-[13.5px] font-semibold text-gray-400">출퇴근 왕복 거리</span>
                <span className="text-[26px] font-bold tabular-nums text-emerald-400">
                  {calcKm}
                  <span className="ml-0.5 text-sm font-semibold text-gray-400">km</span>
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={60}
                value={calcKm}
                onChange={(e) => setCalcKm(Math.max(2, Math.min(60, parseInt(e.target.value, 10) || 2)))}
                className="mt-3.5 h-7 w-full cursor-pointer"
                style={{ accentColor: '#03b26c' }}
                aria-label="출퇴근 왕복 거리 (km)"
              />
              <div className="mt-1 flex justify-between text-[11.5px] font-semibold text-gray-600">
                <span>2km</span>
                <span>60km</span>
              </div>
              <div className="mt-2.5 text-[12.5px] font-semibold text-gray-500">주 5일, 연 240일 출근 기준이에요.</div>
            </div>
            <div className="rounded-2xl bg-emerald-500/8 px-6 py-5 text-center">
              <div className="text-[13px] font-semibold text-gray-500">승용차 대신 버스를 타면, 1년에</div>
              <div className="mt-1.5 text-[38px] font-bold tracking-[-1px] tabular-nums text-emerald-400">
                {calcCo2.toLocaleString()}
                <span className="ml-1 text-[17px] font-bold">kg CO₂</span>
              </div>
              <div className="mt-2 text-sm font-bold text-gray-200">
                소나무 <span className="text-emerald-400">{calcPine.toLocaleString()}그루</span>가 1년간 흡수하는 양이에요 🌲
              </div>
              <div className="mt-2.5 text-[11.5px] font-semibold text-gray-500">승용차 170g/km vs 시내버스 1인당 24g/km 기준</div>
              <button
                onClick={onShare}
                className="mt-3.5 h-11 rounded-xl bg-emerald-600 px-[22px] text-[13.5px] font-bold text-white transition-colors hover:bg-emerald-500"
              >
                내 절감량 공유하기
              </button>
            </div>
          </div>
        </div>

        {/* 데이터가 바꾼 것들 */}
        <div className="mt-3.5 rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[17px] font-bold text-gray-100">여러분의 이용이 바꾼 것들</div>
            <span className="rounded-full bg-sky-500/12 px-2.5 py-1 text-xs font-bold text-sky-400">데이터 → 서비스 개선</span>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-gray-500">
            버스를 타는 것만으로 데이터가 쌓이고, 그 데이터가 다시 버스를 좋게 만들어요.
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {IMPACT.map((it) => (
              <div key={it.month} className="flex items-start gap-3 rounded-xl bg-gray-800/50 px-4 py-3.5">
                <span className="flex-none rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white">{it.month}</span>
                <div className="text-[13.5px] font-semibold leading-relaxed text-gray-300">
                  <b>{it.text}</b> — {it.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* footer */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11.5px] font-medium leading-relaxed text-gray-600">
            산정 기준 — 도입 전 12개월 연비 베이스라인 대비 실측 (OBD·DTG 교차 검증) · 배출계수 환경부 고시 · 소나무 환산 6.6kgCO₂/그루·년
          </span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              location.hash = ''
            }}
            className="flex-none text-[11.5px] font-semibold text-sky-400 hover:text-sky-300"
          >
            ← 관제 데모로 돌아가기
          </a>
        </div>
      </div>
    </div>
  )
}
