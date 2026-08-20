# -*- coding: utf-8 -*-
"""
간선도로 레이어 — «버스가 실제로 타는 도로» 중 **여러 노선이 함께 쓰는 축**만.

두 번의 교정이 있었다.
1) 처음에는 도로 이름으로 검색해 그렸다(way["name"="달구벌대로"]). 버스가 지나지 않는
   측도·램프·짧은 갈래까지 딸려 나와 지도에 토막 선이 떠다녔다(사용자 지적).
2) 노선 way만 쓰도록 고쳤더니 35개 도로가 나왔는데, 한 노선만 타는 도로는 그 노선 선과
   그대로 겹쳐 레이어가 노선의 복사본이 된다. 그건 정보가 아니다.
→ **2개 이상 노선이 공유하고 총 연장 3km 이상**인 도로만 남긴다. 그것이 «간선»이다.
"""
import io, json, sys

sys.path.insert(0, r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad')
from build_routes import hav, rdp   # noqa: E402

GEO = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_geo.json'
WAYS = r'C:\Users\tottenham\AppData\Local\Temp\qdrive_waynames.json'
DST = r'C:\Qdrive 통합\qdrive-unified\src\sim\roads.ts'

MIN_TOTAL_M = 3000
MIN_SEG_M = 120
MIN_ROUTES = 2


def load(p):
    return json.load(io.open(p, encoding='utf-8'))


names = {w['id']: w['tags']['name'] for w in load(WAYS)['elements'] if w.get('tags', {}).get('name')}

seen_way = set()
group = {}
users = {}      # 도로 이름 → 그 도로를 타는 노선 집합
for rel in load(GEO)['elements']:
    ref = rel['tags'].get('ref')
    for m in rel['members']:
        if m['type'] != 'way' or not m.get('geometry'):
            continue
        nm = names.get(m['ref'])
        if not nm:
            continue
        users.setdefault(nm, set()).add(ref)
        if m['ref'] in seen_way:
            continue
        seen_way.add(m['ref'])
        pts = [(g['lat'], g['lon']) for g in m['geometry']]
        L = sum(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        if L < MIN_SEG_M:
            continue
        group.setdefault(nm, []).append((L, pts))

rows = []
for nm, segs in group.items():
    total = sum(L for L, _ in segs)
    n = len(users.get(nm, ()))
    if total < MIN_TOTAL_M or n < MIN_ROUTES:
        continue
    rows.append((total, nm, [rdp(p, 20) for _, p in segs], n))
rows.sort(reverse=True)

OUT = ["""import type { LatLng } from './geo'

/**
 * 버스가 실제로 타는 간선도로 — **노선 관계의 way만**, 그중 **2개 이상 노선이 공유**하는 축.
 *
 * 도로 이름으로 검색해 그리면 버스가 지나지 않는 측도·램프까지 딸려 나와 토막 선이 떠다닌다.
 * 노선 way만 써도 한 노선 전용 도로는 그 노선 선과 겹쳐 레이어가 노선의 복사본이 된다.
 * 그래서 «여러 노선이 함께 타는 길»만 남긴다 — 그것이 도시의 축이고, 지도에서 새 정보다.
 *
 * 이어 붙이지 않고 조각 그대로 그린다: 도로는 갈래가 많아 하나로 엮으면 없는 연결이 생긴다.
 * 재수집: scripts/emit-roads.py · 출처: © OpenStreetMap contributors (ODbL)
 */
export interface MajorRoad {
  name: string
  /** 노선 way 기준 총 연장(km) */
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
    print(f'{nm}: {total/1000:5.1f}km · 조각 {len(segs)} · 노선 {n}개 공유')

OUT.append(']')
io.open(DST, 'w', encoding='utf-8', newline='').write('\n'.join(OUT) + '\n')
print(f'\n도로 {len(rows)}개 · 조각 {sum(len(s) for _, _, s, _ in rows)}')
