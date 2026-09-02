/**
 * 탭 간 서브탭 딥링크 — 최상위 탭 전환(App.tsx)과 별개로, 전환 직후 열려야 할
 * 서브탭을 한 번만 전달한다. 예: 🌱 탄소중립 분석 → 운수사 관제의 "경영·투자" 서브탭으로 바로 진입.
 */
let pendingOperatorSubtab: string | null = null
/** 이미 운수사 탭이 열린 상태에서 온 딥링크(플로팅 AI Q)는 마운트가 없으므로 구독자에게 즉시 알린다 */
const listeners = new Set<(subtab: string) => void>()

export function setOperatorSubtabIntent(subtab: string) {
  pendingOperatorSubtab = subtab
  listeners.forEach((fn) => fn(subtab))
}

/** 마운트돼 있는 OperatorView가 구독한다. 반환값은 해제 함수(useEffect cleanup) */
export function subscribeOperatorSubtabIntent(fn: (subtab: string) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function consumeOperatorSubtabIntent(): string | null {
  const v = pendingOperatorSubtab
  pendingOperatorSubtab = null
  return v
}
