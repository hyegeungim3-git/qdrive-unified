import type { Theme } from './theme'

/*
  배경지도 타일 제공자 — 왜 한 곳에 모아 두는가.

  2026년 CARTO가 basemaps.cartocdn.com 타일에 API 키를 요구하기 시작했다.
  고약한 건 «차단»이 아니라 «오염»이라는 점이다 — HTTP 200에 지도 이미지도 정상인데
  그 위에 "API KEY REQUIRED" 워터마크가 합성돼 온다. 네트워크 오류가 아니라서
  Leaflet의 tileerror도 안 뜨고, 콘솔도 조용하고, 빌드도 통과한다.
  화면을 눈으로 보기 전에는 아무도 모른다.

  그래서 두 가지를 한다.
  (1) 타일 URL을 컴포넌트에서 뜯어내 이 파일 한 곳에 둔다 — 제공자가 또 정책을 바꾸면
      MapView를 헤집지 않고 여기 배열 순서만 고친다.
  (2) 폴백 체인을 둔다 — 다만 폴백은 «404·403·타임아웃»만 잡는다.
      위 CARTO 사태 같은 200-워터마크는 기계가 못 잡는다. 사람 눈이 최종 검증이다.
*/

export type TileSource = {
  id: string
  /** 사람이 읽는 이름 — 폴백이 발동했을 때 콘솔에 남긴다 */
  label: string
  url: string
  attribution: string
  /** 지도가 확대를 허용하는 한계 */
  maxZoom: number
  /** 제공자가 실제로 타일을 갖고 있는 한계. 이보다 크게 확대하면 마지막 타일을 늘려 보여준다 */
  maxNativeZoom?: number
  /** @2x 타일이 있는 제공자만 켠다. 없는데 켜면 404가 쏟아진다 */
  detectRetina?: boolean
  /**
   * 저채도 스타일이 아닌 원본 타일을 노선·버스가 묻히지 않게 눌러 주는 CSS 필터.
   * 최후 폴백(OSM 표준)에만 쓴다 — 색이 강해서 그대로 깔면 오버레이가 안 읽힌다.
   */
  filter?: string
}

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자'

/**
 * Stadia Alidade Smooth — CARTO Positron/Dark Matter의 직계 대체.
 * 같은 OpenMapTiles 스키마라 색·굵기·라벨 밀도가 거의 동일하고, 대구 지명이 한글로 나온다.
 * @2x 레티나 512px, z20까지 확인.
 */
const STADIA_ATTR =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  OSM

/**
 * Esri Canvas — 다크는 한국 커버리지가 온전하나, 라이트(World_Light_Gray_Base)는
 * 대구 z15에서 "Map data not yet available"가 뜬다. 그래서 다크 체인에만 넣는다.
 */
const ESRI_ATTR = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'

/**
 * 최후 폴백 — OSM 표준 타일. 키가 필요 없고 죽는 일이 없다.
 * 대신 색이 강해 CSS 필터로 눌러서 Positron/Dark Matter 흉내를 낸다.
 * OSMF 타일 정책상 «가벼운 사용»만 허용되므로 1·2순위가 모두 죽었을 때만 도달한다.
 */
const OSM_LIGHT_FILTER = 'grayscale(0.9) brightness(1.06) contrast(0.92)'
const OSM_DARK_FILTER = 'invert(1) hue-rotate(180deg) grayscale(0.75) brightness(0.85) contrast(0.95)'

/** 앞에서부터 시도한다. 앞이 죽으면 다음으로 내려간다. */
export const TILE_CHAIN: Record<Theme, TileSource[]> = {
  light: [
    {
      id: 'stadia-smooth',
      label: 'Stadia Alidade Smooth',
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
      attribution: STADIA_ATTR,
      maxZoom: 20,
      maxNativeZoom: 20,
      detectRetina: true,
    },
    {
      id: 'osm-light',
      label: 'OpenStreetMap (회색 보정)',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM,
      maxZoom: 19,
      maxNativeZoom: 19,
      filter: OSM_LIGHT_FILTER,
    },
  ],
  dark: [
    {
      id: 'stadia-smooth-dark',
      label: 'Stadia Alidade Smooth Dark',
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
      attribution: STADIA_ATTR,
      maxZoom: 20,
      maxNativeZoom: 20,
      detectRetina: true,
    },
    {
      id: 'esri-dark',
      label: 'Esri Dark Gray Canvas',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: ESRI_ATTR,
      maxZoom: 20,
      maxNativeZoom: 16,
    },
    {
      id: 'osm-dark',
      label: 'OpenStreetMap (반전 보정)',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM,
      maxZoom: 19,
      maxNativeZoom: 19,
      filter: OSM_DARK_FILTER,
    },
  ],
}
