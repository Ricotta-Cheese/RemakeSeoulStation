"""
웹(web/src)에서 추가한 제안안 디테일을 Blender 제안안 파일(SeoulStation_Proposal.blend)에 똑같이 만들어 넣는 스크립트.
여러 번 실행해도 됨(만든 것을 지우고 다시 만듦). Blender Scripting 탭에서 Run Script.

  - 옥상 정원 가로등 76개(web/src/night_lamps.json 위치) + 밤 점광원
  - 광장 물벽 둘레 푸른 밤 조명, 아트리움(선큰) 호박색 물커튼·물길·테두리 빛
  - 버스환승센터 내부: 1층 다운라이트, 승강장 청록 LED 줄, 2층 펜던트, 양 끝 펜던트
  - 덱 아래 천장 조명: 연속 LED 띠(PR_Side_SoffitLights) 숨기고 3.2m 슬림 바를 5m 간격으로(오큘러스 위는 비움)
  - 오큘러스 물커튼(PR_OC_WaterCurtain) 숨기고 곡면 전광판 20장(이미지: web/tools/train_ring_1830.png)
  - 그늘 지붕 창호 격자는 따로 pr_canopy_changho.py
낮에 보이는 기구는 04_Proposal/PR_WebSync, 밤 조명은 PR_NightLights/NL_WebSync 컬렉션.
두 컬렉션은 export_glb.py의 LAYERS에 없어서 웹으로 내보내지 않음(웹은 같은 것을 코드로 그림).
밤 전환은 pr_night.py의 night(True/False)가 함께 처리.

좌표: 웹 (x, y, z) = Blender (x, z, -y)  ->  Blender (x, y, z) = 웹 (x, -z, y)
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(bpy.data.filepath)
TOOLS = os.path.join(ROOT, "web", "tools")
SRC = os.path.join(ROOT, "web", "src")


def B(x, y, z):  # 웹 좌표 -> Blender 좌표
    return Vector((x, -z, y))


def fresh_collection(name, parent):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh): bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Light): bpy.data.lights.remove(data)
    else:
        c = bpy.data.collections.new(name)
        parent.children.link(c)
    return c


FIX = fresh_collection("PR_WebSync", bpy.data.collections["04_Proposal"])
NIGHT = fresh_collection("NL_WebSync", bpy.data.collections["PR_NightLights"])


def pmat(name, base=(0.8, 0.8, 0.8), emis=None, strength=0.0, metal=0.0, rough=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = strength
    else:
        b.inputs['Emission Strength'].default_value = 0.0
    return m


def mesh_obj(name, bm, mat, coll=FIX):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def add_cyl(bm, center, r, h, segs=12):
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=h,
                          matrix=Matrix.Translation(center + Vector((0, 0, h / 2))))


def add_box(bm, center, size, rot_z=0.0):
    m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((*size, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_torus(bm, center, R, r, seg=48, sides=6):
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            ring.append(bm.verts.new(center + Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))))
        rings.append(ring)
    for i in range(seg):
        a, c = rings[i], rings[(i + 1) % seg]
        for j in range(sides):
            bm.faces.new((a[j], a[(j + 1) % sides], c[(j + 1) % sides], c[j]))


def point_light(name, loc, color, power, radius=0.3):
    ld = bpy.data.lights.new(name, 'POINT')
    ld.color = color; ld.energy = power; ld.shadow_soft_size = radius
    ld.use_shadow = False
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    NIGHT.objects.link(o)
    return o


WARM = (1.0, 0.82, 0.58)
COOL = (0.85, 0.93, 1.0)
AQUA = (0.45, 0.9, 1.0)
TEAL = (0.25, 1.0, 0.8)
AMBER = (1.0, 0.66, 0.32)
DARK = pmat("MPR_WebDarkMetal", (0.16, 0.17, 0.19), metal=0.6, rough=0.4)

# ------------------------------------------------------------------ 옥상 정원 가로등
lamps = json.load(open(os.path.join(SRC, "night_lamps.json")))
H = 4.6
bm_pole, bm_ring, bm_cap = bmesh.new(), bmesh.new(), bmesh.new()
for (x, y, z) in lamps:
    p = B(x, y, z)
    add_cyl(bm_pole, p, 0.075, H, 8)
    add_torus(bm_ring, p + Vector((0, 0, H)), 0.42, 0.045, 32, 6)
    add_cyl(bm_cap, p + Vector((0, 0, H + 0.04)), 0.34, 0.04, 20)
    point_light("NL_WS_RoofLamp", p + Vector((0, 0, H - 0.2)), WARM, 260, 0.4)
mesh_obj("PR_WS_RoofLamp_Poles", bm_pole, DARK)
mesh_obj("PR_WS_RoofLamp_Rings", bm_ring, pmat("MPR_WebLampRing", (1, 0.95, 0.85), WARM, 2.0))
mesh_obj("PR_WS_RoofLamp_Caps", bm_cap, DARK)

# ------------------------------------------------------------------ 물: 광장 물벽(푸른빛) / 아트리움(호박색)
curtain = bpy.data.materials["MPR_WaterCurtain"]
water = bpy.data.materials["MPR_Water"]
amb_c = bpy.data.materials.get("MPR_AtriumCurtain") or curtain.copy()
amb_c.name = "MPR_AtriumCurtain"
amb_w = bpy.data.materials.get("MPR_AtriumWater") or water.copy()
amb_w.name = "MPR_AtriumWater"
for m in (amb_c, amb_w):
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Emission Color'].default_value = (*AMBER, 1)
    b.inputs['Emission Strength'].default_value = 0.35 if m is amb_c else 0.0
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith("PR_Atrium"):
        for slot in o.material_slots:
            if slot.material == curtain: slot.material = amb_c
            elif slot.material == water: slot.material = amb_w

cells = {}
for o in bpy.data.objects:
    if o.type != 'MESH' or o.name.startswith(("PR_Atrium", "PR_OC_")): continue
    if not any(s.material == curtain for s in o.material_slots): continue
    M = o.matrix_world
    for i, v in enumerate(o.data.vertices):
        if i % 3: continue
        w = M @ v.co
        if w.z > 12: continue
        k = (round(w.x / 8), round(w.y / 8))
        c = cells.setdefault(k, [0, 0, 1e9, 0])
        c[0] += w.x; c[1] += w.y; c[2] = min(c[2], w.z); c[3] += 1
for (sx, sy, mz, n) in cells.values():
    point_light("NL_WS_Water", Vector((sx / n, sy / n, mz + 1.2)), AQUA, 420, 2.5)

# 아트리움 테두리 빛 + 안쪽 호박색 조명
bm = bmesh.new()
add_torus(bm, B(48, 1.15, 48), 18.15, 0.05, 160, 6)
mesh_obj("PR_WS_AtriumRim", bm, pmat("MPR_WebAtriumRim", (0.75, 0.72, 0.68), AMBER, 1.5))
for (x, y, z, pw) in [(48, -4.2, 44, 900), (40, -2.2, 52, 450), (56, -2.2, 52, 450), (48, -0.8, 58, 450), (48, 1.6, 48, 700)]:
    point_light("NL_WS_Atrium", B(x, y, z), AMBER, pw, 3.0)

# ------------------------------------------------------------------ 버스환승센터 내부
bm_d = bmesh.new()
for x in (115.5, 131, 147.5):
    for z in range(-94, 63, 8):
        add_cyl(bm_d, B(x, 4.34, z), 0.35, 0.02, 20)
        point_light("NL_WS_BusDown", B(x, 4.0, z), COOL, 160, 0.3)
mesh_obj("PR_WS_BusDownlights", bm_d, pmat("MPR_WebDownlight", (0.95, 0.97, 1.0), COOL, 3.0))

bm_s = bmesh.new()
for x in (119.3, 126.7, 135.3, 142.7):
    add_box(bm_s, B(x, 0.33, 6), (0.14, 148, 0.05))
mesh_obj("PR_WS_BusLEDStrips", bm_s, pmat("MPR_WebLEDTeal", (0.75, 0.78, 0.78), TEAL, 2.0))
for x in (119.3, 126.7, 135.3, 142.7):
    for k in range(0, 19, 2):
        point_light("NL_WS_BusLED", B(x, 0.6, -68 + k * 8), TEAL, 40, 0.2)

bm_p, bm_c = bmesh.new(), bmesh.new()
pend = [(x, 9.6, z, 1.0) for x in (124, 134, 144) for z in [-46 + 8.5 * k for k in range(13)]]
pend += [(x, 11.0, z, 1.2) for x in (121, 135, 149) for z in (72, 82, -102)]
for (x, y, z, s) in pend:
    add_cyl(bm_p, B(x, y - 0.45 * s, z), 0.45 * s, 0.9 * s, 20)
    add_cyl(bm_c, B(x, y + 0.45 * s, z), 0.015, 5.0, 4)
    point_light("NL_WS_BusPendant", B(x, y - 0.6, z), WARM, 320 if y < 10 else 600, 0.45)
mesh_obj("PR_WS_BusPendants", bm_p, pmat("MPR_WebPendant", (1, 0.93, 0.82), WARM, 2.5))
mesh_obj("PR_WS_BusPendantCords", bm_c, DARK)

# ------------------------------------------------------------------ 덱 아래 천장: 슬림 바
old = bpy.data.objects.get("PR_Side_SoffitLights")
if old: old.hide_render = True; old.hide_viewport = True
LINES = [(8, 150, 328), (-13, -173, 328), (-38, 27, 328), (-62, -173, 328), (-80, -173, 328), (-97, -173, 328), (-115, -173, 328)]
# 위에 덱 바닥판이 실제로 있는 곳에만(덱이 잘린 구 서울역 뒤 등에서 허공에 뜨지 않게)
from mathutils.bvhtree import BVHTree
_bm = bmesh.new()
for _n in ("PR_Deck_Slab", "PR_Deck_SlabExt"):
    _o = bpy.data.objects.get(_n)
    if _o:
        _t = bmesh.new(); _t.from_mesh(_o.data); _t.transform(_o.matrix_world)
        _me = bpy.data.meshes.new("_tmp"); _t.to_mesh(_me); _t.free(); _bm.from_mesh(_me); bpy.data.meshes.remove(_me)
_slab = BVHTree.FromBMesh(_bm) if _bm.verts else None
def covered(x, zc):
    if _slab is None: return True
    return all(_slab.ray_cast(B(x, 13.9, zc + dz), Vector((0, 0, 1)), 1.5)[0] is not None for dz in (-1.5, 0, 1.5))
bm_b, bm_t = bmesh.new(), bmesh.new()
for (x, z0, z1) in LINES:
    z = z0 + 2
    while z + 3.2 <= z1:
        zc = z + 1.6
        if ((x + 95) / 42) ** 2 + ((zc - 115) / 56) ** 2 >= 1 and covered(x, zc):
            add_box(bm_b, B(x, 14.29, zc), (0.22, 3.2, 0.04))
            add_box(bm_t, B(x, 14.315, zc), (0.5, 3.6, 0.03))
        z += 5
mesh_obj("PR_WS_SoffitBars", bm_b, pmat("MPR_WebSoffitBar", (1.0, 0.96, 0.88), (1.0, 0.9, 0.74), 4.0))
mesh_obj("PR_WS_SoffitTrims", bm_t, DARK)

# ------------------------------------------------------------------ 오큘러스 곡면 전광판 20장
cur = bpy.data.objects.get("PR_OC_WaterCurtain")
if cur: cur.hide_render = True; cur.hide_viewport = True
CX, CZ, RX, RZ = -95.0, 115.0, 37.4, 51.2
Y0, Y1 = 9.2, 14.2
GAP, MUL = math.radians(6), math.radians(0.7)
N, COLS = 20, 10


def at(a, y, off=0.0):
    nx, nz = math.cos(a) / RX, math.sin(a) / RZ
    l = math.hypot(nx, nz)
    return B(CX + math.cos(a) * RX + nx / l * off, y, CZ + math.sin(a) * RZ + nz / l * off)


def strip(bm, uvl, a0, a1, y0, y1, off, outward, uvr, seg=14):
    vs = []
    for k in range(seg + 1):
        t = k / seg; a = a0 + (a1 - a0) * t
        vs.append((bm.verts.new(at(a, y0, off)), bm.verts.new(at(a, y1, off)),
                   (uvr[1] - (uvr[1] - uvr[0]) * t) if outward else (uvr[0] + (uvr[1] - uvr[0]) * t)))
    for k in range(seg):
        (b0, t0, u0), (b1, t1, u1) = vs[k], vs[k + 1]
        # 웹 좌표의 z를 뒤집었으므로(손잡이 반대) 감는 방향도 웹과 반대
        quad = (b0, t0, t1, b1) if outward else (b0, b1, t1, t0)
        f = bm.faces.new(quad)
        uvm = {b0: (u0, uvr[2]), t0: (u0, uvr[3]), b1: (u1, uvr[2]), t1: (u1, uvr[3])}
        for loop in f.loops: loop[uvl].uv = uvm[loop.vert]


def uv_of(slot):
    col, row = slot % COLS, slot // COLS
    return (col / COLS, (col + 1) / COLS, 1 - (row + 1) / 2, 1 - row / 2)


bm_scr, bm_frame, bm_edge = bmesh.new(), bmesh.new(), bmesh.new()
uv_s = bm_scr.loops.layers.uv.new("UVMap")
uv_f = bm_frame.loops.layers.uv.new("UVMap")
uv_e = bm_edge.loops.layers.uv.new("UVMap")
for q in range(4):
    qa0, qa1 = q * math.pi / 2 + GAP, (q + 1) * math.pi / 2 - GAP
    strip(bm_frame, uv_f, qa0 - 0.004, qa1 + 0.004, Y0 - 0.25, Y1 + 0.25, 0.0, True, (0, 1, 0, 1), 40)
    strip(bm_frame, uv_f, qa0 - 0.004, qa1 + 0.004, Y0 - 0.25, Y1 + 0.25, -0.01, False, (0, 1, 0, 1), 40)
    for (ya, yb, off, ow) in [(Y1 + 0.12, Y1 + 0.2, 0.12, True), (Y0 - 0.2, Y0 - 0.12, 0.12, True),
                               (Y1 + 0.12, Y1 + 0.2, -0.12, False), (Y0 - 0.2, Y0 - 0.12, -0.12, False)]:
        strip(bm_edge, uv_e, qa0, qa1, ya, yb, off, ow, (0, 1, 0, 1), 40)
    span = (qa1 - qa0) / 5
    for j in range(5):
        i = q * 5 + j
        a0, a1 = qa0 + span * j + MUL / 2, qa0 + span * (j + 1) - MUL / 2
        strip(bm_scr, uv_s, a0, a1, Y0, Y1, 0.1, True, uv_of(N - 1 - i))
        strip(bm_scr, uv_s, a0, a1, Y0, Y1, -0.1, False, uv_of(i))

img_path = os.path.join(TOOLS, "train_ring_1830.png")
scr = bpy.data.materials.get("MPR_WebTrainRing") or bpy.data.materials.new("MPR_WebTrainRing")
scr.use_nodes = True
nt = scr.node_tree
for n in list(nt.nodes):
    if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'): nt.nodes.remove(n)
b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
b.inputs['Base Color'].default_value = (0.02, 0.02, 0.03, 1)
b.inputs['Roughness'].default_value = 0.35
b.inputs['Emission Strength'].default_value = 1.4
if os.path.exists(img_path):
    im = bpy.data.images.load(img_path, check_existing=True)
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = im; tex.extension = 'EXTEND'; tex.location = (-400, 0)
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
mesh_obj("PR_WS_TrainRing_Screens", bm_scr, scr)
mesh_obj("PR_WS_TrainRing_Frame", bm_frame, DARK)
mesh_obj("PR_WS_TrainRing_Edges", bm_edge, pmat("MPR_WebRingEdge", (0.55, 0.85, 1.0), (0.55, 0.85, 1.0), 2.0))

# ------------------------------------------------------------------ pr_night.py 연동
t = bpy.data.texts["pr_night.py"]
src = t.as_string()
MARK = "    # websync:"
if MARK not in src:
    src = src.rstrip('\n') + '\n' + MARK + " 웹에서 옮겨 온 조명·창호(pr_websync.py)\n" + \
        "    for mn,day,nite in [('MPR_WebLampRing',2.0,12.0),('MPR_WaterCurtain',0.35,1.1),('MPR_AtriumCurtain',0.35,1.6),('MPR_AtriumWater',0.0,0.5),('MPR_WebAtriumRim',1.5,10.0),('MPR_WebDownlight',3.0,8.0),('MPR_WebLEDTeal',2.0,6.0),('MPR_WebPendant',2.5,9.0),('MPR_WebSoffitBar',4.0,8.0),('MPR_WebRingEdge',2.0,6.0),('MPR_WebTrainRing',1.4,1.1)]:\n" + \
        "        m=bpy.data.materials.get(mn)\n" + \
        "        if m:\n" + \
        "            b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); b.inputs['Emission Strength'].default_value=nite if on else day\n"
    t.from_string(src)

print("websync done:", len(lamps), "lamps,", len(cells), "water cells,", len(NIGHT.objects), "night lights,", len(FIX.objects), "fixtures")
