"""
서쪽 가장자리(서부역 쪽) 정돈: 새 서울역 서쪽 유리벽과 차도 사이 빈 땅을 '서쪽 보행 마당'으로. 여러 번 실행해도 됨.

  - 유리벽(웹 x=-189.5)과 차도 연석 사이(폭 10~18m)에 화강석 포장 + 차도 쪽 연석 띠.
    옆길이 들어오는 곳(차도가 유리벽까지 닿는 곳)은 비워 둠.
  - 연석을 따라 15m마다 가로수와 가로등(옥상 가로등과 같은 기둥 + 빛 고리)을 번갈아.
    가로등 점광원은 밤에만(PR_NightLights/NL_WestEdge).
  - 덱에서 내려오는 서쪽 계단 두 곳(웹 z -40~2, 238~280)이 이 포장 마당에 내려앉아요.
  - 결과는 04_Proposal/PR_WestEdge 컬렉션(웹 전체 내보내기 대상 아님). 웹으로는 말씀하실 때만.
좌표: 웹 (x, y, z) = Blender (x, -y_b... ) → Blender (x, y, z) = 웹 (x, -z, y). 이 스크립트는 Blender 좌표로 계산.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

FACADE_X = -189.5            # 서쪽 유리벽
Y0, Y1 = -330.0, 175.0       # 범위(Blender y = -웹 z)
STEP = 2.0
TREE_EVERY = 15.0


def fresh(name, parent):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            d = o.data; bpy.data.objects.remove(o, do_unlink=True)
            if d is not None and d.users == 0:
                if isinstance(d, bpy.types.Mesh): bpy.data.meshes.remove(d)
                elif isinstance(d, bpy.types.Light): bpy.data.lights.remove(d)
    else:
        c = bpy.data.collections.new(name); parent.children.link(c)
    return c


coll = fresh("PR_WestEdge", bpy.data.collections["04_Proposal"])
night = fresh("NL_WestEdge", bpy.data.collections["PR_NightLights"])

# 차도·보도 표면
bm0 = bmesh.new()
for n in ("G_Roads_Asphalt", "G_Roads_Curb"):
    o = bpy.data.objects.get(n)
    if not o: continue
    t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world)
    me = bpy.data.meshes.new("_t"); t.to_mesh(me); t.free(); bm0.from_mesh(me); bpy.data.meshes.remove(me)
roads = BVHTree.FromBMesh(bm0)


def road_edge(y):
    """y에서 유리벽 서쪽으로 처음 차도가 나오는 x(없으면 None)"""
    x = FACADE_X - 0.5
    while x > FACADE_X - 40:
        if roads.ray_cast(Vector((x, y, 10)), Vector((0, 0, -1)), 20)[0] is not None:
            return x + 0.4
        x -= 0.5
    return None


ys, edges = [], []
y = Y0
while y <= Y1:
    ys.append(y); edges.append(road_edge(y)); y += STEP

M_PAVE = bpy.data.materials["MPR_Paving_Granite"]
M_CURB = bpy.data.materials["MPR_Granite_Light"]
M_POLE = bpy.data.materials.get("MPR_WebDarkMetal")
M_RING = bpy.data.materials.get("MPR_WebLampRing")

# 포장(연석까지 폭이 3m 이상인 구간만, 옆길 입구는 비움)
bm_p, bm_c = bmesh.new(), bmesh.new()
spots = []
for i in range(len(ys) - 1):
    e0, e1 = edges[i], edges[i + 1]
    if e0 is None or e1 is None or FACADE_X - e0 < 3 or FACADE_X - e1 < 3: continue
    a, b = ys[i], ys[i + 1]
    v = [bm_p.verts.new(p) for p in ((e0, a, 0.15), (FACADE_X, a, 0.15), (FACADE_X, b, 0.15), (e1, b, 0.15))]
    bm_p.faces.new(v)
    # 연석 띠(폭 0.4, 높이 0.2)
    c = [bm_c.verts.new(p) for p in ((e0, a, 0.2), (e0 + 0.4, a, 0.2), (e1 + 0.4, b, 0.2), (e1, b, 0.2))]
    bm_c.faces.new(c)
    spots.append(((e0 + e1) / 2, (a + b) / 2))
bmesh.ops.solidify(bm_p, geom=bm_p.faces[:], thickness=0.15)


def to_obj(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    return o


to_obj("PR_WE_Paving", bm_p, M_PAVE)
to_obj("PR_WE_Curb", bm_c, M_CURB)

# 가로수·가로등: 연석 안쪽 2.5m, 15m마다 번갈아
trees = [bpy.data.objects.get(n) for n in ("PRA_Tree_0", "PRA_Tree_1", "PRA_Tree_2", "PRA_Tree_3")]
trees = [t for t in trees if t]
bm_pole, bm_ring = bmesh.new(), bmesh.new()
acc, nxt, k = 0.0, 0.0, 0
prev = None
for (ex, y) in spots:
    if prev is not None: acc += abs(y - prev)
    prev = y
    if acc < nxt: continue
    nxt += TREE_EVERY / 2
    x = ex + 2.5
    if k % 2 == 0 and trees:
        src = trees[k // 2 % len(trees)]
        o = bpy.data.objects.new(f"PR_WE_Tree", src.data)
        mn = min((v.co.z for v in src.data.vertices), default=0)
        o.location = (x, y, 0.3 - mn)
        o.rotation_euler = (0, 0, (k * 1.7) % 6.28)
        coll.objects.link(o)
    else:
        H = 4.6
        bmesh.ops.create_cone(bm_pole, cap_ends=True, segments=8, radius1=0.09, radius2=0.075, depth=H,
                              matrix=Matrix.Translation((x, y, 0.3 + H / 2)))
        rr, r = 0.42, 0.045
        ring = []
        for a in range(32):
            t = 2 * math.pi * a / 32
            ring.append([bm_ring.verts.new((x + (rr + r * math.cos(s)) * math.cos(t), y + (rr + r * math.cos(s)) * math.sin(t), 0.3 + H + r * math.sin(s)))
                         for s in [2 * math.pi * j / 6 for j in range(6)]])
        for a in range(32):
            p0, p1 = ring[a], ring[(a + 1) % 32]
            for j in range(6): bm_ring.faces.new((p0[j], p0[(j + 1) % 6], p1[(j + 1) % 6], p1[j]))
        ld = bpy.data.lights.new("NL_WE_Lamp", 'POINT'); ld.energy = 260; ld.color = (1.0, 0.82, 0.58)
        ld.shadow_soft_size = 0.4; ld.use_shadow = False
        lo = bpy.data.objects.new("NL_WE_Lamp", ld); lo.location = (x, y, 0.3 + H - 0.2); night.objects.link(lo)
    k += 1
if M_POLE: to_obj("PR_WE_LampPoles", bm_pole, M_POLE)
if M_RING: to_obj("PR_WE_LampRings", bm_ring, M_RING)
bm0.free()
print("west edge:", len(spots), "paving strips,", k, "trees+lamps")
