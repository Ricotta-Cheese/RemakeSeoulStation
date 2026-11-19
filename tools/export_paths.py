"""
움직이는 자동차·버스·기차 경로 내보내기 -> web/public/data/paths.json

사용법: SeoulStation_Proposal.blend를 연 Blender에서 실행 (Scripting 탭 > Run Script).
  - OSM 도로 중심선(data/osm/ground_local_m.json)과 철도(site_local_m.json)를 4m 간격으로 나눠
    제안안 씬에 레이캐스트해서, 실제 도로·선로가 모델에 있는 구간만 남기고 높이(z)를 맞춤.
  - 현황(e) / 제안(p) 단계별로 쓸 수 있는 구간을 따로 표시.
  - 좌표는 웹(three.js, y-up) 기준 [x, y, z] = [X, Z, -Y] 로 저장.
"""
import bpy, os, json, math
from mathutils import Vector

ROOT = os.path.dirname(bpy.data.filepath)
OSM = os.path.join(ROOT, "data", "osm")
OUT = os.path.join(ROOT, "web", "public", "data", "paths.json")

ground = json.load(open(os.path.join(OSM, "ground_local_m.json")))
site = json.load(open(os.path.join(OSM, "site_local_m.json")))

vl = bpy.context.view_layer
dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.context.scene

# 제안안에서 지운 현황 도로(버스환승센터 주변)는 이 상자 안에서 현황 단계에 그대로 허용
EXIST_ONLY_BOX = (100, 170, -165, 185)
# 제안안의 버스 전용 거리: 일반 차량 금지
BUS_ONLY_BOX = (110, 158, -156, 180)
CAR_CLASSES = {"primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "residential", "unclassified"}


def inbox(x, y, b):
    return b[0] <= x <= b[1] and b[2] <= y <= b[3]


def hit(x, y, z0=40.0):
    h = sc.ray_cast(dg, Vector((x, y, z0)), Vector((0, 0, -1)), distance=80)
    return (h[4].name, h[1].z) if h[0] else (None, 0.0)


def hit_below(x, y, z0):
    """z0 아래로 내려가며 처음 만나는 면 (데크 아래 선로처럼 위가 덮인 곳용)"""
    h = sc.ray_cast(dg, Vector((x, y, z0)), Vector((0, 0, -1)), distance=z0 + 5)
    return (h[4].name, h[1].z) if h[0] else (None, 0.0)


def resample(pts, step=4.0):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        n = max(1, int(d // step))
        for k in range(1, n + 1):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def runs(samples, ok):
    """ok(x,y)->z 또는 None. 연속으로 유효한 구간만 잘라 [(x,y,z)...] 목록으로"""
    res, cur = [], []
    for x, y in samples:
        z = ok(x, y)
        if z is None:
            if len(cur) > 6:
                res.append(cur)
            cur = []
        else:
            cur.append((x, y, z))
    if len(cur) > 6:
        res.append(cur)
    return res


def is_road(name):
    return name and (name.startswith("G_Roads") or name.startswith("G_Mark") or name.startswith("G_Bridge")
                     or (name.startswith("PR_RN_") and not any(k in name for k in ("Paving", "Trees", "Median", "Lawn"))))


def road_hit(x, y):
    """가로수 잎·고가 아래로 지나가도록 낮은 곳(3.5m)부터, 없으면 교량 높이(12m)에서"""
    for z0 in (3.5, 12.0):
        n, z = hit_below(x, y, z0)
        if is_road(n):
            return n, z
    return n, z


def car_ok_p(x, y):
    if inbox(x, y, BUS_ONLY_BOX):
        return None
    n, z = road_hit(x, y)
    return z + 0.05 if is_road(n) else None


def car_ok_e(x, y):
    n, z = road_hit(x, y)
    if is_road(n) and n.startswith("G_"):
        return z + 0.05
    if inbox(x, y, EXIST_ONLY_BOX):
        return 0.12
    return None


def yup(p):
    return [round(p[0], 1), round(p[2], 2), round(-p[1], 1)]


out = {"cars": [], "buses": [], "trains": []}
for r in ground["roads"]:
    if r["cls"] not in CAR_CLASSES and r["cls"] != "busway":
        continue
    s = resample(r["pts"])
    lanes = max(1, int(r.get("lanes") or (2 if r["cls"].startswith(("primary", "secondary")) else 1)))
    base = {"lanes": lanes, "oneway": bool(r.get("oneway")), "cls": r["cls"]}
    if r["cls"] == "busway":
        for run in runs(s, car_ok_e):
            out["buses"].append({**base, "st": "e", "pts": [yup(p) for p in run]})
        continue
    for st, ok in (("e", car_ok_e), ("p", car_ok_p)):
        for run in runs(s, ok):
            out["cars"].append({**base, "st": st, "pts": [yup(p) for p in run]})

# 제안안 버스 전용 거리: 남행(서쪽 차로) / 북행(동쪽 차로)
for x, y0, y1 in ((122.0, 176.0, -152.0), (140.0, -152.0, 176.0)):
    n = int(abs(y1 - y0) / 4)
    pts = [(x, y0 + (y1 - y0) * k / n, 0.12) for k in range(n + 1)]
    out["buses"].append({"lanes": 1, "oneway": True, "cls": "busway", "st": "p", "stops": [0.42, 0.62], "pts": [yup(p) for p in pts]})


# ---- 철도: 조각난 OSM 선을 끝점끼리 이어 긴 선로로 만든 뒤, 모델에 선로가 있는 구간만 ----
segs = [list(map(tuple, r["pts"])) for r in site["rails"] if r["type"] == "rail" and r["tunnel"] == "no"]
key = lambda p: (round(p[0]), round(p[1]))
ends = {}
for i, s in enumerate(segs):
    ends.setdefault(key(s[0]), []).append((i, 0))
    ends.setdefault(key(s[-1]), []).append((i, 1))
used = set()


def heading(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])


def extend(chain):
    while True:
        tail = chain[-1]
        prev = chain[-2]
        h0 = heading(prev, tail)
        best = None
        for j, side in ends.get(key(tail), []):
            if j in used:
                continue
            s = segs[j] if side == 0 else segs[j][::-1]
            dh = abs((heading(s[0], s[1]) - h0 + math.pi) % (2 * math.pi) - math.pi)
            if dh < 0.35 and (best is None or dh < best[0]):
                best = (dh, j, s)
        if not best:
            return chain
        used.add(best[1])
        chain += best[2][1:]


chains = []
for i, s in enumerate(segs):
    if i in used:
        continue
    used.add(i)
    c = extend(list(s))
    c = extend(c[::-1])
    chains.append(c)


def rail_ok(x, y):
    n, z = hit_below(x, y, 2.2)
    return z + 0.05 if n and n.startswith("T_") else None


for c in chains:
    for run in runs(resample(c, 5.0), rail_ok):
        L = sum(math.dist(a[:2], b[:2]) for a, b in zip(run, run[1:]))
        if L > 300:
            out["trains"].append({"st": "ep", "len": round(L), "pts": [yup(p) for p in run]})

json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("cars", len(out["cars"]), "buses", len(out["buses"]), "trains", len(out["trains"]),
      "train lens", sorted([t["len"] for t in out["trains"]], reverse=True)[:12],
      "KB", round(os.path.getsize(OUT) / 1024))


# ---- 보행자: 보도·횡단보도(현황+제안), 현황 광장, 서울로7017 ----
import random
random.seed(7)
transit = json.load(open(os.path.join(OSM, "transit_local_m.json")))
out["walk"] = []


def foot_hit(x, y):
    n, z = hit_below(x, y, 3.5)
    return n, z


def foot_ok(x, y):
    n, z = foot_hit(x, y)
    if n and (n.startswith("G_Footways") or n.startswith("G_Area_pedestrian") or n.startswith("G_Mark_Crosswalk") or n.startswith("G_Roads") or n.startswith("G_Mark")):
        return z + 0.02
    return None


for f in ground["foot"]:
    for run in runs(resample(f["pts"], 3.0), foot_ok):
        out["walk"].append({"st": "ep", "w": f.get("w", 2.5), "pts": [yup(p) for p in run]})
for c in ground["cross"]:
    s = resample(c["pts"], 2.0)
    zs = [foot_ok(x, y) for x, y in s]
    if all(z is not None for z in zs) and len(s) > 3:
        out["walk"].append({"st": "ep", "w": 3.0, "cross": True, "pts": [yup((x, y, z)) for (x, y), z in zip(s, zs)]})


def inside(poly, x, y):
    c = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


# 현황 광장: 다각형 안에서 임의의 두 점을 잇는 직선 산책길 (현황 단계 전용)
for a in ground["areas"]:
    if a["type"] not in ("plaza", "pedestrian"):
        continue
    poly = [tuple(p) for p in a["pts"]]
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    if area < 400:
        continue
    k = 40 if a["type"] == "plaza" else max(2, min(12, int(area / 1500)))
    made = 0
    for _ in range(k * 20):
        if made >= k:
            break
        p0 = (random.uniform(min(xs), max(xs)), random.uniform(min(ys), max(ys)))
        p1 = (random.uniform(min(xs), max(xs)), random.uniform(min(ys), max(ys)))
        if math.dist(p0, p1) < 25 or not (inside(poly, *p0) and inside(poly, *p1)):
            continue
        seg = resample([p0, p1], 3.0)
        if not all(inside(poly, x, y) for x, y in seg):
            continue
        st = "e" if a["type"] == "plaza" else "ep"
        if st == "ep" and any(foot_ok(x, y) is None for x, y in seg[::3]):
            st = "e"
        out["walk"].append({"st": st, "w": 1.0, "pts": [yup((x, y, 0.14)) for x, y in seg]})
        made += 1


def deck_ok(x, y):
    n, z = hit_below(x, y, 26.0)
    return z + 0.02 if n and z > 12 else None


for sl in transit["seoullo"]:
    for run in runs(resample(sl["pts"], 3.0), deck_ok):
        out["walk"].append({"st": "ep", "w": 3.0, "pts": [yup(p) for p in run]})

json.dump(out, open(OUT, "w"), separators=(",", ":"))
wl = lambda st: round(sum(sum(math.dist(a, b) for a, b in zip(w["pts"], w["pts"][1:])) for w in out["walk"] if st in w["st"]))
print("walk paths", len(out["walk"]), "length e/p", wl("e"), wl("p"), "KB", round(os.path.getsize(OUT) / 1024))
