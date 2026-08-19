/**
 * 차고지 — 「1회 운행」 온톨로지의 소속 축.
 *
 * 차고지가 노선 기점에서 떨어져 있으면 그 거리만큼 **수입 없는 주행(공차)**이 매일 발생한다.
 * 이 거리를 운행 단위에 붙여 두지 않으면 "이 차고지가 만든 공차는 얼마인가"에 답할 수 없다.
 *
 * 회송거리는 **예시 상수**다(차고지↔기점 편도). 실증 단계에서는 출입고 기록(차고지 원천)의
 * 실측 거리로 교체된다 — 교체해도 아래 구조와 질의는 그대로 동작한다.
 */
export interface Depot {
  id: string
  name: string
  company: string
  /** 이 차고지가 대는 노선 */
  routeId: string
  /** 차고지 ↔ 노선 기점 편도 회송거리 (km) — 예시 상수 */
  deadheadKm: number
}

export const DEPOTS: Depot[] = [
  { id: 'D1', name: '성서차고지', company: '세운버스(주)', routeId: 'R1', deadheadKm: 4.2 },
  { id: 'D2', name: '북부차고지', company: '경북교통(주)', routeId: 'R2', deadheadKm: 6.8 },
  { id: 'D3', name: '칠곡차고지', company: '신흥버스(주)', routeId: 'R3', deadheadKm: 3.5 },
]

export const depotOfRoute = (routeId: string): Depot => DEPOTS.find((d) => d.routeId === routeId) ?? DEPOTS[0]

/** 영업 몇 회차마다 차고지로 돌아갔다 나오는가 — 교대·급유 주기 근사 */
export const DEADHEAD_EVERY_N_TRIPS = 4
