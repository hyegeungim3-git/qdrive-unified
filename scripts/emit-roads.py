# -*- coding: utf-8 -*-
"""주요 간선도로 → src/sim/roads.ts (노선이 «어느 도로를 타고 어디서 가로지르는지» 보이게)"""
import io, json, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import rdp   # noqa: E402

SRC = [r'C:\Users\tottenham\AppData\Local\Temp\qdrive_road_dgb.json',
       r'C:\Users\tottenham\AppData\Local\Temp\qdrive_roads2.json']
DST = r'C:\Qdrive 통합\qdrive-unified\src\sim\roads.ts'

# 데모 문장에 실제로 나오는 도로만 — 지도에 도로를 다 그리면 배경 타일과 싸운다
KEEP = {
    '달구벌대로': '동서 간선 — 성서·반월당·시지를 잇는 축',
    '신천대로': '남북 간선 — 신천 따라 도심을 관통',
    '앞산순환로': '남쪽 순환 — 앞산 자락을 도는 축',
    '중앙대로': '도심 남북축 — 대구역·반월당',
}

ways = []
for p in SRC:
    for w in json.load(io.open(p, encoding='utf-8'))['elements']:
        nm = w.get('tags', {}).get('name')
        if nm in KEEP and w.get('geometry'):
            ways.append((nm, [(g['lat'], g['lon']) for g in w['geometry']]))

group = {}
for nm, pts in ways:
    group.setdefault(nm, []).append(rdp(pts, 20) if len(pts) > 3 else pts)

L = ["""import type { LatLng } from './geo'

/**
 * 대구 주요 간선도로 — 지도에서 «이 노선이 어느 도로를 타고, 어디서 가로지르는가»가 보이게.
 *
 * OpenStreetMap의 도로 이름(name=달구벌대로 …)으로 한 번 수집해 박아 둔다. 노선과 같은 원칙:
 * 런타임에 외부 API를 부르지 않는다. 이어 붙이지 않고 **조각 그대로** 그린다 —
 * 도로는 갈래가 많아 하나의 선으로 엮으면 없는 연결이 생긴다.
 * 출처: © OpenStreetMap contributors (ODbL)
 */
export interface MajorRoad {
  name: string
  note: string
  /** 도로 조각들 — 각각 따로 그린다 */
  segments: LatLng[][]
}

export const MAJOR_ROADS: MajorRoad[] = ["""]

for nm, note in KEEP.items():
    segs = group.get(nm, [])
    if not segs:
        continue
    L.append(f"  {{\n    name: '{nm}',\n    note: '{note}',\n    segments: [")
    for s in segs:
        pts = ', '.join(f'[{round(p[0], 5)}, {round(p[1], 5)}]' for p in s)
        L.append(f'      [{pts}],')
    L.append('    ],\n  },')
    print(f'{nm}: 조각 {len(segs)} · 점 {sum(len(s) for s in segs)}')

L.append(']')
io.open(DST, 'w', encoding='utf-8', newline='').write('\n'.join(L) + '\n')
print('저장', DST)
