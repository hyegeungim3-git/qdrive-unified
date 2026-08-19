# -*- coding: utf-8 -*-
"""
OSM 노선 관계 → 도로를 따라가는 폴리라인 + 순서대로 정렬된 정류장 목록.

한 번만 돌려서 결과를 소스에 커밋한다 — 데모는 오프라인에서도 살아야 하므로
런타임에 Overpass를 부르지 않는다.
"""
import json, math, sys, io, urllib.request, time

OVERPASS = 'https://overpass-api.de/api/interpreter'


def overpass(q, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(OVERPASS, data=q.encode('utf-8'),
                                         headers={'Content-Type': 'text/plain; charset=utf-8'})
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print('  재시도', i + 1, e, flush=True)
            time.sleep(15)
    raise SystemExit('Overpass 실패')


def hav(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))


def stitch(members):
    """
    way들을 **공유 노드로 연결**해 가장 긴 연속 경로를 만든다.

    앞서 두 방식이 모두 실패했다. 가까운 끝점을 찾아다니는 탐욕 방식은 첫 way가 노선 중간이면
    한쪽만 물고 끊겼고(40km→19km), 멤버 순서를 그대로 믿으면 다른 갈래로 건너뛰며 선이 왕복해
    길이가 부풀었다(40km→124km). OSM의 way들은 실제로 **같은 노드를 공유**하므로,
    끝점을 키로 인접 그래프를 만들어 걷는 것이 맞다.
    """
    segs = [[(g['lat'], g['lon']) for g in m['geometry']]
            for m in members if m.get('geometry') and len(m['geometry']) >= 2]
    if not segs:
        return []

    def k(p):
        return (round(p[0], 6), round(p[1], 6))

    ends = {}
    for i, s in enumerate(segs):
        ends.setdefault(k(s[0]), []).append((i, 0))
        ends.setdefault(k(s[-1]), []).append((i, 1))

    def walk(si, forward_from_end):
        """한 조각에서 출발해 한 방향으로 끝까지 걷는다"""
        used = {si}
        line = list(segs[si]) if forward_from_end else list(reversed(segs[si]))
        while True:
            nxt = None
            for j, side in ends.get(k(line[-1]), []):
                if j in used:
                    continue
                nxt = (j, side)
                break
            if not nxt:
                break
            j, side = nxt
            seg = segs[j] if side == 0 else segs[j][::-1]
            line.extend(seg[1:])
            used.add(j)
        return line, used

    # 어느 조각에서 시작하든 그쪽 끝까지는 간다. 양방향으로 걸어 이어 붙인 뒤,
    # 여러 후보 중 가장 긴 경로를 채택한다 — 지선이 섞여 있어도 본선이 남는다.
    best = []
    for si in range(0, len(segs), max(1, len(segs) // 12)):
        fwd, _ = walk(si, True)
        bwd, _ = walk(si, False)
        line = list(reversed(bwd))[:-1] + fwd
        if len(line) > len(best):
            best = line
    return best


def rdp(pts, eps):
    """더글러스-포이커 — 형상은 지키고 점 수만 줄인다(엔진이 250ms마다 이 위를 걷는다)"""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = perp(pts[i], a, b)
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [a, b]


def perp(p, a, b):
    ax, ay = a[1] * 88000, a[0] * 111000
    bx, by = b[1] * 88000, b[0] * 111000
    px, py = p[1] * 88000, p[0] * 111000
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    if L == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def cum(line):
    out, tot = [0.0], 0.0
    for i in range(1, len(line)):
        tot += hav(line[i - 1], line[i])
        out.append(tot)
    return out, tot


def project(pt, line, cums):
    """점을 폴리라인에 투영 — (선까지 거리, 시작점부터의 진행거리)"""
    best = (1e9, 0.0)
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        ax, ay = a[1] * 88000, a[0] * 111000
        bx, by = b[1] * 88000, b[0] * 111000
        px, py = pt[1] * 88000, pt[0] * 111000
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
        d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if d < best[0]:
            best = (d, cums[i] + t * (cums[i + 1] - cums[i]))
    return best


def disp_name(n):
    """화면에 쓸 이름 — «건너»는 반대편 표기라 뗀다. 숫자는 지운다(2.28기념중앙공원처럼 이름의 일부다)"""
    n = n.strip()
    for suf in ('건너', '(하)', '(상)'):
        if n.endswith(suf):
            n = n[: -len(suf)]
    return n.strip()


def dedupe_key(n):
    """양방향 쌍을 묶기 위한 비교용 키 — 이름 끝의 방향 표기와 꼬리 숫자만 떼어 낸다"""
    n = disp_name(n)
    while n and n[-1].isdigit():
        n = n[:-1]
    for suf in ('앞', '방향'):
        if n.endswith(suf):
            n = n[: -len(suf)]
    return n.strip()


def build(rel_id, role_filter=None, eps=18, stop_tol=28):
    print(f'· 관계 {rel_id} 수집', flush=True)
    g = overpass(f'[out:json][timeout:180];rel(id:{rel_id});out geom;')
    rel = g['elements'][0]
    ms = [m for m in rel['members'] if m['type'] == 'way' and m.get('geometry')]
    if role_filter is not None:
        f = [m for m in ms if m.get('role') == role_filter]
        if len(f) > 5:
            ms = f
    line = stitch(ms)
    line = rdp(line, eps)
    cums, total = cum(line)

    time.sleep(6)
    s = overpass(f'[out:json][timeout:180];rel(id:{rel_id})->.r;way(r.r)->.w;'
                 f'node(around.w:{stop_tol})["highway"="bus_stop"];out tags;')
    raw = []
    for e in s['elements']:
        nm = e.get('tags', {}).get('name')
        if not nm:
            continue
        d, at = project((e['lat'], e['lon']), line, cums)
        if d <= stop_tol + 12:
            raw.append({'name': nm, 'base': dedupe_key(nm), 'disp': disp_name(nm), 'd': d, 'm': at})
    raw.sort(key=lambda x: x['m'])

    stops = []
    for r in raw:
        if stops and (r['base'] == stops[-1]['base'] or r['m'] - stops[-1]['m'] < 180):
            if r['d'] < stops[-1]['d']:
                stops[-1] = r
            continue
        stops.append(r)
    return {
        'ref': rel['tags'].get('ref'), 'osm': rel_id,
        'from': rel['tags'].get('from'), 'to': rel['tags'].get('to'),
        'lengthM': round(total),
        'points': [[round(p[0], 5), round(p[1], 5)] for p in line],
        'stops': [{'name': st['disp'] or st['name'], 'at': round(st['m'] / max(1, total), 4)} for st in stops],
    }


TARGETS = [
    (12446525, 'forward'),   # 급행1 동화사↔다사 — 주인공 차량 노선
    (14477095, None),        # 급행3 동명↔범물동
    (14479301, None),        # 순환2 검단동 순환
    (14477250, None),        # 급행4 유곡리↔설화명곡역
    (14477280, None),        # 급행5 성서산단↔대구대
    (14477347, None),        # 급행6 연경동↔성서공단
    (14479300, None),        # 순환2-1 반대 방향 순환
]

if __name__ == '__main__':
    out = []
    for rid, role in TARGETS:
        try:
            r = build(rid, role)
            print(f"  {r['ref']}: {len(r['points'])}점 {r['lengthM'] / 1000:.1f}km · 정류장 {len(r['stops'])}", flush=True)
            out.append(r)
            time.sleep(8)
        except SystemExit:
            print(f'  {rid} 실패 — 건너뜀', flush=True)
    io.open(r'C:\Users\TOTTEN~1\AppData\Local\Temp\claude\C--Qdrive---\4b8ea4ed-1b36-4e29-b62c-37a63a34ae5d\scratchpad\daegu_routes.json',
            'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False))
    print('완료', len(out), flush=True)
