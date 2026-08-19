# -*- coding: utf-8 -*-
"""
받아 둔 Overpass 응답(로컬)만으로 노선 데이터를 만든다.
정류장은 대구 전역 목록 하나를 각 노선 선형에 투영해 순서를 매긴다 —
노선마다 따로 요청하면 요청 수가 많아 막히고, 결과도 노선별로 들쭉날쭉했다.
"""
import io, json, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import stitch, rdp, cum, project, disp_name, dedupe_key, hav   # noqa: E402

GEO = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_geo.json'
ALL = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_allstops.json'
WAYS = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_waynames.json'
OUT = r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad\daegu_routes.json'

ROLE = {'급행1': 'forward'}
EPS = 12      # 형상 단순화 허용 오차(m) — 12m면 도로 곡선이 눈에 띄게 뭉개지지 않는다
TOL = 120     # 정류장 노드는 인도·건물 쪽에 찍혀 도로 중심선에서 멀다. 120m까지 넓혀 실제 정차지를 더 건진다


def load(p):
    return json.load(io.open(p, encoding='utf-8'))


def main_roads(ms, names):
    """
    이 노선이 실제로 타는 도로 — way 이름을 **길이로 가중**해 상위 2개를 고른다.
    손으로 적으면 노선 형상을 바꿀 때마다 어긋난다(급행1을 «달구벌대로»로 적어 뒀는데
    실제로는 팔공로 30%, 달구벌대로 18%였다). 데이터에서 뽑아야 다시 틀리지 않는다.
    """
    tot = {}
    for m in ms:
        nm = names.get(m['ref'])
        if not nm:
            continue
        g = m['geometry']
        L = sum(hav((g[i]['lat'], g[i]['lon']), (g[i + 1]['lat'], g[i + 1]['lon'])) for i in range(len(g) - 1))
        tot[nm] = tot.get(nm, 0) + L
    if not tot:
        return ''
    total = sum(tot.values())
    return '·'.join(n for n, v in sorted(tot.items(), key=lambda x: -x[1])[:2] if v / total >= 0.08)


def build(rel, stops, role_filter=None, names=None):
    ms = [m for m in rel['members'] if m['type'] == 'way' and m.get('geometry')]
    if role_filter:
        f = [m for m in ms if m.get('role') == role_filter]
        if len(f) > 5:
            ms = f
    roads = main_roads(ms, names or {})
    line = rdp(stitch(ms), EPS)
    # 이어 붙인 선은 대개 «갔다가 같은 길로 돌아오는» 왕복이다(끝점이 시작점과 겹친다).
    # 그대로 두면 편도 거리가 두 배가 되고 정류장도 왕복분이 겹친다 — 반환점에서 자른다.
    if len(line) > 4 and hav(line[0], line[-1]) < 400:
        far = max(range(len(line)), key=lambda i: hav(line[0], line[i]))
        if far > 2:
            line = line[: far + 1]
    cums, total = cum(line)

    lat0 = min(p[0] for p in line) - 0.02
    lat1 = max(p[0] for p in line) + 0.02
    lng0 = min(p[1] for p in line) - 0.02
    lng1 = max(p[1] for p in line) + 0.02

    raw = []
    for nm, la, lo in stops:
        if not (lat0 <= la <= lat1 and lng0 <= lo <= lng1):
            continue
        d, at = project((la, lo), line, cums)
        if d <= TOL:
            raw.append({'base': dedupe_key(nm), 'disp': disp_name(nm), 'd': d, 'm': at})
    raw.sort(key=lambda x: x['m'])

    out = []
    for r in raw:
        if out and (r['base'] == out[-1]['base'] or r['m'] - out[-1]['m'] < 120):   # 도심은 정류장 간격이 짧다
            if r['d'] < out[-1]['d']:
                out[-1] = r
            continue
        out.append(r)

    return {
        'ref': rel['tags'].get('ref'), 'osm': rel['id'],
        'from': rel['tags'].get('from'), 'to': rel['tags'].get('to'),
        'lengthM': round(total),
        'roads': roads,
        'points': [[round(p[0], 5), round(p[1], 5)] for p in line],
        'stops': [{'name': s['disp'], 'at': round(s['m'] / max(1, total), 4)} for s in out],
    }


way_names = {w['id']: w['tags']['name']
             for w in load(WAYS)['elements'] if w.get('tags', {}).get('name')}
print('도로명 있는 way', len(way_names))

stops = [(e['tags']['name'], e['lat'], e['lon'])
         for e in load(ALL)['elements'] if e.get('tags', {}).get('name') and 'lat' in e]
print('정류장 풀', len(stops))

res = []
for rel in load(GEO)['elements']:
    ref = rel['tags'].get('ref')
    if len([m for m in rel['members'] if m.get('geometry')]) < 20:
        continue    # 도로가 몇 개뿐인 관계는 형상이 안 나온다 — 잘린 선을 노선이라 그리면 지도가 거짓말을 한다
    r = build(rel, stops, ROLE.get(ref), way_names)
    res.append(r)
    a = r['stops'][0]['name'] if r['stops'] else '—'
    b = r['stops'][-1]['name'] if r['stops'] else '—'
    print(f"{ref}: {len(r['points'])}점 {r['lengthM']/1000:.1f}km · 정류장 {len(r['stops'])} · 도로 {r['roads']} · {a} → {b}")

io.open(OUT, 'w', encoding='utf-8').write(json.dumps(res, ensure_ascii=False))
print('저장 완료')
