# -*- coding: utf-8 -*-
"""
BIS 경유정류소로 노선 전 구간을 채운다 — 도로 형상은 OSM, 나머지 구간은 정류장 순서로.

OSM 관계는 노선의 일부만 매핑돼 있어(급행1: 16.8km / 실제 35.2km) 실차의 절반이 선 밖에 떴다.
BIS는 전 구간 정류장을 순서대로 주지만 «정류장을 이은 직선»이라 도로 곡선이 없다.
→ **둘을 겹친다**: BIS 정류장 순서를 뼈대로, 이웃한 두 정류장이 모두 OSM 선 위(±TOL)에 있으면
   그 구간은 OSM 도로 점들을 그대로 끼워 넣는다. 커버되는 구간은 도로를 따라가고 나머지는 직선.

수집은 1회, 결과는 소스에 박는다(런타임 API 호출 없음).
"""
import io, json, re, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import hav, cum, project, disp_name   # noqa: E402

BIS = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_bis_stops_geubhaeng1.json'
OUT = r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad\bis_route_급행1.json'
ROUTES_TS = r'C:\Qdrive 통합\qdrive-unified\src\sim\routes.ts'

ON_LINE_M = 160   # 정류장이 OSM 선에서 이만큼 안이면 «그 선 위»로 본다


def osm_line(name):
    s = io.open(ROUTES_TS, encoding='utf-8').read()
    for b in re.split(r'\n  \{\n    id: ', s)[1:]:
        if re.search(r"name: '([^']+)'", b).group(1) != name:
            continue
        seg = b.split('points: [')[1].split('    ],')[0]
        return [(float(x), float(y)) for x, y in re.findall(r'\[(\d+\.\d+),\s*(\d+\.\d+)\]', seg)]
    return []


def main():
    raw = json.load(io.open(BIS, encoding='utf-8'))
    items = raw['response']['body']['items']['item']
    up = sorted([i for i in items if 1000 <= int(i['nodeord']) < 2000], key=lambda x: int(x['nodeord']))
    stops = [{'name': disp_name(i['nodenm']), 'lat': float(i['gpslati']), 'lng': float(i['gpslong'])} for i in up]

    line = osm_line('급행1')
    cums, _ = cum(line) if len(line) > 1 else ([], 0)

    # 각 정류장을 OSM 선에 투영 — 선 위면 (진행거리, 거리) 를 기록
    proj = []
    for st in stops:
        if len(line) > 1:
            d, at = project((st['lat'], st['lng']), line, cums)
        else:
            d, at = 1e9, 0
        proj.append({'d': d, 'at': at, 'on': d <= ON_LINE_M})

    pts = []
    for i, st in enumerate(stops):
        p = (st['lat'], st['lng'])
        if not pts or hav(pts[-1], p) > 1:
            pts.append(p)
        if i + 1 >= len(stops):
            break
        a, b = proj[i], proj[i + 1]
        # 두 정류장이 모두 OSM 선 위면 그 사이 도로 점을 끼워 넣는다.
        # OSM 선의 진행 방향이 노선의 진행 방향과 반대일 수 있어(급행1이 그랬다) 순서를 맞춰 넣는다.
        if a['on'] and b['on'] and abs(b['at'] - a['at']) > 60:
            lo, hi = sorted([a['at'], b['at']])
            mid = [line[k] for k in range(len(line)) if lo < cums[k] < hi]
            if b['at'] < a['at']:
                mid.reverse()
            for q in mid:
                if hav(pts[-1], q) > 1:
                    pts.append(q)

    _, total = cum(pts)
    cums2, _ = cum(pts)
    out = {
        'ref': '급행1',
        'lengthM': round(total),
        'points': [[round(p[0], 5), round(p[1], 5)] for p in pts],
        'stops': [],
    }
    # 정류장 위치 비율은 «완성된 선» 기준으로 다시 계산한다
    for st in stops:
        d, at = project((st['lat'], st['lng']), pts, cums2)
        out['stops'].append({'name': st['name'], 'at': round(at / max(1, total), 4)})

    io.open(OUT, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False))
    onc = sum(1 for x in proj if x['on'])
    print(f"급행1 전 구간: 정류장 {len(stops)} · 선 {len(pts)}점 · {total/1000:.1f}km")
    print(f"  OSM 선 위 정류장 {onc}/{len(stops)} — 그 구간은 도로 형상, 나머지는 정류장 직선")
    print(f"  기점 {stops[0]['name']} → 종점 {stops[-1]['name']}")
    print('  저장', OUT)


if __name__ == '__main__':
    main()
