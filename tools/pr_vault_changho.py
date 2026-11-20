"""
버스환승센터 · 연결 회랑 · 서울로 보행로(스카이 루트) 지붕에 4안(그늘 지붕 콘크리트 띠살)의 디자인 언어를 입히는 스크립트.
모양은 지금 그대로 두고(지붕 곡면을 실제 표면에서 읽어 옴), 재료와 짜임만 바꿔요. 여러 번 실행해도 됨.

  - 원래 나무 마름모 격자(…RoofRibs / …Ribs)와 마름모 판(…RoofPanels / …Roof)은 숨기고,
    같은 곡면 위에:
      울거미 = 일정 간격의 굵은 콘크리트 아치(단면을 따라),
      세로살 = 지붕 길이 방향으로 이어지는 콘크리트 핀,
      가로띠 = 아치 사이 칸(문짝)마다 위·가운데·아래 세 군데 4줄씩,
      판 = 눈높이(바닥에서 3.5m까지)는 투명 유리, 그 위는 띠 구간 한지 막 + 세로살 사이 막·유리 번갈아.
  - 곡면 읽는 법: 지붕 정점으로 중심선을 구하고, 중심선을 따라 1.5m마다 단면 방향으로 광선을 쏴 표면을 찾아요
    (휘어진 연결 회랑도 같은 방법).
  - 결과는 04_Proposal/PR_VaultChangho 컬렉션(웹 내보내기 대상 아님). 웹으로는 내보내지 않음.
  - 재질은 그늘 지붕 4안 재질(MPR_CF_Concrete, MPR_CF_Fin, MPR_CH_Membrane, MPR_CC_Glass)을 같이 써요.
"""
import bpy, bmesh, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

TARGETS = [
    dict(key="BT", label="버스환승센터", panels="PR_BT_RoofPanels", ribs="PR_BT_RoofRibs", bay=12.0, sal=1.6),
    dict(key="CX", label="연결 회랑", panels="PR_CX_RoofPanels", ribs="PR_CX_RoofRibs", bay=9.0, sal=1.3),
    dict(key="SK", label="서울로 보행로", panels="PR_SK_Roof", ribs="PR_SK_Ribs", bay=9.0, sal=1.3),
]
STEP = 1.5                         # 중심선 따라 단면 간격
BANDS = [(0.1, 0.2), (0.45, 0.55), (0.8, 0.9)]   # 칸(아치 사이) 안 가로띠
BAND_LINES = 4
EYE = 3.5                          # 이 높이(바닥 기준)까지는 투명 유리

coll = bpy.data.collections.get("PR_VaultChangho")
if coll:
    for o in list(coll.objects):
        me = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0: bpy.data.meshes.remove(me)
else:
    coll = bpy.data.collections.new("PR_VaultChangho")
    bpy.data.collections["04_Proposal"].children.link(coll)
coll.hide_render = coll.hide_viewport = False

M_FRAME = bpy.data.materials["MPR_CF_Concrete"]
M_FIN = bpy.data.materials["MPR_CF_Fin"]
M_MEMB = bpy.data.materials["MPR_CH_Membrane"]
M_GLASS = bpy.data.materials["MPR_CC_Glass"]


def sweep3d(bm, pts, nrms, width, up, down):
    n = len(pts)
    if n < 2: return
    ring = []
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        t = (b - a)
        if t.length < 1e-6: t = Vector((1, 0, 0))
        side = t.normalized().cross(nrms[i]).normalized() * (width / 2)
        p = pts[i]
        ring.append([bm.verts.new(p - side - nrms[i] * down), bm.verts.new(p + side - nrms[i] * down),
                     bm.verts.new(p + side + nrms[i] * up), bm.verts.new(p - side + nrms[i] * up)])
    for i in range(n - 1):
        r0, r1 = ring[i], ring[i + 1]
        for k in range(4): bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(tuple(reversed(ring[0]))); bm.faces.new(tuple(ring[-1]))


def build(tg):
    pan = bpy.data.objects[tg["panels"]]
    M = pan.matrix_world
    verts = [M @ v.co for v in pan.data.vertices]
    bm0 = bmesh.new(); bm0.from_mesh(pan.data); bm0.transform(M)
    bvh = BVHTree.FromBMesh(bm0)

    # 중심선: 평면 주축으로 정점을 늘어놓고 2m 칸마다 평균
    cx = sum(v.x for v in verts) / len(verts); cy = sum(v.y for v in verts) / len(verts)
    sxx = sum((v.x - cx) ** 2 for v in verts); syy = sum((v.y - cy) ** 2 for v in verts); sxy = sum((v.x - cx) * (v.y - cy) for v in verts)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
    ax = Vector((math.cos(ang), math.sin(ang), 0))
    ts = [(v - Vector((cx, cy, 0))).dot(ax) for v in verts]
    t0, t1 = min(ts), max(ts)
    nb = int((t1 - t0) / 2.0) + 1
    bins = [[] for _ in range(nb)]
    for v, t in zip(verts, ts): bins[min(nb - 1, int((t - t0) / 2.0))].append(v)
    # 칸마다 폭 방향 양 끝의 가운데(평균은 격자 분포에 따라 흔들려서)
    perp = Vector((-ax.y, ax.x, 0))
    C = Vector((cx, cy, 0))
    cl = []
    for bi, b in enumerate(bins):
        if not b: continue
        ws = [(v - C).dot(perp) for v in b]
        tm = t0 + (bi + 0.5) * 2.0
        c = C + ax * tm + perp * ((min(ws) + max(ws)) / 2)
        cl.append(Vector((c.x, c.y, min(v.z for v in b))))
    for _ in range(25):   # 충분히 부드럽게
        cl = [cl[0]] + [(cl[i - 1] + cl[i] * 2 + cl[i + 1]) / 4 for i in range(1, len(cl) - 1)] + [cl[-1]]
    zbase = min(v.z for v in verts)
    # 거의 곧은 지붕이면 방향을 주축 하나로 고정(단면이 흔들리지 않게), 휘어진 지붕만 중심선을 따름
    straight = max(abs((c - C).dot(perp)) for c in cl) < 4.0
    # 중심선을 STEP 간격으로 다시 뽑기
    L = [0.0]
    for i in range(1, len(cl)): L.append(L[-1] + (cl[i] - cl[i - 1]).xy.length)
    stations = []
    s = 0.0
    while s <= L[-1]:
        i = max(1, next((j for j in range(1, len(L)) if L[j] >= s), len(L) - 1))
        f = (s - L[i - 1]) / max(1e-6, L[i] - L[i - 1])
        p = cl[i - 1].lerp(cl[i], f)
        if straight: tan = ax.copy()
        else: tan = (cl[min(len(cl) - 1, i + 4)] - cl[max(0, i - 5)]); tan.z = 0; tan.normalize()   # 넓은 구간으로 방향
        stations.append((s, p, tan))
        s += STEP

    # 단면마다 표면 찾기(옆 → 위 → 반대 옆으로 광선)
    NS = 48
    rows = []
    for (s, p, tan) in stations:
        side = tan.cross(Vector((0, 0, 1))).normalized()
        o = Vector((p.x, p.y, zbase + 0.4))
        hits = []
        for k in range(1, 180):
            a = math.radians(k)
            d = side * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)
            h = bvh.ray_cast(o, d, 200.0)
            if h[0] is not None: hits.append(h[0])
        if len(hits) < 6:
            rows.append(None); continue
        acc = [0.0]
        for i in range(1, len(hits)): acc.append(acc[-1] + (hits[i] - hits[i - 1]).length)
        prof = []
        for j in range(NS + 1):
            target = acc[-1] * j / NS
            i = max(1, next((q for q in range(1, len(acc)) if acc[q] >= target), len(acc) - 1))
            f = (target - acc[i - 1]) / max(1e-6, acc[i] - acc[i - 1])
            prof.append(hits[i - 1].lerp(hits[i], f))
        rows.append((s, p, prof, acc[-1]))
    bm0.free()
    rows = [r for r in rows if r is not None]
    if len(rows) < 3: print(tg["label"], "단면을 못 찾음"); return

    def P(i, j): return rows[i][2][j]

    def N(i, j):
        a = P(min(len(rows) - 1, i + 1), j) - P(max(0, i - 1), j)
        b = P(i, min(NS, j + 1)) - P(i, max(0, j - 1))
        n = a.cross(b).normalized()
        c = rows[i][1]; c = Vector((c.x, c.y, zbase))
        return n if n.dot(P(i, j) - c) > 0 else -n

    bm_f, bm_s, bm_m = bmesh.new(), bmesh.new(), bmesh.new()
    total = rows[-1][0] - rows[0][0]
    nbay = max(1, round(total / tg["bay"]))
    bay_len = total / nbay
    prof_len = sum(r[3] for r in rows) / len(rows)
    n_sal = max(4, round(prof_len / tg["sal"]))
    jj = lambda f: max(0, min(NS, round(f * NS)))

    # 울거미 아치(양 끝 포함)
    for b in range(nbay + 1):
        i = min(len(rows) - 1, round(b * bay_len / STEP))
        sweep3d(bm_f, [P(i, j) for j in range(NS + 1)], [N(i, j) for j in range(NS + 1)], 0.5, 0.35, 0.9)
    # 단면 양 끝(바닥·처마 가장자리)도 굵은 보
    for j in (0, NS):
        sweep3d(bm_f, [P(i, j) for i in range(len(rows))], [N(i, j) for i in range(len(rows))], 0.5, 0.35, 0.9)
    # 세로살: 길이 방향
    for q in range(1, n_sal):
        j = q * NS / n_sal
        j0 = int(j); f = j - j0; j1 = min(NS, j0 + 1)
        pts = [P(i, j0).lerp(P(i, j1), f) for i in range(len(rows))]
        sweep3d(bm_s, pts, [N(i, j0) for i in range(len(rows))], 0.12, 0.15, 0.45)
    # 가로띠: 칸마다 세 군데 4줄
    band_rows = set()
    for b in range(nbay):
        for (b0, b1) in BANDS:
            for k in range(BAND_LINES):
                tpos = (b + b0 + (b1 - b0) * k / (BAND_LINES - 1)) * bay_len
                i = min(len(rows) - 1, round(tpos / STEP))
                band_rows.add(i)
                sweep3d(bm_s, [P(i, j) for j in range(NS + 1)], [N(i, j) for j in range(NS + 1)], 0.16, 0.15, 0.45)
    # 판
    in_band = lambda i: any(abs(i - r) <= 1 for r in band_rows)
    grid = [[bm_m.verts.new(P(i, j)) for j in range(NS + 1)] for i in range(len(rows))]
    for i in range(len(rows) - 1):
        for j in range(NS):
            f = bm_m.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            c = (P(i, j) + P(i + 1, j + 1)) / 2
            if c.z - zbase < EYE: mi = 1                    # 눈높이: 투명 유리
            elif in_band(i): mi = 0                           # 띠 구간: 한지 막
            else: mi = 1 if int(j * n_sal / NS) % 2 == 0 else 0   # 세로살 사이: 막·유리 번갈아
            f.material_index = mi

    def to_obj(name, bm, mats):
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
        o = bpy.data.objects.new(name, me); coll.objects.link(o)
    to_obj(f"PR_VC_{tg['key']}_Frame", bm_f, [M_FRAME])
    to_obj(f"PR_VC_{tg['key']}_Sal", bm_s, [M_FIN])
    to_obj(f"PR_VC_{tg['key']}_Panels", bm_m, [M_MEMB, M_GLASS])
    for n in (tg["panels"], tg["ribs"]):
        o = bpy.data.objects.get(n)
        if o: o.hide_render = o.hide_viewport = True
    print(tg["label"], ":", len(rows), "단면,", nbay, "칸,", n_sal, "세로살, 길이", round(total), "m")


for tg in TARGETS:
    build(tg)
