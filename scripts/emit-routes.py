# -*- coding: utf-8 -*-
"""daegu_routes.json → src/sim/routes.ts (실좌표·실정류장으로 교체)"""
import io, json, math

SRC = r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad\daegu_routes.json'
DST = r'C:\Qdrive 통합\qdrive-unified\src\sim\routes.ts'

# 엔진이 쓰는 3개 노선 — id는 기존 그대로 둔다(차량·이력이 이 id로 묶여 있다)
DRIVEN = {
    '급행1':  dict(id='R1', road='달구벌대로', color='#ef4444', loop=False),
    '순환2':  dict(id='R2', road='도심 순환로', color='#3b82f6', loop=False),
    '급행3':  dict(id='R3', road='팔달로·중앙대로', color='#22c55e', loop=False),
}
# 표시 전용 — 지도에만 깔린다
# 급행5는 OSM에 이어진 도로가 4.4km뿐이라 뺐다 — 짧게 잘린 선을 «주요 노선»이라 깔면 지도가 거짓말을 한다
EXTRA = {
    '급행4':   dict(id='X4', road='앞산순환로·달서로', color='#f59e0b'),
    '급행6':   dict(id='X6', road='칠곡중앙대로·성서로', color='#14b8a6'),
    '순환2-1': dict(id='X21', road='도심 순환로(역방향)', color='#60a5fa'),
}


def fmt_pts(pts):
    rows, line = [], '      '
    for p in pts:
        s = f'[{p[0]}, {p[1]}], '
        if len(line) + len(s) > 118:
            rows.append(line.rstrip())
            line = '      '
        line += s
    rows.append(line.rstrip().rstrip(','))
    return '\n'.join(rows)


def fmt_stops(stops):
    return '\n'.join(f"      {{ name: '{s['name']}', at: {s['at']} }}," for s in stops)


def block(r, meta, loop):
    pts = [tuple(p) for p in r['points']]
    if loop:
        # 순환 노선은 폐곡선이어야 차량이 끊김 없이 돈다 — 끝점이 시작점 근처면 이어 붙인다
        d = math.dist((pts[0][0] * 111, pts[0][1] * 88), (pts[-1][0] * 111, pts[-1][1] * 88)) * 1000
        if 0 < d < 1500:
            pts.append(pts[0])
    return f"""  {{
    id: '{meta['id']}',
    name: '{r['ref']}',
    road: '{meta['road']}',
    color: '{meta['color']}',
    loop: {'true' if loop else 'false'},
    osm: {r['osm']},
    ends: '{r.get('from') or ''} ↔ {r.get('to') or ''}',
    lengthKm: {round(r['lengthM'] / 1000, 1)},
    points: [
{fmt_pts([list(p) for p in pts])}
    ],
    stops: [
{fmt_stops(r['stops'])}
    ],
  }},"""


data = {r['ref']: r for r in json.load(io.open(SRC, encoding='utf-8'))}

driven = [block(data[k], v, v['loop']) for k, v in DRIVEN.items() if k in data]
extra = [block(data[k], v, False) for k, v in EXTRA.items() if k in data]

head = """import type { LatLng } from './geo'

/**
 * 대구 시내버스 노선 — **실제 노선 형상과 실제 정류장 이름**.
 *
 * OpenStreetMap의 대구 버스 노선 관계(type=route, route=bus)에서 한 번 수집해 여기 박아 둔다.
 * 런타임에 외부 API를 부르지 않는다 — 데모는 인터넷이 끊겨도 살아야 하고, 키를 커밋할 수 없다.
 * 좌표는 «정류장을 직선으로 이은 선»이 아니라 버스가 실제로 타는 도로 형상이다.
 * 재수집: scripts/build-routes.py (Overpass → 도로 이어붙이기 → 형상 단순화 → 정류장 투영·정렬)
 * 출처: © OpenStreetMap contributors (ODbL)
 */

export interface BusStop {
  name: string
  /** 노선 시작점부터의 위치 비율 0~1 — 실제 도로 진행거리 기준 */
  at: number
}

export interface BusRoute {
  id: string
  name: string
  /** 이 노선이 타는 주요 도로 — 발생 지점을 좌표가 아니라 «어디»로 말하기 위해 */
  road: string
  color: string
  loop: boolean
  points: LatLng[]
  stops: BusStop[]
  /** 출처 노선 관계 id — 재수집·검증용 */
  osm?: number
  /** 기점 ↔ 종점 */
  ends?: string
  lengthKm?: number
}

/** 실증 차량이 실제로 달리는 노선 — 엔진·집계·정산이 전부 이 3개에 걸린다 */
export const ROUTES: BusRoute[] = [
"""

tail = """]

/**
 * 표시 전용 노선 — 지도에 «대구의 주요 버스»를 깔기 위한 것.
 * 엔진은 이 위를 달리지 않는다: 여기에 차량을 태우면 9대 실증 스케일이 흐려진다.
 */
export const EXTRA_ROUTES: BusRoute[] = [
"""

out = head + '\n'.join(driven) + '\n' + tail + '\n'.join(extra) + '\n]\n'
io.open(DST, 'w', encoding='utf-8', newline='').write(out)

print('운행', [data[k]['ref'] for k in DRIVEN if k in data])
print('표시', [data[k]['ref'] for k in EXTRA if k in data])
for k in list(DRIVEN) + list(EXTRA):
    if k in data:
        r = data[k]
        print(f"  {r['ref']}: {len(r['points'])}점 {r['lengthM']/1000:.1f}km 정류장 {len(r['stops'])} · {r['stops'][0]['name']} → {r['stops'][-1]['name']}")
