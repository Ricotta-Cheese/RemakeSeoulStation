"""
그늘 지붕(새 서울역)을 띠살 창호 문짝으로 덮는 스크립트. 여러 번 실행해도 됨.

  - 원래의 45° 마름모 목조 격자(PR_Canopy_Ribs)와 마름모 판(PR_Canopy_Glass)은 숨기고,
    같은 곡면 위에 띠살 문짝을 방사형으로 펼쳐 얹어요(장미창처럼).
  - 지붕 가장자리 곡선에 맞춘 동심 타원 링 3개 + 가운데 원형 유리(오큘러스 위 빛 우물).
      안쪽 링 24장, 가운데·바깥 링 48장. 칸 경계선이 링을 넘어 이어져 해살처럼 퍼져요.
  - 문짝 하나 = 띠살: 굵은 울거미 + 촘촘한 세로살(중심에서 바깥으로) +
      위·가운데·아래 세 군데의 가로살 띠(동심원 호로 휘어짐, 띠 안은 세로살이 두 배로 촘촘).
  - 띠 부분은 한지, 세로살 부분은 유리. 가운데·바깥 링은 한 장 건너 통한지라 빛이 별 모양으로 들어와요.
    밤에는 한지가 안에서 불을 켠 듯 빛나요(pr_night.py 연동).
  - 결과는 04_Proposal/PR_CanopyChangho(1안) 또는 PR_CanopyChangho_B(2안) 컬렉션에 있고(웹 전체 내보내기 LAYERS에는 없음),
    고른 안만 보이게 하고 다른 안은 숨겨요.
  - 1안(DESIGN='A'): 모든 문짝이 띠살.
    2안(DESIGN='B'): 띠살 문짝과 교살(바구니 짜임: 2:1 직사각형 두 장이 칸마다 가로·세로로 엇갈림) 문짝을 1:1로 번갈아.
      교살 문짝은 통한지, 띠살 문짝은 띠는 한지·세로살 부분은 유리.
    3안(DESIGN='C'): 모든 문짝이 교살. 교살 정사각 칸을 체크무늬로 채워요
      (세로로 긴 두 장 칸 = 유리, 가로로 긴 두 장 칸 = 한지).
  - ALL_HANJI=True면 유리 없이 전체를 한지로 덮어요(1~3안에 적용, 4안 제외).
    (폐기) 4안 초안(DESIGN='D', 같은 돔에 색만 바꾼 버전 — 실제 4안은 pr_canopy_concrete.py): 단게 겐조가 일본 목조를 철근 콘크리트로 옮긴 방식처럼, 띠살을 현대 콘크리트 구조로.
      울거미 = 깊은 프리캐스트 콘크리트 리브, 세로살 = 햇빛 가림 콘크리트 핀, 가로띠 = 핀을 묶는 보강재,
      한지 = 흰 반투명 막(가운데 빛 우물만 유리). 바깥 리브 끝은 처마 밖으로 내밀어 서까래 끝 리듬을 만들고,
      나무 모양 기둥 8개 대신 공포(처마 밑 받침)를 단순화한 층층 받침 콘크리트 기둥을 세워요.
  - 웹용 GLB(web/public/models/canopy_changho.glb)는 EXPORT_WEB=True일 때만 내보내요(기본은 안 내보냄).
"""
import bpy, bmesh, math, os, re
from mathutils import Vector
from mathutils.bvhtree import BVHTree

DESIGN = 'C'                      # 'A' 1안 띠살 / 'B' 2안 띠살+교살 / 'C' 3안 교살 ('D'는 폐기한 4안 초안 — 4안은 pr_canopy_concrete.py)
ALL_HANJI = True                  # True면 유리 없이 지붕 전체(가운데 빛 우물 포함)를 한지로 덮음
EXPORT_WEB = False                # True일 때만 웹용 GLB를 내보냄
SUF = {"A": "", "B": "_B", "C": "_C", "D": "_D"}[DESIGN]   # 오브젝트 이름 꼬리
CONCRETE = DESIGN == 'D'
HANJI_ONLY = ALL_HANJI and not CONCRETE
ROOT = os.path.dirname(bpy.data.filepath)
CX, CY = -95.0, -115.0            # 지붕 타원 중심(Blender 좌표)
AX, AY = 80.0, 110.0              # 타원 반지름(x, y) — 가장자리는 실제 곡면에서 다시 찾음
RINGS = [(0.14, 0.38, 24), (0.38, 0.66, 48), (0.66, 0.985, 48)]   # (안쪽 ρ, 바깥 ρ, 문짝 수)
N_SAL = 8                         # 문짝 하나의 세로살 칸 수
BANDS = [(0.06, 0.18), (0.44, 0.56), (0.82, 0.94)]                # 문짝 안 가로살 띠(r: 안쪽 0 → 바깥 1)
BAND_LINES = 4                    # 띠 하나의 가로살 수

shell = bpy.data.objects["PR_Canopy_Glass"]
ribs = bpy.data.objects["PR_Canopy_Ribs"]

# ------------------------------------------------------------------ 이전 버전 정리
for slot in shell.material_slots:
    if slot.material and slot.material.name.endswith("_Changho"):
        slot.material = bpy.data.materials[slot.material.name.replace("_Changho", "")]
for n in ("MPR_Canopy_Panel_Changho", "MPR_Glass_Tint_Changho"):
    m = bpy.data.materials.get(n)
    if m and m.users == 0: bpy.data.materials.remove(m)
for n in ("ChanghoUV",):
    g = bpy.data.node_groups.get(n)
    if g and g.users == 0: bpy.data.node_groups.remove(g)
im = bpy.data.images.get("Changho_Atlas")
if im and im.users == 0: bpy.data.images.remove(im)
t = bpy.data.texts["pr_night.py"]
t.from_string(re.sub(r"    m=bpy\.data\.materials\.get\('MPR_Canopy_Panel_Changho'\)\n    if m and m\.node_tree\.nodes\.get\('ChanghoNight'\).*\n", "", t.as_string()))

COLL = {"A": "PR_CanopyChangho", "B": "PR_CanopyChangho_B", "C": "PR_CanopyChangho_C", "D": "PR_CanopyChangho_D"}
coll = bpy.data.collections.get(COLL[DESIGN])
if coll:
    for o in list(coll.objects):
        me = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0: bpy.data.meshes.remove(me)
else:
    coll = bpy.data.collections.new(COLL[DESIGN])
    bpy.data.collections["04_Proposal"].children.link(coll)
# 고른 안만 보이게. 4안은 나무 모양 기둥도 숨기고 콘크리트 기둥으로
for k, n in COLL.items():
    c = bpy.data.collections.get(n)
    if c: c.hide_render = c.hide_viewport = (k != DESIGN)
for n in ("PR_Canopy_TreeColumns", "PR_Canopy_EdgeBeam"):   # 4안: 나무 기둥·흰 철골 테두리 보 대신 콘크리트
    o_ = bpy.data.objects.get(n)
    if o_: o_.hide_render = o_.hide_viewport = CONCRETE

# ------------------------------------------------------------------ 곡면과 가장자리
bm0 = bmesh.new(); bm0.from_mesh(shell.data); bm0.transform(shell.matrix_world)
bvh = BVHTree.FromBMesh(bm0)


def surf(x, y):
    hit = bvh.ray_cast(Vector((x, y, 80.0)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] is not None else None


# 각도마다 곡면이 끝나는 곳(타원 비율 t) 찾기
NA = 720
edge = []
for k in range(NA):
    th = 2 * math.pi * k / NA
    lo, hi = 0.5, 1.4
    for _ in range(22):
        mid = (lo + hi) / 2
        if surf(CX + mid * AX * math.cos(th), CY + mid * AY * math.sin(th)) is None: hi = mid
        else: lo = mid
    edge.append(lo)
# 들쭉날쭉하지 않게 이웃 각도와 부드럽게
for _ in range(6):
    edge = [(edge[k - 1] + 2 * edge[k] + edge[(k + 1) % NA]) / 4 for k in range(NA)]


def T(th):
    f = (th % (2 * math.pi)) / (2 * math.pi) * NA
    i = int(f) % NA
    return edge[i] + (edge[(i + 1) % NA] - edge[i]) * (f - int(f))


def P(rho, th):
    tt = rho * T(th)
    return (CX + tt * AX * math.cos(th), CY + tt * AY * math.sin(th))


# ------------------------------------------------------------------ 재질
def mat(name, base, rough=0.6, emis=None, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Alpha'].default_value = alpha
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = 0.0
    if alpha < 1: m.surface_render_method = 'BLENDED'
    return m


def concrete(name, c0, c1):
    """노출 콘크리트: 얼룩(노이즈) + 거푸집 결(가로 줄무늬)을 아주 옅게"""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'): nt.nodes.remove(n)
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = 0.82
    b.inputs['Emission Strength'].default_value = 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.6; nz.inputs['Detail'].default_value = 6.0
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 0.35; wv.inputs['Distortion'].default_value = 0.3
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'
    nt.links.new(wv.outputs['Fac'], mix.inputs[0]); mix.inputs[1].default_value = 0.15
    nt.links.new(nz.outputs['Fac'], mix.inputs[2])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*c0, 1); ramp.color_ramp.elements[1].color = (*c1, 1)
    nt.links.new(mix.outputs[0], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


if CONCRETE:
    M_FRAME = concrete("MPR_CH_Concrete", (0.42, 0.41, 0.39), (0.6, 0.59, 0.56))      # 리브·기둥(한 톤 진하게)
    M_SAL = concrete("MPR_CH_ConcreteFin", (0.64, 0.63, 0.6), (0.8, 0.79, 0.76))     # 핀(조금 밝게)
    M_HANJI = mat("MPR_CH_Membrane", (0.95, 0.94, 0.91), 0.7, emis=(1.0, 0.86, 0.66))
    bm_ = next(n for n in M_HANJI.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bm_.inputs['Transmission Weight'].default_value = 0.35   # 낮에 빛이 은은하게 비쳐 드는 막
else:
    M_FRAME = mat("MPR_CH_Frame", (0.3, 0.17, 0.08), 0.5)       # 울거미: 진한 나무
    M_SAL = mat("MPR_CH_Sal", (0.5, 0.31, 0.15), 0.55)          # 살
    M_HANJI = mat("MPR_CH_Hanji", (0.93, 0.89, 0.8), 0.85, emis=(1.0, 0.78, 0.5))
M_GLASS = mat("MPR_CH_Glass", (0.45, 0.6, 0.62), 0.05, alpha=0.45)


# ------------------------------------------------------------------ 곡선 부재
def beam_path(bm, pts, width, top, bot):
    """평면 곡선(점 목록)을 곡면에 얹은 각재. 곡면 밖으로 나가면 끊어요."""
    run = []

    def flush():
        if len(run) >= 2:
            ring = []
            for i, (x, y, z) in enumerate(run):
                a = run[max(0, i - 1)]; b = run[min(len(run) - 1, i + 1)]
                dx, dy = b[0] - a[0], b[1] - a[1]
                l = math.hypot(dx, dy) or 1.0
                sx, sy = -dy / l * width / 2, dx / l * width / 2
                ring.append([bm.verts.new((x + s * sx, y + s * sy, z + h)) for (s, h) in ((-1, bot), (1, bot), (1, top), (-1, top))])
            for i in range(len(ring) - 1):
                r0, r1 = ring[i], ring[i + 1]
                for k in range(4):
                    bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
            bm.faces.new(tuple(reversed(ring[0]))); bm.faces.new(tuple(ring[-1]))
        run.clear()
    for (x, y) in pts:
        z = surf(x, y)
        if z is None: flush(); continue
        run.append((x, y, z))
    flush()


def radial(rho0, rho1, th, step=1.6):
    L = (rho1 - rho0) * 100
    n = max(1, int(math.ceil(L / step)))
    return [P(rho0 + (rho1 - rho0) * i / n, th) for i in range(n + 1)]


def arc(rho, th0, th1, step=1.2):
    L = abs(th1 - th0) * rho * 100
    n = max(1, int(math.ceil(L / step)))
    return [P(rho, th0 + (th1 - th0) * i / n) for i in range(n + 1)]


def is_weave(ri, i):
    """2안에서 교살 문짝인지(띠살과 1:1로 번갈아)"""
    return DESIGN == 'C' or (DESIGN == 'B' and i % 2 == 1)


def weave_rows(r0, r1, n):
    """교살 정사각 칸의 반지름 방향 개수: 문짝 폭(가운데 기준)을 3칸으로 나눈 크기에 맞춤"""
    width = 2 * math.pi * (r0 + r1) / 2 * 100 / n
    return max(3, round((r1 - r0) * 100 / (width / 3)))


if CONCRETE:
    FR = dict(width=0.6, top=0.9, bot=-1.25)      # 프리캐스트 리브: 막 위·아래로 깊게(밖에서도 격자가 읽히게)
    SL = dict(width=0.15, top=0.4, bot=-0.62)     # 햇빛 가림 핀
    BD = dict(width=0.26, top=0.45, bot=-0.62)    # 핀을 묶는 보강재
else:
    FR = dict(width=1.0, top=0.75, bot=-0.55)     # 울거미
    SL = dict(width=0.16, top=0.3, bot=-0.1)      # 살
    BD = dict(width=0.2, top=0.32, bot=-0.1)      # 띠 가로살

bm_f, bm_s = bmesh.new(), bmesh.new()
TAU = 2 * math.pi
# 링 경계(가운데 원 포함)와 바깥 가장자리
for rho in sorted({r for (a, b, _) in RINGS for r in (a, b)}):
    beam_path(bm_f, arc(rho, 0, TAU), **FR)

for (r0, r1, n) in RINGS:
    for i in range(n):
        a0, a1 = TAU * i / n, TAU * (i + 1) / n
        beam_path(bm_f, radial(r0, r1, a0), **FR)             # 문짝 사이 울거미
        rr = lambda r: r0 + (r1 - r0) * r
        if is_weave(0, i):
            # 교살: 가로 3칸 × 세로 m칸 정사각, 칸마다 2:1 직사각형 두 장이 가로·세로로 엇갈림
            m = weave_rows(r0, r1, n)
            for k in range(1, 3):
                beam_path(bm_s, radial(r0, r1, a0 + (a1 - a0) * k / 3, 3.5), **SL)
            for j in range(1, m):
                beam_path(bm_s, arc(rr(j / m), a0, a1, 3.5), **SL)
            for a in range(3):
                for b in range(m):
                    sa0, sa1 = a0 + (a1 - a0) * a / 3, a0 + (a1 - a0) * (a + 1) / 3
                    if (a + b) % 2 == 0:   # 세로로 긴 두 장: 칸 가운데 세로살
                        beam_path(bm_s, radial(rr(b / m), rr((b + 1) / m), (sa0 + sa1) / 2, 10.0), **SL)
                    else:                  # 가로로 긴 두 장: 칸 가운데 가로살
                        beam_path(bm_s, arc(rr((b + 0.5) / m), sa0, sa1, 3.5), **SL)
            continue
        # 세로살: 문짝 전체 길이
        for k in range(1, N_SAL):
            beam_path(bm_s, radial(r0, r1, a0 + (a1 - a0) * k / N_SAL, 3.5), **SL)
        for (b0, b1) in BANDS:
            # 띠 가로살(호)
            for j in range(BAND_LINES):
                beam_path(bm_s, arc(rr(b0 + (b1 - b0) * j / (BAND_LINES - 1)), a0, a1, 3.5), **BD)
            # 띠 안은 세로살을 두 배로
            for k in range(N_SAL):
                beam_path(bm_s, radial(rr(b0), rr(b1), a0 + (a1 - a0) * (k + 0.5) / N_SAL, 10.0), **SL)


def to_obj(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(m)
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    return o


def beam3d(bm, A, B, width, top, bot):
    """두 3D 점 사이 곧은 각재(처마 끝 리브용)"""
    d = (B - A); d.z = 0
    if d.length < 1e-4: return
    d.normalize(); side = Vector((-d.y, d.x, 0)) * (width / 2)
    ring = [[bm.verts.new(P0 + s * side + Vector((0, 0, h))) for (s, h) in ((-1, bot), (1, bot), (1, top), (-1, top))] for P0 in (A, B)]
    r0, r1 = ring
    for k in range(4): bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(tuple(reversed(r0))); bm.faces.new(tuple(r1))


def box(bm, c, size, yaw):
    from mathutils import Matrix
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Diagonal((*size, 1)))


if CONCRETE:
    # 처마 끝: 바깥 링의 방사형 리브를 지붕 가장자리 밖으로 3m 내밀어 서까래 끝 리듬
    r_out = RINGS[-1][1]
    n_out = RINGS[-1][2]
    for i in range(n_out):
        a = TAU * i / n_out
        x1, y1 = P(r_out - 0.03, a); x2, y2 = P(r_out, a)
        z1, z2 = surf(x1, y1), surf(x2, y2)
        if z1 is None or z2 is None: continue
        A = Vector((x2, y2, z2)); D = Vector((x2 - x1, y2 - y1, z2 - z1)).normalized()
        beam3d(bm_f, A - D * 0.5, A + D * 3.0, FR['width'], FR['top'], FR['bot'] * 0.8)

    # 기둥: 나무 모양 기둥 8개 자리에 공포를 단순화한 층층 받침 콘크리트 기둥
    COLS = [(-55.8, -104.1), (-72.9, -68.5), (-102.9, -61.1), (-128.1, -84.6),
            (-134.1, -125.9), (-117.6, -160.8), (-87.5, -168.9), (-61.7, -145.4)]
    for (x, y) in COLS:
        yaw = math.atan2(y - CY, x - CX)            # 받침 팔은 중심을 향하는 방향과 그 직각으로
        zr = surf(x, y)
        if zr is None: continue
        top = zr + FR['bot']                         # 리브 밑면
        tiers, th = 3, 0.75
        zc = top - tiers * th                         # 받침 시작 높이
        # 기둥 몸: 아래 1.7m → 위 1.15m 사각 테이퍼
        bmesh.ops.create_cone(bm_f, cap_ends=True, cap_tris=False, segments=4,
                              radius1=1.7 / math.sqrt(2), radius2=1.15 / math.sqrt(2), depth=zc - 16.0,
                              matrix=__import__('mathutils').Matrix.Translation((x, y, (16.0 + zc) / 2)) @
                              __import__('mathutils').Matrix.Rotation(yaw + math.pi / 4, 4, 'Z'))
        # 층층 받침(십자): 위로 갈수록 길게 내밀어 리브를 받음
        for k in range(tiers):
            L = 2.2 + 1.6 * k
            zc_k = zc + th * (k + 0.5)
            box(bm_f, Vector((x, y, zc_k)), (L, 1.15, th), yaw)
            box(bm_f, Vector((x, y, zc_k)), (1.15, L, th), yaw)


o_frame = to_obj("PR_CH_Frame" + SUF, bm_f, M_FRAME)
o_sal = to_obj("PR_CH_Sal" + SUF, bm_s, M_SAL)

# ------------------------------------------------------------------ 한지·유리 판
bm = bmesh.new()
cache = {}


def V(rho, th):
    key = (round(rho, 5), round(th % TAU, 6))
    v = cache.get(key)
    if v is None:
        x, y = P(rho, th)
        z = surf(x, y)
        v = bm.verts.new((x, y, z)) if z is not None else False
        cache[key] = v
    return v


def quad(r0, r1, a0, a1, mi):
    vs = [V(r0, a0), V(r0, a1), V(r1, a1), V(r1, a0)]
    if all(vs):
        f = bm.faces.new(vs); f.material_index = 0 if HANJI_ONLY else mi


# 가운데 원형 유리
r_in = RINGS[0][0]
for i in range(96):
    a0, a1 = TAU * i / 96, TAU * (i + 1) / 96
    for (q0, q1) in ((0.0, r_in * 0.5), (r_in * 0.5, r_in)):
        if q0 == 0.0:
            vs = [V(1e-4, a0), V(q1, a0), V(q1, a1)]
            if all(vs): bm.faces.new((vs[0], vs[1], vs[2])).material_index = 0 if HANJI_ONLY else 1
        else:
            quad(q0, q1, a0, a1, 1)

for ri, (r0, r1, n) in enumerate(RINGS):
    # 문짝 안 칸 경계(r): 띠 경계 + 2m 정도마다
    cuts = {0.0, 1.0}
    for (b0, b1) in BANDS: cuts |= {b0, b1}
    steps = max(2, int((r1 - r0) * 100 / 2.5))
    cuts |= {k / steps for k in range(steps + 1)}
    cuts = sorted(cuts)
    for i in range(n):
        a0, a1 = TAU * i / n, TAU * (i + 1) / n
        if DESIGN == 'C':
            # 3안: 교살 정사각 칸마다 체크무늬(세로 두 장 = 유리, 가로 두 장 = 한지), 곡면을 따라 칸을 2×2로 잘게
            m = weave_rows(r0, r1, n)
            for a in range(3):
                for b in range(m):
                    mi = 1 if (a + b) % 2 == 0 else 0
                    for u in range(2):
                        for w in range(2):
                            s0 = a0 + (a1 - a0) * (a + u / 2) / 3
                            s1 = a0 + (a1 - a0) * (a + (u + 1) / 2) / 3
                            q0 = r0 + (r1 - r0) * (b + w / 2) / m
                            q1 = r0 + (r1 - r0) * (b + (w + 1) / 2) / m
                            quad(q0, q1, s0, s1, mi)
            continue
        solid = True if CONCRETE else (ri > 0 and i % 2 == 1) if DESIGN == 'A' else is_weave(ri, i)   # 4안: 전부 막 / 1안: 한 장 건너 통한지 / 2안: 교살 문짝은 통한지
        for k in range(N_SAL):
            s0, s1 = a0 + (a1 - a0) * k / N_SAL, a0 + (a1 - a0) * (k + 1) / N_SAL
            for c0, c1 in zip(cuts, cuts[1:]):
                mid = (c0 + c1) / 2
                in_band = any(b0 <= mid <= b1 for (b0, b1) in BANDS)
                glass = not solid and not in_band
                quad(r0 + (r1 - r0) * c0, r0 + (r1 - r0) * c1, s0, s1, 1 if glass else 0)

me = bpy.data.meshes.new("PR_CH_Infill" + SUF); me.materials.append(M_HANJI); me.materials.append(M_GLASS)
bm.normal_update()
for f in bm.faces:
    if f.normal.z < 0: f.normal_flip()
bm.to_mesh(me); bm.free(); bm0.free()
o_inf = bpy.data.objects.new("PR_CH_Infill" + SUF, me); coll.objects.link(o_inf)

# 원래 격자·판 숨기기
for o in (shell, ribs):
    o.hide_render = True; o.hide_viewport = True

# ------------------------------------------------------------------ pr_night.py 연동(한지 빛)
src = t.as_string()
if "MPR_CH_Membrane" not in src:
    src = src.rstrip('\n') + "\n    m=bpy.data.materials.get('MPR_CH_Membrane')\n" + \
        "    if m:\n" + \
        "        b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); b.inputs['Emission Strength'].default_value=0.9 if on else 0.0\n"
    t.from_string(src)
if "MPR_CH_Hanji" not in src:
    src = src.rstrip('\n') + "\n    # canopy changho: 밤에 한지가 빛남(pr_canopy_changho.py)\n" + \
        "    m=bpy.data.materials.get('MPR_CH_Hanji')\n" + \
        "    if m:\n" + \
        "        b=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); b.inputs['Emission Strength'].default_value=1.0 if on else 0.0\n"
    t.from_string(src)

# ------------------------------------------------------------------ 웹용 GLB(EXPORT_WEB=True일 때만)
print("canopy changho", DESIGN, ":", len(o_frame.data.vertices), "frame verts,", len(o_sal.data.vertices), "sal verts,",
      len(o_inf.data.polygons), "infill faces")
if EXPORT_WEB:
    out = os.path.join(ROOT, "web", "public", "models", "canopy_changho.glb")
    bpy.ops.object.select_all(action='DESELECT')
    for o in (o_frame, o_sal, o_inf):
        o.hide_viewport = False; o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = o_frame
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_yup=True)
    bpy.ops.object.select_all(action='DESELECT')
    print("exported ->", out, os.path.getsize(out))
