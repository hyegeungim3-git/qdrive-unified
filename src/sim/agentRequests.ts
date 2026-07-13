import { useSyncExternalStore } from 'react'

/**
 * 회사·기사 에이전트 플랫폼의 요청/승인 워크플로우 공유 스토어.
 * 기사가 제출(휴가·상황설명·교육문의) → 회사 승인함으로 흐른다. 역할·탭 전환에도 유지(모듈 레벨).
 */

export type RequestKind = '휴가' | '상황설명' | '교육문의' | '근무변경'

export interface AgentRequest {
  id: number
  kind: RequestKind
  from: string // 기사명
  vehicleId: string
  detail: string
  status: '승인 대기' | '승인' | '반려'
  at: number
}

let seq = 1
let requests: AgentRequest[] = []
const listeners = new Set<() => void>()

function emit() {
  requests = [...requests]
  for (const l of listeners) l()
}

export function submitRequest(kind: RequestKind, from: string, vehicleId: string, detail: string, at: number) {
  requests.unshift({ id: seq++, kind, from, vehicleId, detail, status: '승인 대기', at })
  if (requests.length > 20) requests.pop()
  emit()
}

export function resolveRequest(id: number, decision: '승인' | '반려') {
  const r = requests.find((x) => x.id === id)
  if (r) r.status = decision
  emit()
}

export function useAgentRequests(): AgentRequest[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => requests,
  )
}
