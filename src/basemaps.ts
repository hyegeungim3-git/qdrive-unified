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

  체인 순서의 뜻 — **글자가 가장 또렷한 것을 1순위로 둔다**:
  Stadia는 @2x 주소가 있어 고밀도 화면에서 «같은 지도를 2배 픽셀로» 그린다.
  VWorld에는 @2x가 없어 «한 단계 깊은 지도를 절반으로 축소»하는 우회를 쓰는데,
  선명해지는 대신 **라벨이 절반 크기로 작아진다**. 시연에서 그게 읽기 어려웠다.
  그래서 Stadia를 1순위로, VWorld를 2순위로 둔다. OSM은 최후의 바닥이다.

  대신 Stadia는 «도메인 화이트리스트»로 인증하는데 우리 도메인은 우리가 등록한 게 아니라
  pages.dev가 통째로 허용 목록에 있어서 되는 것뿐이다 — 그게 바뀌면 401이 온다.
  그 401은 그림이 정상으로 오는 실패라 카나리아(MapView의 fetch)가 잡아
  **어느 도메인에서도 200을 주는 VWorld**로 내려 준다. 지도가 사라지지는 않는다.
  근본 해법은 stadiamaps.com 무료 도메인 등록이다(키가 아니라 화이트리스트라
  저장소에 커밋할 비밀값이 생기지 않는다). 등록 전까지는 이 폴백이 안전망이다.
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
  /**
   * 고밀도 화면(dpr>1)에서 선명하게 그리는 방법. 제공자마다 달라서 갈라 둔다.
   *
   * 'url'  — @2x 주소가 있는 제공자. URL의 {r}을 '@2x'로 바꾸면 512px 타일이 온다.
   * 'zoom' — @2x가 없는 제공자. **한 단계 깊은 줌의 타일을 절반 크기로** 그려 해상도를 2배로 만든다
   *          (tileSize 128 · zoomOffset +1). 표준 256px 타일만으로 같은 효과를 낸다.
   *
   * 왜 Leaflet의 detectRetina를 안 쓰는가 — 그 옵션은 `L.Browser.retina`에 기대는데,
   * 그 값이 **Leaflet 모듈이 로드되는 순간의 devicePixelRatio로 고정**된다.
   * 창이 나중에 고밀도로 바뀌거나 로드 시점에 dpr이 1이면 영영 false로 굳어
   * detectRetina도 {r} 치환도 통째로 무시된다(이 환경에서 실제로 그랬다 — dpr 1.5인데 false).
   * 그래서 dpr 판단을 우리가 직접 하고 옵션을 명시적으로 넘긴다.
   */
  hiDpi?: 'url' | 'zoom'
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
 * Stadia Alidade Smooth — **1순위**. CARTO Positron/Dark Matter의 직계 대체다.
 * 같은 OpenMapTiles 스키마라 색·굵기·라벨 밀도가 거의 동일하다.
 *
 * 여기 있는 이유는 **@2x 주소**다. 고밀도 화면에서 «같은 지도를 2배 픽셀로» 받으므로
 * 라벨 크기는 그대로 두고 선명해진다. VWorld의 우회 방식('zoom')은 선명해지는 대신
 * 라벨이 절반 크기가 되는데, 시연에서 그게 읽기 어려웠다.
 *
 * 라벨 어투는 아쉬운 쪽이다 — 도로명이 로마자 주·한글 병기(DONGSEONG-RO 2-GIL /
 * 작게 동성로 2길)이고 시·구·동만 한글이 또렷하다. VWorld는 도로명·역명까지 순한글이다.
 * 순한글이 더 중요해지면 아래 배열에서 두 항목 순서만 맞바꾸면 된다.
 */
const STADIA_ATTR =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  OSM

/**
 * VWorld (국토교통부 공간정보 오픈플랫폼) — **2순위이자 실질적인 안전망**.
 *
 * **어느 도메인에서도 200**을 준다(미등록 임의 도메인으로 실측 확인). 등록도 키도 필요 없다 —
 * Stadia가 도메인 인증으로 막히는 순간 여기로 내려오면 지도가 «탁해지지» 않는다.
 * 도로명·역명이 로마자 병기 없이 **순한글**인 것도 이 데모에는 오히려 어울린다.
 * 라이트(white)/다크(midnight) 쌍이 모두 있고 z18까지 커버한다(z19는 404).
 *
 * 주의 두 가지.
 * (1) **@2x 레티나 URL이 없다.** 그렇다고 저해상도로 둘 필요는 없다 — hiDpi: 'zoom'으로
 *     한 단계 깊은 타일을 절반 크기로 그려 2배 해상도를 낸다(위 hiDpi 설명 참조).
 *     이걸 안 하면 dpr 1.5 화면에서 256px 타일이 384px로 늘어나 **글자가 흐려진다**(실측).
 * (2) 이 CDN 경로는 공식 문서에 없는 내부 경로다. VWorld 자체 지도 로더가 쓰는 주소라
 *     막힐 가능성이 0은 아니다. 정본으로 승격하려면 vworld.kr에서 무료 인증키를 받아
 *     공식 WMTS로 가야 하는데, **그쪽은 축 순서가 {z}/{y}/{x}로 뒤집힌다**:
 *     https://api.vworld.kr/req/wmts/1.0.0/{KEY}/white/{z}/{y}/{x}.png
 */
const VWORLD_ATTR =
  '&copy; <a href="https://www.vworld.kr/">국토교통부 공간정보 오픈플랫폼(V-World)</a>'
/*
  white는 지하철 노선을 고채도로, midnight은 전체를 짙은 남색으로 그린다 — 노선 폴리라인과 색이 경합한다.
  다만 채도만 빼고 밝기까지 건드리면 지명 글자가 배경 쪽으로 눌려 «흐릿하다»는 인상이 된다
  (라이트에서 brightness를 올리면 회색 글자가 날아가고, 다크에서 내리면 글자가 가라앉는다).
  밝기는 그대로 두고 대비를 조금 올려 글자 획을 살린다.
*/
const VWORLD_LIGHT_FILTER = 'saturate(0.3) contrast(1.08)'
const VWORLD_DARK_FILTER = 'saturate(0.4) contrast(1.12)'

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
      hiDpi: 'url',
    },
    {
      id: 'vworld-white',
      label: 'VWorld white (국토부)',
      url: 'https://xdworld.vworld.kr/2d/white/service/{z}/{x}/{y}.png',
      attribution: VWORLD_ATTR,
      maxZoom: 20,
      /* 제공자 상한은 18. 'zoom' 방식은 요청 줌을 +1 하므로 여기서 하나 빼 둔다(안 그러면 z19를 불러 404) */
      maxNativeZoom: 18,
      hiDpi: 'zoom',
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
      hiDpi: 'url',
    },
    {
      id: 'vworld-midnight',
      label: 'VWorld midnight (국토부)',
      url: 'https://xdworld.vworld.kr/2d/midnight/service/{z}/{x}/{y}.png',
      attribution: VWORLD_ATTR,
      maxZoom: 20,
      /* 제공자 상한은 18. 'zoom' 방식은 요청 줌을 +1 하므로 여기서 하나 빼 둔다(안 그러면 z19를 불러 404) */
      maxNativeZoom: 18,
      hiDpi: 'zoom',
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
