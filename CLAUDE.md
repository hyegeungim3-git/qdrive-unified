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

남은 후보: AI Planning·V2G의 엔진 심화 연결 / 스크린샷 기반 화면설계서 / EcoFuel↔탄소중립분석 교차링크(경미, 미착수).
