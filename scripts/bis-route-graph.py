# -*- coding: utf-8 -*-
"""
BIS 정류장 순서 + 노선 도로망 경로탐색 → 도로를 따라가는 전 구간 폴리라인.

앞선 방식(scripts/bis-fill-route.py)은 «이미 이어 붙인 하나의 OSM 선» 위에 정류장을 투영했다.
그 선은 관계 way의 일부만 담은 최장 체인이라, 거기서 벗어난 구간은 전부 직선이 됐다 —
순환3은 74개 중 32개만 선 위여서 나머지가 도로를 가로지르는 직선으로 그려졌다(사용자 지적).

여기서는 **관계의 모든 way로 도로 그래프를 만들고**, 이웃한 두 정류장 사이를 그 그래프에서
최단경로로 잇는다. 경로가 직선거리의 3배를 넘으면(엉뚱하게 돌아가는 것) 직선으로 둔다.

사용: python scripts/bis-route-graph.py <노선명> <BIS 경유정류소 응답 json> [단순화 오차 m]
필요한 로컬 캐시(수집 1회, 커밋하지 않음 — 키·대용량):
  qdrive_geo.json      OSM 노선 관계(type=route,route=bus) out geom
  qdrive_roadnet.json  대구 도로망(highway=motorway~tertiary) out geom
결과는 bis_route_<노선>.json → scripts/emit-routes.py 가 src/sim/routes.ts 로 굽는다.
"""
import heapq, io, json, math, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import hav, cum, rdp   # noqa: E402

SCRATCH = r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad'
ROADNET = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_roadnet.json'
GEO = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_geo.json'

ROUTE = sys.argv[1]
BIS = sys.argv[2]
OUT = SCRATCH + '\\bis_route_' + ROUTE + '.json'

DETOUR = 3.0     # 경로가 직선거리의 이 배수를 넘으면 안 쓴다
FALLBACK_DETOUR = 1.6   # 합집합 도로망은 «남의 길»이 섞이므로 더 좁게 본다
SNAP_M = 220     # 정류장에서 이 거리 안의 도로 노드에만 붙인다
RDP_EPS = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0


def key(p):
    return (round(p[0], 5), round(p[1], 5))


def build_ways(ways):
    """way 목록(도로망)을 무향 그래프로"""
    return build_graph([{'members': [{'type': 'way', 'geometry': w['geometry']} for w in ways]}])


def build_graph(rels):
    """관계들의 모든 way 를 무향 그래프로 — 노드는 좌표, 간선 가중치는 실거리"""
    adj = {}
    pos = {}

    def add(a, b):
        ka, kb = key(a), key(b)
        pos[ka], pos[kb] = a, b
        w = hav(a, b)
        adj.setdefault(ka, []).append((kb, w))
        adj.setdefault(kb, []).append((ka, w))

    for rel in rels:
        for m in rel['members']:
            if m['type'] != 'way' or not m.get('geometry'):
                continue
            g = [(x['lat'], x['lon']) for x in m['geometry']]
            for i in range(len(g) - 1):
                add(g[i], g[i + 1])
    return adj, pos


def grid_index(pos):
    """0.003도(약 300m) 격자 — 도로망은 5만 점이라 정류장마다 전수 비교하면 느리다"""
    g = {}
    for k, q in pos.items():
        g.setdefault((int(q[0] / 0.003), int(q[1] / 0.003)), []).append(k)
    return g


def nearest(pos, p, limit=SNAP_M, grid=None):
    best, bd = None, limit
    if grid is not None:
        cx, cy = int(p[0] / 0.003), int(p[1] / 0.003)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for k in grid.get((cx + dx, cy + dy), ()):
                    d = hav(p, pos[k])
                    if d < bd:
                        best, bd = k, d
        return best
    for k, q in pos.items():
        d = hav(p, q)
        if d < bd:
            best, bd = k, d
    return best


def shortest(adj, pos, s, t, cap):
    """다익스트라 — cap(m) 을 넘으면 포기한다(먼 길로 돌아가는 경로는 쓰지 않는다)"""
    if s == t:
        return [pos[s]]
    dist = {s: 0.0}
    prev = {}
    pq = [(0.0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, math.inf):
            continue
        if u == t:
            break
        if d > cap:
            return None
        for v, w in adj.get(u, ()):
            nd = d + w
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if t not in dist or dist[t] > cap:
        return None
    path, cur = [], t
    while cur != s:
        path.append(pos[cur])
        cur = prev[cur]
    path.append(pos[s])
    path.reverse()
    return path


def main():
    raw = json.load(io.open(BIS, encoding='utf-8'))
    items = raw['response']['body']['items']['item']
    up = sorted([i for i in items if 1000 <= int(i['nodeord']) < 2000], key=lambda x: int(x['nodeord']))
    if not up:
        up = sorted(items, key=lambda x: int(x['nodeord']))
    stops = [{'name': i['nodenm'], 'lat': float(i['gpslati']), 'lng': float(i['gpslong'])} for i in up]

    geo = json.load(io.open(GEO, encoding='utf-8'))
    # 같은 노선번호의 관계가 둘 이상일 수 있다(급행2는 way 3개짜리와 129개짜리가 함께 있다).
    # 가장 많은 way 를 가진 것을 쓴다 — 작은 쪽을 집으면 도로 그래프가 비어 경로가 하나도 안 나온다.
    cands = [r for r in geo['elements'] if r['tags'].get('ref') == ROUTE]
    rel = max(cands, key=lambda r: len([m for m in r['members'] if m.get('geometry')]), default=None)
    if not rel:
        print(f'{ROUTE}: OSM 관계 없음 — 정류장 직선으로만 만든다')
        adj, pos = {}, {}
    else:
        adj, pos = build_graph([rel])

    # 자기 관계로 못 이은 구간을 위한 예비 도로망 — 대구 노선 관계 16개를 전부 합친 것.
    # 노선들은 도심에서 크게 겹치므로 합치면 훨씬 촘촘하다. 다만 «내 노선이 아닌 길»이 섞이므로
    # 우회 허용치를 더 좁게(FALLBACK_DETOUR) 두고, 자기 관계가 실패한 구간에만 쓴다.
    # 1순위 예비: 대구 실제 도로망(Overpass highway=motorway~tertiary).
    # 2순위 예비: 노선 관계 합집합 — 도로망 필터에 안 걸리는 차고지·마을길이 여기 있다.
    try:
        adj2, pos2 = build_ways(json.load(io.open(ROADNET, encoding='utf-8'))['elements'])
    except Exception:
        adj2, pos2 = {}, {}
    adj3, pos3 = build_graph(geo['elements'])
    g2, g3 = grid_index(pos2), grid_index(pos3)

    snapped = [nearest(pos, (s['lat'], s['lng'])) if pos else None for s in stops]
    snapped2 = [nearest(pos2, (s['lat'], s['lng']), grid=g2) if pos2 else None for s in stops]
    snapped3 = [nearest(pos3, (s['lat'], s['lng']), grid=g3) for s in stops]

    pts = []
    routed = fallback = 0
    for i, st in enumerate(stops):
        p = (st['lat'], st['lng'])
        if not pts or hav(pts[-1], p) > 1:
            pts.append(p)
        if i + 1 >= len(stops):
            break
        nxt = (stops[i + 1]['lat'], stops[i + 1]['lng'])
        straight = hav(p, nxt)
        a, b = snapped[i], snapped[i + 1]
        path = shortest(adj, pos, a, b, max(600, straight * DETOUR)) if (a and b and a != b) else None
        if not path or len(path) <= 2:
            cap = max(500, straight * FALLBACK_DETOUR)
            for aa, pp, ss in ((adj2, pos2, snapped2), (adj3, pos3, snapped3)):
                c, d = ss[i], ss[i + 1]
                alt = shortest(aa, pp, c, d, cap) if (c and d and c != d) else None
                if alt and len(alt) > 2:
                    path, fallback = alt, fallback + 1
                    break
        if path and len(path) > 2:
            routed += 1
            for q in path[1:-1]:
                if hav(pts[-1], q) > 1:
                    pts.append(q)

    # 형상 단순화 — 도로를 따라 이으면 점이 급격히 는다(8개 노선 4,660점).
    # 그대로 두면 번들러가 네이티브 스택 오버런(0xC0000409)으로 죽고, Leaflet 렌더도 무겁다.
    # 6m 허용 오차면 도시 축척에서 도로 곡선이 눈에 띄게 뭉개지지 않는다.
    pts = rdp(pts, RDP_EPS)

    _, total = cum(pts)
    cums2, _ = cum(pts)

    from build_routes import project, disp_name
    out = {
        'ref': ROUTE,
        'lengthM': round(total),
        'points': [[round(q[0], 5), round(q[1], 5)] for q in pts],
        'stops': [],
    }
    for st in stops:
        _, at = project((st['lat'], st['lng']), pts, cums2)
        out['stops'].append({'name': disp_name(st['name']), 'at': round(at / max(1, total), 4)})

    io.open(OUT, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False))
    print(f'{ROUTE}: 정류장 {len(stops)} · 선 {len(pts)}점 · {total/1000:.1f}km · 도로 경로로 이은 구간 {routed}/{len(stops)-1} (합집합 보완 {fallback})')


if __name__ == '__main__':
    main()
