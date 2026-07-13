import type { VehicleFault, VehicleState } from './types'

/**
 * 진단 스캐너 — OBD-II/CAN 1초 센서값 파생 모델.
 * 차량 상태(속도·RPM·고장 시나리오)에서 물리적으로 일관된 센서값을 생성한다.
 * 실단말 연동 시 이 파일이 실제 CAN 파싱 결과로 교체된다.
 */

export interface SensorRow {
  group: 'ADC' | 'ECU' | 'GPS' | 'SCR'
  name: string
  unit: string
  value: number | string
  /** 최근 추이 미니바 (0~1 스케일 12개) */
  history: number[]
  warn?: boolean
}

/** simTime 기반 결정적 노이즈 (재렌더에도 안정) */
function noise(seed: number, t: number, amp = 1): number {
  return Math.sin(t * 0.7 + seed * 13.7) * 0.5 * amp + Math.sin(t * 0.13 + seed * 5.1) * 0.5 * amp
}

function bars(seed: number, t: number, base = 0.55, amp = 0.35): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const v = base + noise(seed + i, t - (11 - i) * 2, amp)
    return Math.min(1, Math.max(0.05, v))
  })
}

export function buildSensorRows(v: VehicleState, fault: VehicleFault | null, t: number): SensorRow[] {
  const moving = v.speedKmh > 2
  const throttle = Math.max(0, Math.min(95, (v.speedKmh / 55) * 70 + noise(1, t, 8)))
  const torqueReq = Math.max(0, Math.min(100, throttle * 0.8 + noise(2, t, 5)))
  const torqueAct = Math.max(0, torqueReq - 3 + noise(3, t, 3))
  const railReq = 52 + noise(4, t, 3)
  const railAct = railReq - 6 + noise(5, t, 2)
  const isFaulty = fault !== null && fault.vehicleId === v.id
  const coolant = isFaulty ? fault.coolantTemp : 83 + noise(6, t, 2)
  const gpsSpeed = Math.max(0, v.speedKmh + noise(7, t, 4)) // GPS 오차 — 차량속도와 차이 시연

  const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

  return [
    { group: 'ADC', name: '단말기 ACC 신호', unit: '-', value: moving || v.dwellRemaining > 0 ? '1.00' : '0.00', history: bars(10, t, 0.9, 0.05) },
    { group: 'ADC', name: '단말기 공급전압', unit: 'V', value: r(27.1 + noise(11, t, 0.3)), history: bars(11, t, 0.7, 0.1) },
    { group: 'ADC', name: '단말기 ADC 채널1 전압', unit: 'V', value: '0.00', history: bars(12, t, 0.06, 0.02) },
    { group: 'ECU', name: '가속페달 개도량', unit: '%', value: r(throttle, 1), history: bars(20, t, throttle / 100, 0.25) },
    { group: 'ECU', name: '엔진 퍼센트토크 요구값', unit: '%', value: r(torqueReq, 1), history: bars(21, t, torqueReq / 100, 0.2) },
    { group: 'ECU', name: '엔진 퍼센트토크 실제값', unit: '%', value: r(torqueAct, 1), history: bars(22, t, torqueAct / 100, 0.2) },
    { group: 'ECU', name: '엔진 회전수', unit: 'rpm', value: v.rpm, history: bars(23, t, v.rpm / 2600, 0.15) },
    { group: 'ECU', name: '요구레일 압력', unit: 'MPa', value: r(railReq), history: bars(24, t, 0.55, 0.12) },
    { group: 'ECU', name: '실제레일 압력', unit: 'MPa', value: r(railAct), history: bars(25, t, 0.5, 0.12) },
    {
      group: 'ECU',
      name: '냉각수 온도',
      unit: '°C',
      value: r(coolant, 1),
      history: bars(26, t, Math.min(1, coolant / 115), isFaulty ? 0.05 : 0.04),
      warn: coolant >= 96,
    },
    { group: 'ECU', name: '엔진오일 온도', unit: '°C', value: r(88 + noise(27, t, 2), 1), history: bars(27, t, 0.72, 0.05) },
    { group: 'ECU', name: '차량 속도', unit: 'km/h', value: r(v.speedKmh, 1), history: bars(28, t, v.speedKmh / 60, 0.2) },
    { group: 'ECU', name: '클러치 스위치', unit: '-', value: v.speedKmh > 5 && v.speedKmh < 20 ? 'on' : 'off', history: bars(29, t, 0.4, 0.4) },
    { group: 'ECU', name: '브레이크 스위치', unit: '-', value: !moving || v.nextStopDistM < 130 ? 'on' : 'off', history: bars(30, t, 0.3, 0.3) },
    { group: 'ECU', name: '배기가스 유량', unit: 'm³/h', value: Math.round(v.rpm * 16.5 + noise(31, t, 400)), history: bars(31, t, 0.6, 0.15) },
    { group: 'ECU', name: 'DPF 재생 후 누적거리', unit: 'km', value: r(52 + v.distanceKm, 1), history: bars(32, t, 0.3, 0.02) },
    {
      group: 'GPS',
      name: 'GPS 속도',
      unit: 'km/h',
      value: r(gpsSpeed, 1),
      history: bars(40, t, gpsSpeed / 60, 0.25),
      warn: Math.abs(gpsSpeed - v.speedKmh) > 6,
    },
    { group: 'SCR', name: '촉매전단 온도', unit: '°C', value: r(249.5 + noise(50, t, 5), 1), history: bars(50, t, 0.62, 0.08) },
    { group: 'SCR', name: '촉매전단 NOx 농도', unit: 'ppm', value: Math.round(243 + noise(51, t, 20)), history: bars(51, t, 0.55, 0.15) },
    { group: 'SCR', name: '촉매후단 NOx 농도', unit: 'ppm', value: r(1 + Math.abs(noise(52, t, 0.8)), 1), history: bars(52, t, 0.1, 0.05) },
    { group: 'SCR', name: '도징모듈 듀티', unit: '%', value: r(0.72 + noise(53, t, 0.1)), history: bars(53, t, 0.08, 0.03) },
  ]
}
