# -*- coding: utf-8 -*-
"""
«달구벌대로를 가로지르는 노선»을 실제 교차 판정으로 고른다.
이름·방향 감으로 고르면 틀린다 — 도로 형상과 노선 형상의 선분 교차를 직접 계산한다.
"""
import io, json, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import stitch, rdp, hav, cum   # noqa: E402

ROAD = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_road_dgb.json'
GEO = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_geo.json'
GEO3 = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_geo3.json'


def load(p):
    return json.load(io.open(p, encoding='utf-8'))


def xy(p):
    return (p[1] * 88000.0, p[0] * 111000.0)


def seg_cross(a, b, c, d):
    (ax, ay), (bx, by), (cx, cy), (dx, dy) = xy(a), xy(b), xy(c), xy(d)

    def s(px, py, qx, qy, rx, ry):
        v = (qx - px) * (ry - py) - (qy - py) * (rx - px)
        return 0 if abs(v) < 1e-9 else (1 if v > 0 else -1)

    d1, d2 = s(ax, ay, bx, by, cx, cy), s(ax, ay, bx, by, dx, dy)
    d3, d4 = s(cx, cy, dx, dy, ax, ay), s(cx, cy, dx, dy, bx, by)
    return d1 != d2 and d3 != d4


# 달구벌대로 — way 조각을 그대로 선분 목록으로 쓴다(이어 붙일 필요 없다)
road_segs = []
for w in load(ROAD)['elements']:
    g = w.get('geometry') or []
    for i in range(len(g) - 1):
        road_segs.append(((g[i]['lat'], g[i]['lon']), (g[i + 1]['lat'], g[i + 1]['lon'])))
print('달구벌대로 선분', len(road_segs))

rels = load(GEO)['elements'] + [r for r in load(GEO3)['elements']
                                if len([m for m in r['members'] if m.get('geometry')]) >= 20]

seen = set()
rows = []
for rel in rels:
    ref = rel['tags'].get('ref')
    if ref in seen:
        continue
    ms = [m for m in rel['members'] if m['type'] == 'way' and m.get('geometry')]
    if len(ms) < 20:
        continue
    seen.add(ref)
    line = rdp(stitch(ms), 12)
    if len(line) > 4 and hav(line[0], line[-1]) < 400:
        far = max(range(len(line)), key=lambda i: hav(line[0], line[i]))
        if far > 2:
            line = line[: far + 1]
    _, total = cum(line)

    hits = 0
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        if not (35.82 <= a[0] <= 35.89 and 128.39 <= a[1] <= 128.73):
            continue
        for c, d in road_segs:
            if seg_cross(a, b, c, d):
                hits += 1
                break
    rows.append((ref, total / 1000, hits, len(line)))

rows.sort(key=lambda r: -r[2])
print()
print(f"{'노선':8s} {'길이':>7s} {'가로지름':>7s}")
for ref, km, hits, n in rows:
    print(f'{ref:8s} {km:6.1f}km {hits:5d}회  {n}점')
