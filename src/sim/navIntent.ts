/**
 * 탭 간 서브탭 딥링크 — 최상위 탭 전환(App.tsx)과 별개로, 전환 직후 열려야 할
 * 서브탭을 한 번만 전달한다. 예: 🌱 탄소중립 분석 → 운수사 관제의 "경영·투자" 서브탭으로 바로 진입.
 */
let pendingOperatorSubtab: string | null = null

export function setOperatorSubtabIntent(subtab: string) {
  pendingOperatorSubtab = subtab
}

export function consumeOperatorSubtabIntent(): string | null {
  const v = pendingOperatorSubtab
  pendingOperatorSubtab = null
  return v
}
