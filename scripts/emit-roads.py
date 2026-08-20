# -*- coding: utf-8 -*-
"""
간선도로 레이어 — «버스가 실제로 타는 도로» 중 **여러 노선이 함께 쓰는 축**만.

세 번의 교정이 있었다.
1) 도로 이름으로 검색해 그렸다 → 버스가 안 지나는 측도·램프까지 딸려 나와 토막 선이 떠다녔다.
2) 노선 관계의 way만 쓰도록 고쳤다 → 한 노선 전용 도로는 노선 선의 복사본이라, 2개 이상
   노선이 공유하고 3km 이상인 도로만 남겼다.
3) 노선 형상을 **도로 그래프 경로탐색**으로 다시 그린 뒤 둘이 어긋났다 — 노선은 새 도로망 위,
   간선도로는 옛 노선 way 위라 지도에서 **갈색 선이 파란 노선 옆 빈 땅을 지났다**(사용자 지적).
   → 이제 타일이 그리는 것과 같은 원본, 즉 Overpass `highway=*` way 에서 만든다.
      다만 이름만으로 그리면 1)의 문제가 돌아오므로, **way 점의 60% 이상이 어떤 노선에서
      30m 안**인 것만 «그 노선이 타는 way»로 보고, 그런 노선이 2개 이상인 way만 남긴다.
"""
import io, json, math, re, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import hav, rdp   # noqa: E402

ROADNET = 'C:/Users/tottenham/AppData/Local/Temp/qdrive_roadnet.json'
GEO = 'C:/Users/tottenham/AppData/Local/Temp/qdrive_geo.json'
ROUTES_TS = 'C:/Qdrive 통합/qdrive-unified/src/sim/routes.ts'
DST = 'C:/Qdrive 통합/qdrive-unified/src/sim/roads.ts'

ON_ROUTE_M = 20    # way 점이 노선 선에서 이 안이면 «그 노선이 탄다»
COVER = 0.6        # way 점의 이 비율 이상이 노선 위여야 한다
MIN_ROUTES = 2
MIN_TOTAL_M = 3000
MIN_SEG_M = 40
EPS = 5            # 형상 단순화(m) — 도로는 노선보다 곱게 둔다(타일 위에 정확히 얹혀야 한다)


def d2seg(p, a, b):
    ax, ay = a[1] * 88000, a[0] * 111000
    bx, by = b[1] * 88000, b[0] * 111000
    px, py = p[1] * 88000, p[0] * 111000
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def load_routes():
    """
    «누가 이 도로를 타는가»의 근거 — **지도에 실제로 그리는 8개 노선**.

    한때 OSM 노선 관계 16개로 넓혀 봤다. 그러면 달구벌대로 같은 큰 축이 살아나지만,
    테크노폴리스로(22km, 달성 방면)처럼 **우리 지도에 버스가 한 대도 안 다니는 도로**가 딸려 온다.
    「실제 버스가 다니는 도로만 표현되면 된다」는 원칙에 어긋난다.
    → 갈색 선 위에는 반드시 색깔 노선이 2개 이상 지나간다. 보는 사람이 눈으로 확인할 수 있다.
    """
    s = io.open(ROUTES_TS, encoding='utf-8').read()
    out = {}
    for b in re.split(r'\n  \{\n    id: ', s)[1:]:
        nm = re.search(r"name: '([^']+)'", b).group(1)
        seg = b.split('points: [')[1].split('    ],')[0]
        out[nm] = [[(float(x), float(y)) for x, y in re.findall(r'\[(\d+\.\d+),\s*(\d+\.\d+)\]', seg)]]
    return out


def main():
    routes = load_routes()
    # 노선별 격자 색인 — way 점마다 8개 노선을 전부 훑으면 느리다
    idx = {}
    for nm, ways in routes.items():
        g = {}
        for pts in ways:
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                for p in (a, b):
                    g.setdefault((int(p[0] / 0.004), int(p[1] / 0.004)), []).append((a, b))
        idx[nm] = g

    def rides(nm, p):
        g = idx[nm]
        cx, cy = int(p[0] / 0.004), int(p[1] / 0.004)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for a, b in g.get((cx + dx, cy + dy), ()):
                    if d2seg(p, a, b) <= ON_ROUTE_M:
                        return True
        return False

    net = json.load(io.open(ROADNET, encoding='utf-8'))['elements']
    named = [w for w in net if w.get('name')]
    print(f'이름 있는 도로 way {len(named)}개 검사')

    by_name = {}
    for w in named:
        pts = [(p['lat'], p['lon']) for p in w['geometry']]
        if len(pts) < 2:
            continue
        L = sum(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        if L < MIN_SEG_M:
            continue
        users = [nm for nm in routes if sum(1 for p in pts if rides(nm, p)) / len(pts) >= COVER]
        if len(users) >= MIN_ROUTES:
            e = by_name.setdefault(w['name'], {'len': 0.0, 'segs': [], 'routes': set()})
            e['len'] += L
            e['segs'].append(rdp(pts, EPS))
            e['routes'].update(users)

    rows = sorted(
        ((v['len'], k, v['segs'], len(v['routes'])) for k, v in by_name.items() if v['len'] >= MIN_TOTAL_M),
        reverse=True,
    )

    OUT = ["""import type { LatLng } from './geo'

/**
 * 버스가 실제로 타는 간선도로 — **실제 도로망 way** 중 **2개 이상 노선이 공유**하는 축.
 *
 * 원본은 타일이 그리는 것과 같은 OSM `highway=*` way 다. 한때 «노선 관계의 way» 로 만들었는데,
 * 노선 형상을 도로 그래프 경로탐색으로 다시 그린 뒤로 둘이 어긋나 **갈색 선이 파란 노선 옆
 * 빈 땅을 지났다**. 도로는 도로 데이터로 그려야 타일 위에 정확히 얹힌다.
 *
 * 다만 이름만으로 그리면 버스가 안 다니는 측도·램프까지 딸려 나오고, 한 노선 전용 도로는
 * 노선 선의 복사본이 된다. 그래서 **way 점의 60% 이상이 노선에서 30m 안**인 것만 남기고,
 * 그런 노선이 **2개 이상**인 way만 «간선»으로 본다 — 그것이 도시의 축이고, 지도에서 새 정보다.
 *
 * 이어 붙이지 않고 조각 그대로 그린다: 도로는 갈래가 많아 하나로 엮으면 없는 연결이 생긴다.
 * 재수집: scripts/emit-roads.py · 출처: © OpenStreetMap contributors (ODbL)
 */
export interface MajorRoad {
  name: string
  /** 2개 이상 노선이 함께 타는 구간의 총 연장(km) */
  km: number
  /** 이 도로를 함께 타는 노선 수 — 2 이상이라야 «간선»이다 */
  routes: number
  segments: LatLng[][]
}

export const MAJOR_ROADS: MajorRoad[] = ["""]

    for total, nm, segs, n in rows:
        OUT.append(f"  {{\n    name: '{nm}',\n    km: {round(total / 1000, 1)},\n    routes: {n},\n    segments: [")
        for s in segs:
            OUT.append('      [' + ', '.join(f'[{round(p[0], 5)}, {round(p[1], 5)}]' for p in s) + '],')
        OUT.append('    ],\n  },')
        print(f'{nm:14s} {total/1000:5.1f}km · 조각 {len(segs):3d} · 노선 {n}개 공유')

    OUT.append(']')
    io.open(DST, 'w', encoding='utf-8', newline='').write('\n'.join(OUT) + '\n')
    print(f'\n도로 {len(rows)}개 · 조각 {sum(len(s) for _, _, s, _ in rows)} · 점 {sum(len(x) for _, _, s, _ in rows for x in s)}')


if __name__ == '__main__':
    main()
