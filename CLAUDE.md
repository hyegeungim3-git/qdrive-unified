# Qdrive 대통합 — 프로젝트 컨텍스트

대구 시내버스 통합 플랫폼의 사업 제안용 라이브 데모. **두 선행 프로토타입을 하나의 통일된 플랫폼으로 통합한 정본**이다.

## 출신 (통합 대상)
- **base = qdrive-proto** (Vite/React 19/TS/Tailwind 4): 실제 시뮬레이터 엔진 + 6탭 골격. 이 저장소의 뼈대.
  - 원본: `../Qdrive/qdrive-proto`, 구 저장소 github.com/hyegeungim3-git/qdrive-proto
- **탄소 플랫폼** (정적 HTML `.dc.html` + dc-runtime, 토스 디자인): 탄소중립 서사·V2G/AI Planning 시뮬레이터·시민 공개 대시보드·운수사 경영 손익. 기능/콘텐츠를 React로 이식.
  - 원본: `../AI 기반 탄소중립 운영 플랫폼`, 구 저장소 github.com/hyegeungim3-git/qdrive-carbon-platform
- 이 통합본 저장소: **로컬 git만** (main 브랜치). GitHub 원격은 미연결 (사용자 지시 시 연결).

## 통합 매트릭스 (best-of-both — 진행 상태)
| 통합 탭 | proto 기반(유지) | 탄소 플랫폼에서 이식 | 상태 |
|---|---|---|---|
| 시티 대시보드(대구시) | CityDashboard + PolicyReport | 탄소·연료·안전 대시보드, 기간 토글(일/월/연) 정합, AI Planning 시뮬레이터 | ⬜ 미착수 |
| 운수사 관제(버스회사) | OperatorView(관제·스캐너·정비챗·차고지) | 운수사 경영 손익(P&L), V2G 시뮬레이터 | ⬜ 미착수 |
| 기사 앱(운전자) | DriverApp | 게이미피케이션(랭킹·배지 6종), 퍼스널 인사이트 | ⬜ 미착수 |
| 승객 앱(시민) | PassengerApp | 시민 탄소 공개 대시보드(히어로 카운터·소나무 환산·노선 등급) | ⬜ 미착수 |
| 실증 리포트/로드맵 | ReportView / TeaserView | — | ✅ 유지 |
| 공통 | 다크모드·DemoControls | AI 코파일럿 라이브 모드(worker 활용), 토스급 디자인 완성도 | ⬜ 미착수 |

**디자인 통일 원칙**: proto의 Paperlogy + Tailwind가 정본 디자인 시스템. 탄소 플랫폼에서는 완성도(상태 디자인·마이크로인터랙션·서사)만 흡수하고 토스 토큰/Pretendard는 가져오지 않는다. 임의 색·임의 px 금지, 토큰만 사용.

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
- `npm run build` 통과 확인 (base 임포트 시점 통과 완료). 폰트 `../fonts/...` 미해결 경고는 런타임 해석이라 정상.
- 브라우저 검증은 DOM 텍스트/상태 우선 (스크린샷은 타임아웃 잦음)

## 남은 일 (통합 로드맵)
1. 승객 앱 ← 시민 탄소 공개 대시보드 이식
2. 운수사 관제 ← 경영 손익(P&L) + V2G 시뮬레이터
3. 시티 대시보드 ← 탄소·연료·안전 + AI Planning 시뮬레이터
4. 기사 앱 ← 게이미피케이션·퍼스널 인사이트
5. 공통 ← AI 코파일럿 라이브 모드, 디자인 완성도 정리
6. 모바일 반응형+PWA, README 통합본 정리
