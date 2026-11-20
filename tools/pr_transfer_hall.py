"""
행사 마당 건물(PR_EventHall의 평지붕 박스)을 '환승 마당' 볼트로 바꾸는 스크립트. 여러 번 실행해도 됨.

  - 버스환승센터 서쪽 계단(x≈108)에서 지하로 내려가는 아트리움(선큰, 중심 48,-48) 앞까지
    동서로 이어지는 단정한 콘크리트 볼트(폭 30m, 높이 9m). 버스환승센터·연결 회랑과 같은 재료:
      7m마다 콘크리트 아치 + 길이 방향 세로살 + 한지 막, 꼭대기에 긴 유리 천창 한 줄.
  - 서쪽 끝은 아트리움 가장자리 앞에서 반듯한 아치로 끝나고, 동쪽 끝은 버스환승센터 계단에 닿아요.
  - 옆은 트인 아케이드(바닥에서 4m 위부터 막). 무대·무대 뒤·객석 의자는 볼트 아래에 그대로 둬서
    예약제 행사 마당 기능은 유지해요(문제 ② 집회 소음의 해법).
  - 원래 평지붕·나무 기둥·간판 띠는 숨겨요. 결과는 04_Proposal/PR_TransferHall 컬렉션(웹 내보내기 대상 아님).
"""
import bpy, bmesh, math
from mathutils import Vector

X0, X1 = 70.0, 112.0          # 서(아트리움 가장자리 앞) → 동(버스환승센터 계단)
YC, HALF_W = -46.0, 15.0      # 볼트 중심선 y와 반폭
H = 9.0                       # 볼트 높이(단정하게 낮춤)
BAY = 7.0                     # 아치 간격(6칸)
FLARE = 0.0                   # 서쪽 끝 벌어짐(0 = 반듯하게)
SKY = (0.44, 0.56)            # 꼭대기 유리 천창 줄(단면 비율)
NS = 40                       # 단면 분할
STEP = 1.0                    # 길이 방향 분할
OPEN_H = 4.0                  # 이 높이 아래는 트인 아케이드
BANDS = []                    # 가로띠 없음(단정하게)
BAND_LINES = 4
N_SAL = 10

for n in ("PR_EV_Roof", "PR_EV_Columns", "PR_EV_SignBand"):
    o = bpy.data.objects.get(n)
    if o: o.hide_render = o.hide_viewport = True

coll = bpy.data.collections.get("PR_TransferHall")
if coll:
    for o in list(coll.objects):
        me = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0: bpy.data.meshes.remove(me)
else:
    coll = bpy.data.collections.new("PR_TransferHall")
    bpy.data.collections["04_Proposal"].children.link(coll)

M_FRAME = bpy.data.materials["MPR_CF_Concrete"]
M_FIN = bpy.data.materials["MPR_CF_Fin"]
M_MEMB = bpy.data.materials["MPR_CH_Membrane"]
M_GLASS = bpy.data.materials["MPR_CC_Glass"]


def prof(s, x):
    """단면 위의 점. s: 0(남쪽 바닥) → 1(북쪽 바닥). 서쪽 끝은 아트리움을 감싸도록 조금 넓고 높게"""
    t = max(0.0, min(1.0, (X0 + 14 - x) / 14)) * FLARE   # 서쪽 14m 동안 벌어짐(FLARE=0이면 반듯)
    hw = HALF_W * (1 + 0.35 * t * t)
    h = H * (1 + 0.25 * t * t)
    a = math.pi * s
    return Vector((x, YC - hw * math.cos(a), h * math.sin(a) ** 0.85))


def nrm(s, x):
    a = prof(min(1, s + 0.01), x) - prof(max(0, s - 0.01), x)
    b = prof(s, x + 0.5) - prof(s, x - 0.5)
    n = a.cross(b).normalized()
    c = Vector((x, YC, 0))
    return n if n.dot(prof(s, x) - c) > 0 else -n


def sweep3d(bm, pts, nrms, width, up, down):
    n = len(pts)
    ring = []
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        side = (b - a).normalized().cross(nrms[i]).normalized() * (width / 2)
        p = pts[i]
        ring.append([bm.verts.new(p - side - nrms[i] * down), bm.verts.new(p + side - nrms[i] * down),
                     bm.verts.new(p + side + nrms[i] * up), bm.verts.new(p - side + nrms[i] * up)])
    for i in range(n - 1):
        r0, r1 = ring[i], ring[i + 1]
        for k in range(4): bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(tuple(reversed(ring[0]))); bm.faces.new(tuple(ring[-1]))


xs = [X0 + (X1 - X0) * i / int((X1 - X0) / STEP) for i in range(int((X1 - X0) / STEP) + 1)]
ss = [j / NS for j in range(NS + 1)]
bm_f, bm_s, bm_m = bmesh.new(), bmesh.new(), bmesh.new()

# 울거미 아치(양 끝 포함, 서쪽 끝 아치는 더 굵게)
nb = round((X1 - X0) / BAY)
for b in range(nb + 1):
    x = X0 + (X1 - X0) * b / nb
    sweep3d(bm_f, [prof(s, x) for s in ss], [nrm(s, x) for s in ss], 0.6, 0.4, 0.9)
# 아치 발치를 잇는 바닥 보(남·북)
for s in (0.0, 1.0):
    sweep3d(bm_f, [prof(s, x) + Vector((0, 0, 0.3)) for x in xs], [Vector((0, 0, 1))] * len(xs), 0.8, 0.3, 0.3)
# 세로살(길이 방향)
for q in range(1, N_SAL):
    s = q / N_SAL
    sweep3d(bm_s, [prof(s, x) for x in xs], [nrm(s, x) for x in xs], 0.12, 0.15, 0.45)
# 가로띠
band_x = []
for b in range(nb):
    for (b0, b1) in BANDS:
        for k in range(BAND_LINES):
            x = X0 + (X1 - X0) * (b + b0 + (b1 - b0) * k / (BAND_LINES - 1)) / nb
            band_x.append(x)
            sweep3d(bm_s, [prof(s, x) for s in ss], [nrm(s, x) for s in ss], 0.16, 0.15, 0.45)
# 판: 바닥에서 OPEN_H까지는 비움(트인 아케이드), 위는 띠 구간 한지 막·세로살 사이 막/유리 번갈아
grid = [[bm_m.verts.new(prof(s, x)) for s in ss] for x in xs]
for i in range(len(xs) - 1):
    for j in range(NS):
        c = (prof(ss[j], xs[i]) + prof(ss[j + 1], xs[i + 1])) / 2
        if c.z < OPEN_H: continue
        f = bm_m.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
        mid = (ss[j] + ss[j + 1]) / 2
        f.material_index = 1 if SKY[0] <= mid <= SKY[1] else 0     # 꼭대기 한 줄만 유리, 나머지 한지 막
bm_m.verts.ensure_lookup_table()
for v in [v for v in bm_m.verts if not v.link_faces]: bm_m.verts.remove(v)


def to_obj(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); coll.objects.link(o)


to_obj("PR_TH_Frame", bm_f, [M_FRAME])
to_obj("PR_TH_Sal", bm_s, [M_FIN])
to_obj("PR_TH_Panels", bm_m, [M_MEMB, M_GLASS])
print("transfer hall:", nb, "bays, x", X0, "→", X1)
