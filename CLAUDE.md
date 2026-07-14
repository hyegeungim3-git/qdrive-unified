# Qdrive 대통합 — 프로젝트 컨텍스트

대구 시내버스 통합 플랫폼의 사업 제안용 라이브 데모. **두 선행 프로토타입을 하나의 통일된 플랫폼으로 통합한 정본**이다.

## 출신 (통합 대상)
- **base = qdrive-proto** (Vite/React 19/TS/Tailwind 4): 실제 시뮬레이터 엔진 + 이해관계자 탭. 이 저장소의 뼈대.
  - 원본: `../Qdrive/qdrive-proto`, 구 저장소 github.com/hyegeungim3-git/qdrive-proto
  - **proto 업그레이드 동기화 지점: `64cfa39`** (2026-07-13 반영). 이후 원본이 더 나가면 `git -C ../Qdrive/qdrive-proto log --oneline 64cfa39..HEAD`로 델타 확인 후 반영.
- **탄소 플랫폼** (정적 HTML `.dc.html` + dc-runtime, 토스 디자인): 탄소중립 서사·V2G/AI Planning 시뮬레이터·시민 공개 대시보드·운수사 경영 손익. 기능/콘텐츠를 React로 이식.
  - 원본: `../AI 기반 탄소중립 운영 플랫폼`, 구 저장소 github.com/hyegeungim3-git/qdrive-carbon-platform
- 이 통합본 저장소: **로컬 git만** (main 브랜치). GitHub 원격은 미연결 (사용자 지시 시 연결).

## 핵심 통찰 (전 화면 기능 분석 결과)
두 데모는 같은 도메인을 **다른 렌즈**로 봄 → 대부분 상충이 아니라 **상보**.
- **proto = 살아있는 운영 엔진**: 기능 대부분이 시뮬레이터 연동 **실동작**(민원→증빙 자동매칭, Agentic 승인 루프, 정당판정+음성소명 왕복, 파생 센서, 자동생성 리포트). 엔지니어링 깊이 압도적.
- **탄소 = 탄소중립 서사 + What-if**: 대부분 정적 목업이나 proto에 없는 것 보유(탄소·연료 인과사슬 r=0.81, 경영 손익 P&L, 시민 공개 페이지=계산기·공유는 실동작, AI Planning·V2G 시뮬레이터, 라이브 AI 코파일럿=실제 Claude).
- **통합 원칙**: **살아있는 코어는 proto, 사업가치 레이어는 탄소.**
- 참조: 통합 설계도 아티팩트 https://claude.ai/code/artifact/95f41e46-d497-4c44-a229-33512f820722

## 현재 확정 IA (2026-07-13 서비스 구조 재편 후 — 최신)
최상위 탭 7개, **"누가 보는가" 단일 축**: 시티 · 운수사(8서브탭: 관제/💰경영·투자/운행이력/AI리포트/연료·에코AI/진단스캐너/정비도우미/차고지) · 기사(+배지·인사이트+내 에이전트) · 승객 · **🌱 탄소중립 분석**(성과 증명 전용, 2서브탭: 탄소·연료/안전운행) · 실증리포트 · 로드맵
별도 진입점: **시민 공개 페이지**(`#citizen`) · 공통 오버레이: **AI 코파일럿**(엔진 규칙조회+라이브 Claude, 전 탭)
AI 업무센터·에이전트 플랫폼은 최상위 탭에서 해체돼 각 소속 탭의 조치함/내 에이전트/승인함으로 흡수됨 — 상세는 하단 "서비스 구조 재편" 절 참조. 이 절 아래 매트릭스·탭 목록은 그 재편 **이전** 스냅샷이므로 탭 개수 등 일부 옛 정보 포함(이력 보존용).

## 배포 (2026-07-13)
- **저장소(공개)**: https://github.com/hyegeungim3-git/qdrive-unified
- **라이브**: https://hyegeungim3-git.github.io/qdrive-unified/ (main push 시 Actions 자동 배포)
- **시민 공개**: https://hyegeungim3-git.github.io/qdrive-unified/#citizen
- Pages는 `.github/workflows/deploy.yml`(트리거 `main`, npm install, dist 업로드). vite base `/qdrive-unified/` = 저장소명 일치. 민감정보 미커밋 확인 후 공개.

## 통합 매트릭스 (best-of-both — 진행 상태)
| 통합 대상 | proto 기반(유지) | 탄소 플랫폼에서 이식 | 결정 | 상태 |
|---|---|---|---|---|
| 시티 대시보드 | CityDashboard + PolicyReport | — (탄소 분석은 별도 탭으로 분리) | 유지 | ✅ 유지 |
| 🌱 탄소중립 분석(신규 탭) | (엔진 kpi 집계) | 탄소·연료·안전 대시보드(r=0.81), AI Planning·V2G 시뮬레이터 | **엔진 일부 연결→실동작 승격** | ✅ 완료(carbon 탭, 3서브탭) |
| 운수사 관제 | OperatorView 6서브탭 | 경영 손익(P&L)·V2G 잠재수익 → "경영 요약" 서브탭 추가 | ADD 서브탭 | ✅ 완료(💰 경영 요약 서브탭) |
| 기사 앱 | DriverApp(랭킹·코칭·소명 유지) | 배지 6종·퍼스널 인사이트만 (탄소 정적 랭킹은 DROP) | MERGE 일부 | ✅ 완료(프레임 하단 리포트 섹션, MVP 배지 rank 연동) |
| 승객 앱 | PassengerApp | — | 유지 | ✅ 유지 |
| 시민 공개(별도 진입) | (kpi 집계 연결) | 시민 탄소 페이지(히어로·소나무·계산기·공유·등급) | ADD 진입 | ✅ 완료(#citizen, 39721e3) |
| 실증리포트/로드맵 | ReportView / TeaserView | — | 유지 | ✅ 유지 |
| 공통 | 다크모드·DemoControls·BIS worker | 라이브 AI 코파일럿, 토스급 상태디자인 완성도 | ADD·통일 | ✅ 완료(코파일럿·라이트/다크·375 반응형 검증) |

**디자인 통일 원칙**: proto의 Paperlogy + Tailwind가 정본. 탄소의 토스 토큰/Pretendard는 가져오지 않고 완성도(상태 디자인·마이크로인터랙션·서사)만 흡수. 임의 색·임의 px 금지, 토큰만 사용.

## 이식 시 상충 해소 (확정)
- 기사앱 **랭킹 중복** → proto(엔진 실시간) 채택, 탄소 정적 랭킹 DROP. 배지·인사이트만 이식.
- **디자인 이원화** → Paperlogy+Tailwind 정본 통일.
- 코파일럿: proto worker는 BIS 전용(AI 아님)이라 순수 추가.

## 아키텍처 (핵심만 — base 상속)
- `src/sim/engine.ts` — 시뮬레이터 심장. 250ms 실틱 × 배속, 1초 서브스텝. 버스 9대(3노선),
  기사 페르소나 A모범/B평균/C개선필요, 연비→CO₂ 모델, 데모 트리거(triggerRiskEvent/
  triggerFault/fileComplaint/forceRecommendation/cycleWeather), 하차예약(reservation)
- `src/sim/store.ts` — 엔진 싱글턴 + useSyncExternalStore. DEV에서 window.__engine 노출
- `src/sim/types.ts` — **실데이터 교체 지점**: PacketSource 인터페이스. 실단말 연동 시 SimEngine 대신 RealPacketSource 구현으로 스왑
- `src/sim/bis.ts` — 대구 BIS 실차 오버레이 (TAGO 오픈API, vite 프록시 /tago, 로컬 dev만. 키는 localStorage 'qdrive-bis-key', 절대 커밋 금지)
- `src/sim/routes.ts` — 노선 폴리라인(주요 간선 근사)
- `src/views/` — 탭당 1파일. OperatorView는 서브탭(관제/진단스캐너/AI정비챗/차고지)
- 테마: `src/theme.ts` + index.css의 html.light 변수 반전
- 폰트: Paperlogy 7웨이트, public/fonts, url('../fonts/...') 상대경로

## 도메인 요점
- 주인공 차량 = 대구70자3742 (김성호 기사, 급행1) — 모든 데모 시나리오의 중심
- 반월당 = 3개 노선이 모두 지나는 기준 정류장 (승객 앱 ETA·탑승 기준점)
- 위험운전 8종(공단 기준), eTAS 자동제출, 준공영제 정산 검증(BMS×DTG 교차)
- 탄소 정합 수치(탄소 플랫폼 기획서 §4 정합 사전 상속): 경유 배출계수 2.68 kgCO₂/L, 소나무 6.6 kgCO₂/그루·년. 이식 시 수치 정합 먼저 확인.

## 결정사항 (뒤집으려면 사용자 확인)
- 백엔드 없음 (데모는 오프라인 생존 우선) / 커밋 메시지 한국어, PowerShell here-string·쌍따옴표 금지
- 통합 방식: React 단일 앱 (dc-runtime 정적 HTML은 base로 채택하지 않음 — 확장성)
- git identity는 저장소 로컬 (hyegeungim3-git), --global 금지

## 검증
- `npm run build` 통과 확인. 폰트 `../fonts/...` 미해결 경고는 런타임 해석이라 정상.
- **vite 8(rolldown) 빌드 크래시 함정**: `node_modules/.vite` 캐시가 손상되면 "644 modules transformed" 직후 청크 렌더링 단계에서 네이티브 크래시(exit -1073740791, STATUS_STACK_BUFFER_OVERRUN, 패닉 메시지 없음). **해결: `node_modules/.vite`와 `dist` 삭제 후 재빌드.** 코드 문제로 오인 금지.
- PowerShell에서 `npm run build 2>&1`은 vite stderr를 NativeCommandError로 감싸 exit 9로 보임 → 실제 판정은 `cmd /c "npx vite build > log 2>&1"` 후 `$LASTEXITCODE`로.
- 브라우저 검증은 DOM 텍스트/상태 우선 (스크린샷은 라이브 카운터 리렌더로 타임아웃 잦음). 콘솔의 Electron sandboxed_renderer 에러는 프리뷰 하네스 내부 문제로 앱과 무관.

## 빌드 시퀀스 (각 슬라이스: 이식→빌드→브라우저 검증→커밋)
1. **시민 공개 페이지**(별도 진입) ← 자기완결·실동작 위젯 많음, 첫 검증 슬라이스
2. **🌱 탄소중립 분석 탭**(신규 최상위) ← 탄소·연료·안전 대시보드 + AI Planning·V2G(엔진 kpi 연결)
3. **운수사 경영 요약 서브탭** ← 손익 P&L(엔진 연료절감·CO₂ 연결)
4. **기사앱 배지·인사이트** ← DriverApp 리포트 섹션 보강
5. **라이브 AI 코파일럿**(공통 오버레이) ← 사용자 키→Claude 직접호출
6. ✅ 디자인 통일·모바일 반응형·README 통합본 정리 — 완료(base `/qdrive-unified/`, 라이트/다크·375 검증)

## 대통합 1차 완료 (2026-07-13)
6개 슬라이스 전부 이식·검증·커밋. 라이트(기본)/다크 테마·375px 반응형 무오버플로 확인. 원본 2개 프로젝트 무손상.

## proto 업그레이드 반영 (2026-07-13, 51914ca→64cfa39)
원본 proto 8커밋 델타를 통합본에 반영. 별도 저장소라 cherry-pick 대신 **무충돌 파일 통째 복사 + 충돌 파일 proto판 복사 후 내 추가분 재적용** 방식.
- **proto 신규(통째 반영)**: engine.ts(headway·ecoScore·fuelWaste·예측형 에코코칭)·types.ts·agentRequests.ts / 뷰: AgentCenter(AI 업무센터 탭)·AgentPlatform(에이전트 플랫폼 탭)·operator/EcoFuel(연료·에코 AI 서브탭) / PolicyReport·AiReport 소폭 / DEMO_GUIDE.md
- **충돌 파일 병합**: App(proto agent/platform 탭 + 내 carbon/citizen), OperatorView(proto eco 서브탭·headway 열·소명순화 + 내 biz 서브탭), DriverApp(proto headway·에코·소명순화 + 내 리포트), Copilot(**proto 엔진 규칙기반 코파일럿 + 내 라이브-Claude 모드 병합** — 추천질문=규칙조회, 자유입력=라이브키 시 실제 Claude)
- 최종 탭 9개: 시티·운수사·기사·승객·🌱탄소중립분석·AI업무센터·에이전트플랫폼·리포트·로드맵 (+시민공개 #citizen, +코파일럿 오버레이). 빌드 통과(JS 1029KB), 전 기능 DOM 검증.

## 서비스 구조 재편 (2026-07-13, proto 업그레이드 반영 직후)
사용자 요청: "겹치는 것 제외하고는 각 원본 기능이 잘 어우러져 표현되면 좋겠다" — 9탭 진단 아티팩트(https://claude.ai/code/artifact/6559ac4f-dbeb-48a0-b9b4-f1a56b526e9e)의 실행 옵션 C를 이 원칙으로 수행. 겹치는 부분만 통합하고 고유 기능은 보존·재배치.

**슬라이스1 — AI 어시스턴트 통합**: 에이전트 플랫폼 탭 해체. 회사 롤 규칙조회(코파일럿과 중복)는 제거. 고유 기능인 기사 개인 Q&A+빠른신청은 `DriverApp.tsx`의 `MyAgent` 컴포넌트로, 회사 승인함은 `OperatorView.tsx`의 "기사 요청 승인함" 패널로 이관. 공유 상태는 기존 `sim/agentRequests.ts` 그대로 재사용(기사↔회사 왕복 검증 완료). `AgentPlatform.tsx` 삭제.

**슬라이스2 — AI 업무센터 재배치**: TASKS·카드로직을 `components/ActionCenter.tsx`로 추출(owner 필터, 토글 없음). 대구시 3업무 → `views/city/ActionCenterModal.tsx`(PolicyReport와 동일 모달 셸). 버스회사 3업무 → OperatorView 관제현황 인라인 패널(접기/펼치기, 승인건수 배지). `AgentCenter.tsx` 삭제. owner 필터링 검증 완료(시티엔 대구시 업무만, 운수사엔 버스회사 업무만).

**슬라이스3 — 경영·투자 통합**: 탄소중립 분석의 AI Planning(전기전환·V2G 시뮬레이터 + 전환대상TOP5)을 `operator/BizSummary.tsx`로 이관, 서브탭명 "💰 경영 요약"→"💰 경영·투자". 탄소중립 분석은 2서브탭(탄소·연료/안전운행)으로 슬림화 — 순수 성과 증명 전용. 탭 간 서브탭 딥링크는 신규 `sim/navIntent.ts`(1회성 인텐트, OperatorView가 마운트 시 소비)로 구현 — 탄소중립분석의 크로스링크 배너 클릭 시 운수사 "경영·투자" 서브탭으로 직행 검증 완료.

**결과**: 탭 9개 → 7개. 각 해체된 탭의 고유 기능은 소실 없이 더 적합한 맥락으로 재배치(위 "현재 확정 IA" 절 참조). 전 슬라이스 빌드+새 브라우저탭 콘솔 0에러+기능 왕복 검증. 원본 두 프로젝트 무손상.

## 기사앱 리포트 화면 보완 (2026-07-13, 슬라이스4 재검토)
사용자 지적으로 재검토 — 슬라이스4("기사앱 배지·인사이트")에서 원본 탄소 플랫폼 기사앱 리포트 탭의 **절반을 누락**했던 것을 발견·수정. 원인은 의도적 제외가 아니라 초기 스코프를 "배지·인사이트"로 좁게 잡으며 나머지를 검토 목록에서 빠뜨린 실수. 특히 "사내 랭킹"은 "proto 실시간 순위와 중복"이라 판단해 DROP으로 기록했으나, 재검토 결과 원본은 동료 목록이 보이는 소셜 비교 요소이고 proto 홈 위젯은 숫자 하나(N위/9명)뿐이라 실은 겹치지 않는 콘텐츠였음 — 판단 실수.

추가된 것(리포트 탭, `ReportScreen`): 이번 주 KPI 3종(서사값+오늘 실측 각주) · 주간 연비 추이 차트(내 연비 vs 회사평균, 원본 데이터 그대로) · **내 운행 기록(엔진 실시간 trips 필터링 — 원본은 정적 4건, 지금은 실동작으로 승격)** · **사내 안전운전 랭킹(엔진 9대 전원 실시간 — 원본은 정적 5명, 지금은 전원 실동작)** · 개선 포인트 AI 코칭 팁 3종. 기존 배지·인사이트·에이전트와 함께 원본 리포트 탭 전 구성 완성.
검증: 8개 섹션 렌더 확인, 랭킹 실시간 변동 확인, 배속 상승 시 운행기록 실제 축적 확인(2회차→1회차 최신순, 노선·거리·연비·CO₂ 실데이터).

남은 후보: AI Planning·V2G의 엔진 심화 연결 / 스크린샷 기반 화면설계서 / EcoFuel↔탄소중립분석 교차링크(경미, 미착수).

## 전체 재검수 + 누락 콘텐츠 복원 (2026-07-14)
사용자 요청: "각 폴더에서 뺐던 내용/기능/컨텐츠가 있으면 뺀 이유를 말하고, 아니면 전체 재검수하고 어울리게 만들어줘. UI/UX도 검수하고 사용성·직관성을 높여줘. 꼼꼼히."

**멀티에이전트 감사(Workflow, 104/105 에이전트)** 로 두 원본 vs 통합본 전수 대조. 결과:
- **UI/UX 결함 37건** → 발주처 신뢰·정확성(배치1), 발주처·민감독자 톤(배치2), 라이트 모드 접근성·대비 AA(배치3)로 3배치 커밋 완료(77c0a43·e18da41·5850c45). 배치1에서 경쟁사명·시연지시문·과장 배지 제거, 클립보드 폴백, 페르소나 톤(개선필요→코칭 대상) 등. 배치3에서 라이트 팔레트 캡션 대비 AA 확보 + 차트 축/격자 CSS 변수화(recharts에서 var() 실렌더 확인).
- **누락 콘텐츠 19건** 식별(10 restore-live / 5 restore / 4 drop-justified). 사용자 확정 범위(정책제안+KOC)만 우선 복원(8ca99cf):
  - **PolicyReport**: "🏙️ 데이터 기반 정책 제안" 3건(반월당 신호주기→교통정책과 / 만평네거리 정류장 이설→도로관리과 / 신천대로 전용차로 연장→대중교통과). 개인 코칭을 시설·환경 개선으로 보완하는 도시 레벨 서사. 부서 연계 명시.
  - **CarbonAnalysis(탄소·연료)**: "♻️ KOC 크레딧 실적명세". 확정분(321.1 tCO₂/2,858,000원/OBD×DTG/8월 제출) + kpi.totalCo2SavedKg 실시간 크레딧 환산. "실측이 자산이 되는" 구조 라이브 시연.
- **관제·시티 첫인상 배치(A그룹 6건) 복원 완료 (2026-07-14)**: 사용자가 전체 목록 확인 후 이 배치를 선택. 감사 요약대로 저비용·첫인상 회복 효과 최상 항목들.
  - **성과 리본**(CityDashboard 최상단 전폭): 탄소·연료 라이브 kpi(연료절감·CO₂·안전점수·주행) + "🌱 탄소중립 분석에서 성과 증명 →" CTA(onNavigate('carbon')). CityDashboard에 onNavigate prop 신설(App.tsx 주입).
  - **AI 3카드**(우열 KPI 아래): AI 운행 인사이트/안전 코치/정비 예측 — snap 파생 라이브, 각 카드 딥링크(insight→carbon, coach→driver, forecast→operator 진단스캐너 via navIntent).
  - **AI 추천 4건 글랜스**(OperatorView 관제현황 상단): 전기전환→biz·충전→depot·공회전코칭→eco·정비진단→chat, 각 카드 setSub 딥링크. '지금 AI가 추천하는 4가지'를 내비 없이 한눈에.
  - **차량 이상 트리아지**(CityDashboard 좌열): 개별차량×OBD/DTG×심각도배지(위험/주의/정보)×경과시간 — snap.fault(위험)·최근 이벤트 120s(주의)·score<72(정보) 라이브 집계. 위젯 토글 'triage' 추가.
  - **계통별 가동률**(CityDashboard 좌열): 급행·간선·지선·순환 운행/보유 프로그레스 바 — 도시 전체 준공영제 스케일 정적(9대 라이브 스케일 오도 방지 명시). 위젯 토글 'network' 추가.
  - **지도 오버레이**(MapView): 줌 +/− 버튼(44px 터치, 좌하단 아닌 우하단)·LIVE 배지·펄스(좌상단)·히트맵 그라디언트 범례(ON 시). **줌 버그 수정**: ①L.DomEvent.disableClickPropagation은 React 19 루트위임 onClick을 삼켜 클릭 무효 → disableScrollPropagation만 사용. ②애니메이션 줌(zoomIn())은 엔진 250ms 리렌더가 leaflet 줌 애니메이션(~250ms)을 중간 취소 → setZoom(±1, {animate:false}) 즉시 줌으로 교체. 브라우저 검증: 13→15→14 실동작.
  - 검증: 타입체크·빌드 통과. 6항목 전부 DOM 렌더 + 상호작용(CTA·딥링크·줌) 실동작 확인. 앱 콘솔 에러 0(Electron sandbox·편집중 HMR 잔상 제외). 스크린샷은 leaflet+recharts+라이브카운터로 타임아웃 → DOM/기능 검증으로 판정.
- **차량 관리 배치(B그룹 4건) 복원 완료 (2026-07-14)**: 사용자 "B" 선택. Ultracode 다중에이전트 워크플로로 원본 dash V(탄소중립 대시보드.dc.html) 정확 추출 → 코드베이스 매핑 → 응집성/데이터모델 종합(9에이전트) 후 구현. **엔진/타입 확장 0**(최소확장 원칙 — 회사 스케일 수치는 9대 실증과 스케일이 달라 라이브 부적합, 라이브 필요값은 전부 기존 필드로 파생).
  - **신규 `src/views/operator/VehicleRegistry.tsx`** = 관제 서브탭 9번째 "🚌 차량 관리"(id 'vehicles', depot 다음). 자산·대장 렌즈로 4항목을 응집(운영 렌즈 ops와 분리):
    - **KPI 4카드**(item1): 등록412·정비입고12·예지정비5·평균차령5.8 정적 헤드라인 + 라이브 각주(실증 9대·발행 workOrder·초안 workOrder). 예지정비 딥링크→scanner. KpiCard 재사용.
    - **라이브 9대 브리지**: snap.vehicles 실시간 자산행(누적주행=odoBase+distanceKm, 상태배지=fault/dwell 파생, ops:431 미러). LIVE 칩.
    - **정적 자산 대장**(item4): 준공영제 5개사 예시 7행(REGISTRY 상수, 회사명=CarbonAnalysis CO_RANKS 정본 세운/세진/경북/신흥/동명, 유종·차령·누적주행·최근정비일). 검색 실동작(id/회사/유종 부분일치)+빈상태. '차량 등록'=disabled no-op.
    - **상태 도넛**: recharts PieChart 운행356/정비12/대기44=412 (정적).
    - **정비 이력**(item2): FIX_LOGS 3건(3742/5563/0917 — ops '정비비 예측'과 동일 ID로 예측→완료 짝) + 발행 workOrder 있으면 라이브 승격 1건 prepend(비용 '(예상)' 접미로 구분).
  - **관제현황 검색**(item3, OperatorView 3-패치): 로스터 테이블에 차량번호·기사·노선 부분일치 검색 + '{n}/9대' 카운터 + 빈상태(colSpan=11). 4항목 중 유일 무중복 신규분. co(운수회사) 필터는 VehicleState에 필드 없어 노선축으로 대체.
  - **스케일 3단 분리**(오도 방지): 시412 / 5개사 예시대장(회색 '준공영제 5개사·예시 대장' 칩) / 실증9(emerald '실증 9대·실시간' 칩). 412=5개사 합계(세운98 포함)·실증9 포함관계 헤더 명시. CityDashboard NETWORK_UTIL 선례 계승.
  - 검증: 타입체크·빌드 통과. DOM+기능 전수 — 서브탭 6섹션 렌더 / 자산검색 왕복('전기'→2행·경유숨김, 'zzz'→빈상태, 복귀) / 관제검색 왕복('급행'→6/9, 'zzz'→빈상태, 복귀→9/9) / 예지정비 딥링크→진단스캐너 / **라이브 승격 폴링**: triggerFault→초안 각주 0→1·발화배지, approveWorkOrder→발행 각주 0→1·정비이력 라이브카드 출현. 앱 콘솔 에러 0.
  - **어드버세리얼 리뷰 패스(2026-07-14, 17에이전트 3차원×회의적 재검증)로 확정 결함 8건 수정**(커밋 b6f4b02): ①**412 축소 오도** — '시 전체 412대'는 오류(대구 CNG 시내버스≈1,513대·26개사가 정본, 412는 준공영제 참여 5개사 합계). '준공영제 참여 5개사 412대'로 재라벨(헤더·도넛캡션·주석 3곳, CitizenPublic '참여 버스' 어조 통일). ②도넛 Tooltip 배경 var(--color-gray-900)→라이트 #fff 반전으로 밝은 세그먼트색 텍스트 대비 실패 → 테마 불변 다크 #191f28 고정. ③유종 'cng' 소문자 검색 0건 → toLowerCase 정규화. ④라이브 표 최근정비 시각 fault.startedAt→발행 workOrder.createdAt(정비이력 카드와 90초 불일치 제거). ⑤LIVE 표 하드코딩 '2026-06월'→'—'(발화 시 실시각). ⑥onSub 타입 string→'scanner' 좁힘. ⑦헤더 text-sm→text-lg(BizSummary 통일). ⑧**후속 검증에서 발견**: 도넛 Pie가 250ms 리렌더에 애니메이션 취소돼 아예 안 그려짐 → isAnimationActive={false}(라이브 차트 선례). **교훈: recharts를 useSim() 라이브 뷰에 넣을 땐 isAnimationActive={false} 필수(지도 줌 애니메이션 취소와 동일 계열 함정).**
- **운전자 관리 배치(C그룹 5건) 복원 완료 (2026-07-14)**: 사용자 "이어서" 지시. Ultracode 다중에이전트 스펙 워크플로(11에이전트) → 구현. 엔진/타입 확장 0.
  - **신규 `src/views/operator/DriverRegistry.tsx`** = 관제 10번째 서브탭 "👥 기사 관리"(id 'drivers', vehicles 다음). 차량=자산 렌즈와 대칭인 사람=인사·성과 렌즈. VehicleRegistry 구조 미러(useSim·KpiCard·Panel·StaticChip/LiveChip·onSub).
    - KPI 4카드: 등록기사 486(정적) / 평균운전점수(라이브 avgScore) / 교육대상 23(정적)+실증 score<78 각주 / 우수기사 64(정적)+실증 score>=90 각주.
    - 성과관리 Panel: 에코 달성률(라이브 ecoScore 9대 평균, emerald 진행바 — CSS div, recharts 아님) + 인센티브 지급 12,800,000원(정적) + 교육 이수율 91%(정적 sky 진행바) + 지표축 각주.
    - 실증 기사 성과 분포: 우수/일반/교육대상 라이브 count(실증 9명), 교육대상 카드 클릭→onSub('ops') 관제 조치함 딥링크.
  - **값 충돌 정합**(78/91 이원화 해소): 에코 달성률=라이브 ecoScore 평균(시드 77.8≈78 자연정합). 78%=CitizenPublic:216 '에코 드라이빙 실천율 (5개사 평균)'로 스코프 명시. 91%=BizSummary:200 '세운버스 에코 실천율 91% (준공영제 5개사 평균 78%)'로 세운 스코프 명시. 교육 이수율 91(수료)은 다른 서브탭·스케일·지표축(수료 vs 참여)+각주로 에코 실천율 91과 디커플.
  - **486 스케일 라벨**: '준공영제 참여 5개사 486명 · 412대 (세운 98 포함) · 실증 9명 라이브'. 412 재라벨(b6f4b02) 선례 계승, '시 전체' 금지. 486(기사)>412(차량)=교대·예비.
  - OperatorView 3-패치 + **subNav flex-wrap**(10번째 버튼 오버플로 방지).
  - 검증: 빌드 통과. DOM+기능 — 4KPI·성과관리 3행·분포 렌더 / 에코 진행바 라이브 동기(79%→80% 활동 시 변동, width=값) / 성과분포 3/4/2 합9 / 교육대상 딥링크→관제현황 / BizSummary·CitizenPublic 정합 편집 확인. 앱 콘솔 에러 0.
- **전체 감사 restore 후보 19건 전량 처리 완료** (A그룹 6 + B그룹 4 + C그룹 5 + 앞서 정책제안·KOC 2 + drop-justified 4). 남은 후보 없음.

## UI 최적화 패스 (2026-07-14, 사용자 지적 → 전체 훑기)
사용자가 스크린샷으로 UI 깨짐 지적 + "전체적으로 훑어보고 최적화".
- **사용자 직접 지적 3계열**(커밋 4b5a2d5): ①BizSummary '우리' 배지 고정폭 w-24 줄바꿈→w-32+nowrap. ②저대비 텍스트 — index.css html.light에 emerald/red/violet-200 오버라이드 **누락**(sky/amber-200만 있었음) → #065f46/#991b1b/#5b21b6 추가(체계적). ③**도넛 공백** — recharts Pie가 엔진 250ms 리렌더에 애니메이션 취소돼 sector path 미렌더. BizSummary·CarbonAnalysis 두 도넛 isAnimationActive={false}(VehicleRegistry 도넛·지도 줌과 동일 계열). **교훈 재확인: 라이브(useSim) 뷰의 모든 recharts에 isAnimationActive={false} 필수.**
- **전 뷰 반응형 감사**(다중에이전트 69, 62 스캔 → 확정 24, 커밋 f9c2499): 전부 협폭(375/768) 가로 오버플로. 대부분 데스크톱 무영향 브레이크포인트 추가. 핵심: App 헤더탭 flex-wrap / CityDashboard 3분할 grid lg: 분기+지도 max-lg:min-h / OperatorView 로스터 11열 overflow-x-auto 래퍼 / 각 grid-cols-N에 max-[900px]·max-[860px] 분기 / PassengerApp flex-col xl:flex-row / 모달 헤더 min-w-0+닫기 shrink-0 / Copilot max-h-[calc(100dvh-6rem)] / **DriverApp 리포트: 고정 1020px 태블릿 프레임(scale 축소) 내부의 뷰포트 브레이크포인트 5곳 제거**(오작동). 검증: 375px 최상위 7탭·운수사 8서브탭·시민 전부 body 오버플로 **0**(이전 260px+), 768 전 탭 0, 데스크톱 1280 3분할 그리드 유지 회귀 없음.
- **잔여 오탐 기록**: 감사 [22] DriverApp 운전석 flex는 프레임이 scale로 축소되므로 '모바일 눌림' 전제가 틀림 → 스킵. DriverApp:718 max-[860px]은 리포트 밖 다른 스크린이라 보수적 유지.

## 성과 검증 탭 신규 + 폰트 수정 (2026-07-14)
사용자 요청: 전략 문서(데이터·AI·온톨로지→서비스화→성과증명)의 결론부를 실동작 화면으로.
- **폰트 깨짐 수정**: TeaserView(로드맵) 데이터 원천 라벨이 `font-mono`였는데, 영문약어(DTG)+한글(차고지/충전소·정비시스템)이 섞여 한글이 mono 글리프 부재로 폴백돼 깨져 보임 → `font-mono` 제거, Paperlogy 브랜드 폰트로 통일. **교훈: 한글 포함 텍스트에 font-mono 금지**(차량ID 등 숫자 위주 표 정렬용만 유지).
- **신규 `src/views/PerformanceProof.tsx`** = 최상위 탭 "🔬 성과 검증"(carbon 다음). 전략 §6(유의미한 결과 4단 증명)의 실동작판. 5섹션: ①성과귀속(반사실 비교) ②A/B(페르소나 그룹) ③기준선 ④서비스별 신뢰지표 테이블 ⑤4단 게이트.
  - **핵심 = 엔진의 `baselineFuelM3`(코칭 미적용 가정 연료 = 반사실/counterfactual)를 활용.** 실측 `fuelM3`과의 차이가 유가·날씨 제거된 **서비스 귀속 순효과**. 라이브 −4.9%.
  - **A/B 인과 지문**: 페르소나 A(모범)2.86% < B(평균)5.25% < C(개선대상)6.34% — 개선여지 큰 군에서 효과 큼 = 코칭이 실제 원인이라는 증거. 전부 엔진 라이브 파생.
  - 신뢰지표 테이블(성과/출처/표본/교차검증), 4단 게이트(Baseline✓·Attribution✓·Verification 진행·Honesty✓), "성과 검증 안 되면 과금 안 함" 메시지.
  - recharts에 isAnimationActive={false}, 테이블 overflow-x 래퍼, grid 반응형 — 기존 교훈 전부 선반영. 검증: 빌드·DOM·라이브 폴링(A<B<C, 순효과 라이브)·콘솔 0.
- **전략 아티팩트**(별도): https://claude.ai/code/artifact/a0bbc371-17a5-4a5d-be46-9f38123ccb64 (데이터·AI·온톨로지·서비스화·성과증명 7섹션).
