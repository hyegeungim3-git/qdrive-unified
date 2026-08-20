/**
 * 지도 색을 타일 밝기에 맞춰 보정한다.
 *
 * 노선 색은 어두운 타일 기준으로 골라 둔 밝은 색이라, 라이트 모드의 흰 타일 위에서는
 * 대비가 1.2~2.0:1까지 떨어져 «선이 있는데 안 보이는» 상태가 된다(측정값).
 * 색을 두 벌 손으로 관리하면 노선을 추가할 때마다 잊는다 — 그래서 **계산으로 만든다**:
 * 밝은 타일 위에서 대비 3:1(WCAG 1.4.11 비텍스트 최소)을 넘길 때까지 색을 어둡게 민다.
 *
 * 색상(hue)은 유지하고 명도만 낮추므로 «급행1은 빨강»이라는 식별은 그대로 남는다.
 */

/** Carto basemap 대표 배경색 — light_all / dark_all 타일의 평균 근사 */
const TILE_LIGHT: [number, number, number] = [242, 239, 233]
const TILE_DARK: [number, number, number] = [38, 40, 43]

/** 그래픽 요소 최소 대비 (WCAG 2.1 SC 1.4.11) */
const MIN_RATIO = 3

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (c: [number, number, number]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

function luminance(c: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const cache = new Map<string, string>()

/**
 * 밝은 타일 위에서도 보이는 색으로. 이미 충분히 어두우면 원래 색을 그대로 돌려준다.
 * @param alpha 실제로 그릴 때 쓰는 불투명도 — 반투명하게 그리면 대비가 더 떨어지므로 함께 계산한다
 */
export function onLightTile(hex: string, alpha = 1): string {
  const key = `${hex}@${alpha}`
  const hit = cache.get(key)
  if (hit) return hit

  const base = hexToRgb(hex)
  let out = hex
  for (let k = 100; k >= 5; k -= 5) {
    const c: [number, number, number] = [base[0] * (k / 100), base[1] * (k / 100), base[2] * (k / 100)]
    // 반투명 합성까지 반영해야 «화면에 실제로 찍히는 색»의 대비가 나온다
    const blended: [number, number, number] = [
      alpha * c[0] + (1 - alpha) * TILE_LIGHT[0],
      alpha * c[1] + (1 - alpha) * TILE_LIGHT[1],
      alpha * c[2] + (1 - alpha) * TILE_LIGHT[2],
    ]
    if (ratio(blended, TILE_LIGHT) >= MIN_RATIO) {
      out = toHex(c)
      break
    }
    out = toHex(c)
  }
  cache.set(key, out)
  return out
}

/**
 * 어두운 타일 위에서도 3:1을 넘기게 — 밝히는 방향으로 민다.
 * 다크라고 다 보이는 것은 아니다: 측정에서 급행1(빨강) 2.75:1, 순환2(파랑) 2.88:1로 미달이었다.
 */
export function onDarkTile(hex: string, alpha = 1): string {
  const key = `d:${hex}@${alpha}`
  const hit = cache.get(key)
  if (hit) return hit

  const base = hexToRgb(hex)
  let out = hex
  for (let k = 0; k <= 100; k += 5) {
    // 흰색 쪽으로 k% 섞는다 — 색상은 남기고 명도만 올린다
    const c: [number, number, number] = [
      base[0] + (255 - base[0]) * (k / 100),
      base[1] + (255 - base[1]) * (k / 100),
      base[2] + (255 - base[2]) * (k / 100),
    ]
    const blended: [number, number, number] = [
      alpha * c[0] + (1 - alpha) * TILE_DARK[0],
      alpha * c[1] + (1 - alpha) * TILE_DARK[1],
      alpha * c[2] + (1 - alpha) * TILE_DARK[2],
    ]
    out = toHex(c)
    if (ratio(blended, TILE_DARK) >= MIN_RATIO) break
  }
  cache.set(key, out)
  return out
}

/** 테마에 맞는 색 — 어느 쪽이든 타일 대비 3:1(WCAG 1.4.11)을 넘기도록 민다 */
export const mapColor = (hex: string, light: boolean, alpha = 1) =>
  light ? onLightTile(hex, alpha) : onDarkTile(hex, alpha)
