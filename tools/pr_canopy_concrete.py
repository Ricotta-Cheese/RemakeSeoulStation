"""
4안: 그늘 지붕을 '역사 긴 방향으로 펼친 병풍' 콘크리트 접판 지붕으로 다시 짓는 스크립트. 여러 번 실행해도 됨.

단게 겐조가 일본 목조를 철근 콘크리트로 옮겼듯, 한국의 병풍과 띠살 창호를 콘크리트 접판(folded plate)으로 옮겼어요.
1~3안의 둥근 격자 돔과 다르고, 방사 대칭(경기장 같은 인상)도 피했어요.

  - 산·골 선이 동서로 지나가고 남북(지붕 긴 방향)으로 16폭이 접혀 이어져요. 실제 병풍을 편 모습.
  - 대칭 깨기: 지붕 전체가 서쪽(서부역) +30m → 동쪽(광장) +38m로 들려 광장 쪽으로 열려요.
      접힘 깊이는 가운데가 얕고(±3m) 남북 끝으로 갈수록 깊어져요(±6m).
  - 평면은 둥근 사각형(초타원)이라 둥근 경기장 인상이 덜해요.
  - 폭마다 띠살: 긴 콘크리트 세로살 핀이 동서로, 가로띠(4줄씩)는 서·중·동 세 군데에서 모든 폭을 가로질러 이어져요.
      사이는 한지 막(밤에 빛남), 오큘러스 위의 폭 구간만 유리라 빛이 들어요.
  - 받침: 골 선 아래 공포 받침 콘크리트 기둥(오큘러스는 피함), 둘레는 콘크리트 기둥 + 처마를 따라가는 유리벽,
    네 방향은 출입구.
  - 원래 돔(격자·판·나무 기둥·테두리 보·외벽 유리·멀리언)은 숨겨요. 1~3안 스크립트를 다시 돌리면 돌아와요.
  - MODE = 'FOLD'(4안-a: 접힌 병풍) / 'TWIST'(4안-b: 비틀린 리본).
      TWIST: 폭 하나하나가 긴 리본이 되어 서→동으로 천천히 비틀려요(최대 약 35°, 지붕 길이 동안 반 바퀴 남짓).
      이웃 리본은 비틀림 위상이 45°씩 어긋나 위에서 보면 나선(DNA)처럼 굽이쳐 흐르고,
      리본 가운데 높이도 같은 위상으로 오르내려요. 리본 사이 높이 차는 세로 유리 고창으로 채워 빛이 들어요.
  - 결과는 04_Proposal/PR_Canopy_Folded 컬렉션(웹 내보내기 대상 아님). 웹으로는 내보내지 않음.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

CX, CY = -95.0, -115.0
AX, AY = 79.0, 108.0          # 평면 반지름(동서, 남북)
SQ = 4.0                      # 초타원 지수(2 = 타원, 클수록 사각형)
FLOOR = 16.0
MODE = 'TWIST'                # 'FOLD' = 접힌 병풍, 'TWIST' = 비틀린 리본
NF = 16                       # 접힌 폭(리본) 수
TW_MAX = math.radians(35)     # 리본 최대 기울기
TW_CYC = 0.6                  # 서→동 동안 비틀림 주기 수(낮을수록 천천히)
TW_PH = math.pi / 4           # 이웃 리본 사이 위상 차
HELIX_H = 5.0                 # 리본 가운데 높이 오르내림
Z_WEST, Z_EAST = 30.0, 38.0   # 서쪽·동쪽 기준 높이
AMP_MID, AMP_END = 3.0, 6.0   # 접힘 깊이(가운데 → 남북 끝)
N_SAL = 6                     # 폭 하나의 세로살 칸
BAND_U = (0.16, 0.5, 0.84)    # 가로띠 위치(서 0 → 동 1)
BAND_N, BAND_GAP = 4, 1.2
OPEN_DEG = 7.0
OC_RX, OC_RY = 40.0, 54.0     # 오큘러스(유리 구간·기둥 피할 범위)
TAU = 2 * math.pi

# ------------------------------------------------------------------ 원래 돔·이전 4안 정리
for n in ("PR_Canopy_Glass", "PR_Canopy_Ribs", "PR_Canopy_TreeColumns", "PR_Canopy_EdgeBeam",
          "PR_Canopy_FacadeGlass", "PR_Canopy_Mullions"):
    o = bpy.data.objects.get(n)
    if o: o.hide_render = o.hide_viewport = True
for n in ("PR_CanopyChangho", "PR_CanopyChangho_B", "PR_CanopyChangho_C"):
    c = bpy.data.collections.get(n)
    if c: c.hide_render = c.hide_viewport = True
for n in ("PR_CanopyChangho_D", "PR_Canopy_Concrete"):
    c = bpy.data.collections.get(n)
    if c:
        for o in list(c.objects):
            me = o.data; bpy.data.objects.remove(o, do_unlink=True)
            if me and me.users == 0: bpy.data.meshes.remove(me)
        bpy.data.collections.remove(c)
coll = bpy.data.collections.get("PR_Canopy_Folded")
if coll:
    for o in list(coll.objects):
        me = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0: bpy.data.meshes.remove(me)
else:
    coll = bpy.data.collections.new("PR_Canopy_Folded")
    bpy.data.collections["04_Proposal"].children.link(coll)
coll.hide_render = coll.hide_viewport = False

# ------------------------------------------------------------------ 평면·높이 함수
YMIN, YMAX = CY - AY, CY + AY
W = (YMAX - YMIN) / NF


def x_span(y):
    """높이 y에서 둥근 사각형 평면의 서·동 끝 x"""
    v = min(1.0, abs(y - CY) / AY)
    h = AX * (1 - v ** SQ) ** (1 / SQ)
    return CX - h, CX + h


def outline(th):
    c, s = math.cos(th), math.sin(th)
    return (CX + AX * math.copysign(abs(c) ** (2 / SQ), c), CY + AY * math.copysign(abs(s) ** (2 / SQ), s))


def tri(y):
    """+1 = 산, -1 = 골"""
    p = ((y - YMIN) / W) % 2.0
    return 1 - 2 * (p if p <= 1 else 2 - p)


def amp(y):
    v = abs(y - CY) / AY
    return AMP_MID + (AMP_END - AMP_MID) * v * v


def strip_of(y):
    return max(0, min(NF - 1, int((y - YMIN) / W)))


def Z(x, y, k=None):
    """k: 리본 번호(TWIST에서 경계선은 어느 리본 쪽인지 정해야 해서)"""
    u = (x - (CX - AX)) / (2 * AX)
    base = Z_WEST + (Z_EAST - Z_WEST) * u
    if MODE == 'FOLD':
        return base + amp(y) * tri(y)
    if k is None: k = strip_of(y)
    ph = TAU * TW_CYC * u + k * TW_PH
    yc = YMIN + W * (k + 0.5)
    return base + HELIX_H * math.sin(ph) + (y - yc) * math.tan(TW_MAX * math.cos(ph))


def P(u, y, k=None):
    """u: 0 = 서쪽 끝, 1 = 동쪽 끝(그 y에서)"""
    xl, xr = x_span(y)
    x = xl + (xr - xl) * u
    return Vector((x, y, Z(x, y, k)))


def nrm(u, y, k=None):
    if k is None: k = strip_of(y)
    e = 0.3
    a = P(min(1, u + 0.002), y, k) - P(max(0, u - 0.002), y, k)
    b = P(u, y + e, k) - P(u, y - e, k)
    n = a.cross(b).normalized()
    return n if n.z > 0 else -n


# ------------------------------------------------------------------ 재질
def concrete(name, c0, c1):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'): nt.nodes.remove(n)
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = 0.85
    b.inputs['Emission Strength'].default_value = 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.5; nz.inputs['Detail'].default_value = 6.0
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 0.4; wv.inputs['Distortion'].default_value = 0.2
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'
    nt.links.new(wv.outputs['Fac'], mx.inputs[0]); mx.inputs[1].default_value = 0.12
    nt.links.new(nz.outputs['Fac'], mx.inputs[2])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*c0, 1); ramp.color_ramp.elements[1].color = (*c1, 1)
    nt.links.new(mx.outputs[0], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def plain(name, base, rough=0.6, emis=None, alpha=1.0, trans=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Alpha'].default_value = alpha
    b.inputs['Transmission Weight'].default_value = trans
    if emis: b.inputs['Emission Color'].default_value = (*emis, 1)
    b.inputs['Emission Strength'].default_value = 0.0
    if alpha < 1: m.surface_render_method = 'BLENDED'
    return m


M_FRAME = concrete("MPR_CF_Concrete", (0.44, 0.43, 0.41), (0.62, 0.61, 0.58))
M_FIN = concrete("MPR_CF_Fin", (0.55, 0.54, 0.51), (0.72, 0.71, 0.68))
M_MEMB = plain("MPR_CH_Membrane", (0.95, 0.94, 0.91), 0.7, emis=(1.0, 0.86, 0.66), trans=0.35)
M_GLASS = plain("MPR_CC_Glass", (0.5, 0.62, 0.66), 0.05, alpha=0.35)


# ------------------------------------------------------------------ 부재 도우미
def sweep3d(bm, pts, nrms, width, up, down):
    n = len(pts)
    if n < 2: return
    ring = []
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        t = (b - a).normalized()
        side = t.cross(nrms[i]).normalized() * (width / 2)
        p = pts[i]
        ring.append([bm.verts.new(p - side - nrms[i] * down), bm.verts.new(p + side - nrms[i] * down),
                     bm.verts.new(p + side + nrms[i] * up), bm.verts.new(p - side + nrms[i] * up)])
    for i in range(n - 1):
        r0, r1 = ring[i], ring[i + 1]
        for k in range(4): bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(tuple(reversed(ring[0]))); bm.faces.new(tuple(ring[-1]))


def box(bm, c, size, yaw=0.0):
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Diagonal((*size, 1)))


def in_oculus(x, y):
    return ((x - CX) / OC_RX) ** 2 + ((y - CY) / OC_RY) ** 2 < 1


US = [i / 40 for i in range(41)]
bm_f, bm_s, bm_m, bm_g = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
fold_y = [YMIN + W * k for k in range(NF + 1)]

# 접힌 선(산·골) / 리본 가장자리: 동서로 지나가는 굵은 울거미
if MODE == 'FOLD':
    for k in range(1, NF):
        y = fold_y[k]
        pts = [P(u, y) for u in US]
        ns = [((nrm(u, y - 0.5) + nrm(u, y + 0.5)).normalized()) for u in US]
        sweep3d(bm_f, pts, ns, 1.0 if tri(y) > 0 else 1.3, 0.5, 1.6)
else:
    for k in range(NF):
        for y in (fold_y[k] + 0.45, fold_y[k + 1] - 0.45):
            if not (YMIN + 1 < y < YMAX - 1): continue
            sweep3d(bm_f, [P(u, y, k) for u in US], [nrm(u, y, k) for u in US], 0.8, 0.5, 1.4)
        # 리본 사이 세로 유리 고창
        if k < NF - 1:
            y = fold_y[k + 1]
            for i in range(len(US) - 1):
                a0, a1 = P(US[i], y, k), P(US[i + 1], y, k)
                b0, b1 = P(US[i], y, k + 1), P(US[i + 1], y, k + 1)
                f = bm_g.faces.new([bm_g.verts.new(a0), bm_g.verts.new(a1), bm_g.verts.new(b1), bm_g.verts.new(b0)])

# 둘레 처마 보
ths = [TAU * i / 360 for i in range(361)]
pts = [Vector((*outline(t), Z(*outline(t)))) for t in ths]   # TWIST에서는 리본 경계에서 단이 짐
sweep3d(bm_f, pts, [Vector((0, 0, 1))] * len(pts), 1.2, 0.6, 1.6)

# 폭마다 띠살 + 막/유리
for k in range(NF):
    y0, y1 = fold_y[k], fold_y[k + 1]
    ys = [y0 + (y1 - y0) * j / N_SAL for j in range(N_SAL + 1)]
    # 세로살(동서로 긴 핀)
    for y in ys[1:-1]:
        sweep3d(bm_s, [P(u, y, k) for u in US], [nrm(u, y, k) for u in US], 0.16, 0.25, 0.75)
    # 가로띠: 서·중·동에서 폭을 가로지르는 4줄
    for ub in BAND_U:
        for j in range(BAND_N):
            for_y = [y0 + (y1 - y0) * i / 8 for i in range(9)]
            uu = None
            pts_b, ns_b = [], []
            for y in for_y:
                xl, xr = x_span(y)
                x = CX - AX + 2 * AX * ub + (j - (BAND_N - 1) / 2) * BAND_GAP
                if not (xl + 1 <= x <= xr - 1): continue
                u = (x - xl) / (xr - xl)
                pts_b.append(P(u, y, k)); ns_b.append(nrm(u, y, k))
            sweep3d(bm_s, pts_b, ns_b, 0.22, 0.25, 0.75)
    # 막·유리 판
    rows = [y0 + (y1 - y0) * j / 6 for j in range(7)]
    grid = [[(bm_m.verts.new(P(u, y, k)), P(u, y, k)) for u in US] for y in rows]
    for j in range(6):
        for i in range(len(US) - 1):
            q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            c = sum((v[1] for v in q), Vector()) / 4
            f = bm_m.faces.new([v[0] for v in q])
            if f.normal.z < 0: f.normal_flip()
            f.material_index = 1 if in_oculus(c.x, c.y) else 0

# 골 선 아래 공포 받침 기둥(오큘러스와 지붕 밖은 피함)
col_lines = [(fold_y[k], None) for k in range(1, NF) if tri(fold_y[k]) < 0] if MODE == 'FOLD' else \
    [(YMIN + W * (k + 0.5), k) for k in range(1, NF - 1, 2)]
for (y, kk) in col_lines:
    xl, xr = x_span(y)
    for x in (-160.0, -95.0, -30.0):
        if not (xl + 6 < x < xr - 6) or in_oculus(x, y) or abs(y - CY) < OC_RY + 4 and abs(x - CX) < OC_RX + 4: continue
        top = Z(x, y, kk) - 1.6
        tiers, th = 3, 0.8
        zc = top - tiers * th
        bmesh.ops.create_cone(bm_f, cap_ends=True, cap_tris=False, segments=4,
                              radius1=1.8 / math.sqrt(2), radius2=1.25 / math.sqrt(2), depth=zc - FLOOR,
                              matrix=Matrix.Translation((x, y, (FLOOR + zc) / 2)) @ Matrix.Rotation(math.pi / 4, 4, 'Z'))
        for t in range(tiers):
            L = 2.6 + 1.8 * t
            box(bm_f, Vector((x, y, zc + th * (t + 0.5))), (L, 1.25, th))
            box(bm_f, Vector((x, y, zc + th * (t + 0.5))), (1.25, L, th))

# 둘레: 콘크리트 기둥(약 9m마다) + 처마 아래 유리벽, 네 방향 출입구
acc, nxt = 0.0, 0.0
for i in range(360):
    a, b = Vector((*outline(ths[i]), 0)), Vector((*outline(ths[i + 1]), 0))
    seg = (b - a).length
    deg = 360.0 * (i + 0.5) / 360
    door = min(abs(((deg - d0) + 180) % 360 - 180) for d0 in (0, 90, 180, 270)) < OPEN_DEG
    while nxt <= acc + seg:
        t = (nxt - acc) / seg
        x, y = a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t
        z = Z(x, y) - 1.6
        box(bm_f, Vector((x, y, (FLOOR + z) / 2)), (1.1, 1.1, z - FLOOR), math.atan2(b.y - a.y, b.x - a.x))
        nxt += 9.0
    if not door:
        za, zb = Z(a.x, a.y) - 1.6, Z(b.x, b.y) - 1.6
        bm_g.faces.new([bm_g.verts.new((a.x, a.y, FLOOR)), bm_g.verts.new((b.x, b.y, FLOOR)),
                        bm_g.verts.new((b.x, b.y, zb)), bm_g.verts.new((a.x, a.y, za))])
    acc += seg


def to_obj(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    return o


to_obj("PR_CF_Frame", bm_f, [M_FRAME])
to_obj("PR_CF_Sal", bm_s, [M_FIN])
to_obj("PR_CF_Panels", bm_m, [M_MEMB, M_GLASS])
to_obj("PR_CF_Glass", bm_g, [M_GLASS])

t = bpy.data.texts["pr_night.py"]
src = t.as_string()
if "MPR_CH_Membrane" not in src:
    src = src.rstrip('\n') + "\n    m=bpy.data.materials.get('MPR_CH_Membrane')\n" + \
        "    if m:\n" + \
        "        b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); b.inputs['Emission Strength'].default_value=0.9 if on else 0.0\n"
    t.from_string(src)
print("linear folded canopy:", NF, "folds, width", round(W, 1), "m")
