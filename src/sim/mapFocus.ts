import { useSyncExternalStore } from 'react'

/** 탭 간 공유되는 지도 포커스 — 운행 이력·돌발정보 등에서 위치 클릭 시 시티 지도가 플라이 */
export interface MapFocus {
  lat: number
  lng: number
  label?: string
  nonce: number
}

let focus: MapFocus | null = null
const listeners = new Set<() => void>()

export function focusMap(lat: number, lng: number, label?: string) {
  focus = { lat, lng, label, nonce: Date.now() }
  for (const l of listeners) l()
}

export function useMapFocus(): MapFocus | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => focus,
  )
}
