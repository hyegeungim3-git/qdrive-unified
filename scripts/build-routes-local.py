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
OUT = r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad\daegu_routes.json'

ROLE = {'급행1': 'forward'}
EPS = 12      # 형상 단순화 허용 오차(m) — 12m면 도로 곡선이 눈에 띄게 뭉개지지 않는다
TOL = 70      # 정류장 노드는 인도 쪽에 찍혀 도로 중심선에서 수십 m 떨어진다 — 넉넉히 잡는다


def load(p):
    return json.load(io.open(p, encoding='utf-8'))


def build(rel, stops, role_filter=None):
    ms = [m for m in rel['members'] if m['type'] == 'way' and m.get('geometry')]
    if role_filter:
        f = [m for m in ms if m.get('role') == role_filter]
        if len(f) > 5:
            ms = f
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
        if out and (r['base'] == out[-1]['base'] or r['m'] - out[-1]['m'] < 200):
            if r['d'] < out[-1]['d']:
                out[-1] = r
            continue
        out.append(r)

    return {
        'ref': rel['tags'].get('ref'), 'osm': rel['id'],
        'from': rel['tags'].get('from'), 'to': rel['tags'].get('to'),
        'lengthM': round(total),
        'points': [[round(p[0], 5), round(p[1], 5)] for p in line],
        'stops': [{'name': s['disp'], 'at': round(s['m'] / max(1, total), 4)} for s in out],
    }


stops = [(e['tags']['name'], e['lat'], e['lon'])
         for e in load(ALL)['elements'] if e.get('tags', {}).get('name') and 'lat' in e]
print('정류장 풀', len(stops))

res = []
for rel in load(GEO)['elements']:
    ref = rel['tags'].get('ref')
    if ref == '급행2':      # 관계에 도로가 3개뿐 — 형상이 안 나온다
        continue
    r = build(rel, stops, ROLE.get(ref))
    res.append(r)
    a = r['stops'][0]['name'] if r['stops'] else '—'
    b = r['stops'][-1]['name'] if r['stops'] else '—'
    print(f"{ref}: {len(r['points'])}점 {r['lengthM']/1000:.1f}km · 정류장 {len(r['stops'])} · {a} → {b}")

io.open(OUT, 'w', encoding='utf-8').write(json.dumps(res, ensure_ascii=False))
print('저장 완료')
