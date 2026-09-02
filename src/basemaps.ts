import type { Theme } from './theme'

/*
  배경지도 타일 제공자 — 왜 한 곳에 모아 두는가.

  2026년 CARTO가 basemaps.cartocdn.com 타일에 API 키를 요구하기 시작했다.
  고약한 건 «차단»이 아니라 «오염»이라는 점이다 — HTTP 200에 지도 이미지도 정상인데
  그 위에 "API KEY REQUIRED" 워터마크가 합성돼 온다. 네트워크 오류가 아니라서
  Leaflet의 tileerror도 안 뜨고, 콘솔도 조용하고, 빌드도 통과한다.
  화면을 눈으로 보기 전에는 아무도 모른다.

  그래서 세 가지를 한다.
  (1) 타일 URL을 컴포넌트에서 뜯어내 이 파일 한 곳에 둔다 — 제공자가 또 정책을 바꾸면
      MapView를 헤집지 않고 여기 배열 순서만 고친다.
  (2) 폴백 체인을 둔다. 다만 «타일이 안 오는» 실패만 잡는다(404·타임아웃).
  (3) 카나리아(MapView의 fetch)를 둔다 — Stadia는 등록 안 된 도메인에 401과 함께
      «401 Error»가 그려진 정상 PNG를 주는데, 이건 <img>가 load로 처리해 (2)로는 안 잡힌다.

  그래도 **200으로 오는 오염(위 CARTO 워터마크)은 기계가 못 잡는다.**
  제공자를 바꿨으면 반드시 화면을 눈으로 볼 것.

  체인 순서의 뜻 — 1순위는 «가장 예쁜 것», 2순위는 «가장 안 죽는 것»:
  Stadia는 도메인 화이트리스트로 인증하는데 우리 도메인은 아직 우리가 등록한 게 아니다.
  그래서 2순위는 어느 도메인에서도 200을 주는 VWorld로 두었다 — 1순위가 막혀도
  지도가 «탁해지지» 않고 한글 지도로 자연스럽게 내려앉는다. OSM은 최후의 바닥이다.
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
 * 카나리아로 찔러 볼 타일 한 장 — 대구 중심(z13).
 *
 * 아무 좌표나 쓰면 안 된다. 그 제공자가 원래 갖고 있지 않은 타일을 골라 404를 받으면
 * 멀쩡한 제공자를 «죽었다»고 판정해 버린다. 이 좌표는 체인의 세 제공자 모두에서
 * 200을 확인한 값이고, 지도가 실제로 쓰는 화면 범위 안이다.
 * 제공자를 추가할 때는 이 타일이 그쪽에서도 200인지 먼저 확인할 것.
 */
export const CANARY_TILE = { z: 13, x: 7022, y: 3220 }

/**
 * Stadia Alidade Smooth — CARTO Positron/Dark Matter의 직계 대체.
 * 같은 OpenMapTiles 스키마라 색·굵기·라벨 밀도가 거의 동일하고, 대구 지명이 한글로 나온다.
 * @2x 레티나 512px, z20까지 확인.
 */
const STADIA_ATTR =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  OSM

/**
 * VWorld (국토교통부 공간정보 오픈플랫폼) — 2순위.
 *
 * 여기 있는 이유가 중요하다. Stadia는 **도메인 화이트리스트**로 인증한다 —
 * 지금 라이브가 되는 것은 `pages.dev`가 통째로 허용 목록에 있어서지 우리가 등록해서가 아니다.
 * 그게 바뀌면 Stadia는 401을 준다. 그때 곧바로 «회색 보정 OSM»으로 떨어지면 지도가 탁해진다.
 *
 * VWorld는 **어느 도메인에서도 200**을 준다(미등록 임의 도메인으로 실측 확인).
 * 게다가 도로명·역명이 로마자 병기 없이 **순한글**이라, 이 데모에는 오히려 더 맞다.
 * 라이트(white)/다크(midnight) 쌍이 모두 있고 z18까지 커버한다(z19는 404).
 *
 * 주의 두 가지.
 * (1) @2x 레티나가 없다 — detectRetina를 켜면 전부 404가 된다.
 * (2) 이 CDN 경로는 공식 문서에 없는 내부 경로다. VWorld 자체 지도 로더가 쓰는 주소라
 *     막힐 가능성이 0은 아니다. 정본으로 승격하려면 vworld.kr에서 무료 인증키를 받아
 *     공식 WMTS로 가야 하는데, **그쪽은 축 순서가 {z}/{y}/{x}로 뒤집힌다**:
 *     https://api.vworld.kr/req/wmts/1.0.0/{KEY}/white/{z}/{y}/{x}.png
 */
const VWORLD_ATTR =
  '&copy; <a href="https://www.vworld.kr/">국토교통부 공간정보 오픈플랫폼(V-World)</a>'
/* white는 지하철 노선을 고채도로, midnight은 전체를 짙은 남색으로 그린다 — 노선 폴리라인과 색이 경합한다 */
const VWORLD_LIGHT_FILTER = 'saturate(0.25) brightness(1.03)'
const VWORLD_DARK_FILTER = 'saturate(0.35) brightness(0.88) contrast(1.05)'

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
      id: 'vworld-white',
      label: 'VWorld white (국토부)',
      url: 'https://xdworld.vworld.kr/2d/white/service/{z}/{x}/{y}.png',
      attribution: VWORLD_ATTR,
      maxZoom: 20,
      maxNativeZoom: 18,
      filter: VWORLD_LIGHT_FILTER,
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
      id: 'vworld-midnight',
      label: 'VWorld midnight (국토부)',
      url: 'https://xdworld.vworld.kr/2d/midnight/service/{z}/{x}/{y}.png',
      attribution: VWORLD_ATTR,
      maxZoom: 20,
      maxNativeZoom: 18,
      filter: VWORLD_DARK_FILTER,
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
