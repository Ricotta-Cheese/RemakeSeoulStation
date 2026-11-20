"""
서울역 Blender 씬 -> 웹앱용 GLB 레이어 + 카메라/마커/인스턴스 JSON 내보내기.

사용법: Blender에서 .blend를 열고, Scripting 탭에 이 파일을 열어 Run Script.
  - 결과: web/public/models/*.glb, web/public/data/cameras.json, markers.json, instances.json
  - 뷰레이어에서 제외(exclude)된 컬렉션도 내보내며, 끝나면 표시 상태와 재질을 원래대로 복구함.
  - 프로시저럴 재질(색이 노드로 만들어진 것)은 노드 안의 색들의 평균으로 대표색을 정해서 내보냄.
  - Emission 재질(MCH_/MOD_)은 Principled(발광)로 임시 변환해서 내보냄.
  - Geometry Nodes로 소품(나무·사람·의자 등)을 복제 배치한 오브젝트는 glTF가 인스턴스를 버리므로,
    소품 원본은 masters.glb 에 한 번만 내보내고 위치(변환행렬)는 instances.json 에 저장 -> 웹에서 GPU 인스턴싱.
  - 제안안 파일에서 지워진 '현황' 도로는 원본 SeoulStation_Existing.blend 에서 임시로 가져옴(읽기만 함).
레이어 구성을 바꾸려면 아래 LAYERS만 고치면 됨 (웹의 src/main.js layersFor()와 id를 맞출 것).
"""
import bpy, os, io, json, math, contextlib, re
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(ROOT, "web", "public", "models")
DATA = os.path.join(ROOT, "web", "public", "data")
os.makedirs(OUT, exist_ok=True)
os.makedirs(DATA, exist_ok=True)

LAYERS = {
    "base": ["Buildings_Height_OSM", "Buildings_Height_Estimated", "Roads_Ground", "Rail_Tracks"],
    "keep": ["OldStation_1925"],
    # 서울로7017: 제안안은 선로 위 구간을 레일 파크로 바꿨으므로 단계별로 따로
    #   seoullo_p = 제안안 파일의 서울로, seoullo_e = 현황 파일(SeoulStation_Existing.blend)의 원래 서울로 (아래 EXTERNAL)
    "seoullo_p": ["Seoullo7017"],
    "existing_station": ["SeoulStation_New", "SeoulStation_1988Minja", "Plaza_Existing", "BusTransferCenter",
                         "SeoulStation_Interior", "Parking_Detail"],
    "ug_transit": ["Underground_Transit"],
    "ug_interiors": ["Underground_Interiors"],
    "p1": ["P1_Homeless_Drinking"], "p2": ["P2_Rally_Noise"], "p3": ["P3_Road_Barrier"],
    "p4": ["P4_Rail_Severance"], "p5": ["P5_Underground_Maze"],
    "proposal": ["PR_RailPark", "PR_NewStation", "PR_Plaza", "PR_CareCenter", "PR_Life", "PR_BusTerminal", "PR_Roads",
                 "PR_PlazaContent", "PR_WestStairs", "PR_StationSides", "PR_OculusGarden", "PR_Gallery",
                 "PR_Connector", "PR_SkyRoute", "PR_EventHall", "PR_Det_Sculpture", "PR_Det_Plaza",
                 "PR_Det_BusConnector"],
    "proposal_interior": ["PR_ConcourseInterior", "PR_Det_Concourse", "PR_Det_DepartureBoard", "PR_Det_Hall"],
    "proposal_ug": ["PR_Underground", "PR_UndergroundSpace"],
    "proposal_tags": ["PR_SolutionTags", "PR_ChapterTags", "PR_OldStationDiagram"],
    # 물의 정원: 선형 B안(Opt2)으로 통합. A안(Opt1 한글)은 웹에서 제거
    "water_garden": ["PR_WG_Opt2_Linear", "NL_WG_Opt2"],
    "props": ["PR_TreeSet", "PR_ChairSet", "PR_LampSet", "PR_PeopleSet", "PR_PeopleSit", "PR_PropLib"],
    # 현황·문제점에서만 표시: 옥상 주차 차량(CTX_Roof_Cars) + 기존 버스환승센터 버스(BTC_*)
    "existing_vehicles": ["06_People_Vehicles"],
}

# 제안안 파일에서는 '현황' 도로 일부(버스환승센터 주변)가 지워져 있어서,
# 원본 현황 파일(SeoulStation_Existing.blend)의 G_* 도로를 임시로 가져와 별도 레이어로 내보냄 (원본은 읽기만 함)
EXISTING_BLEND = os.path.join(ROOT, "SeoulStation_Existing.blend")
EXTERNAL = {"existing_roads": (EXISTING_BLEND, lambda n: n.startswith("G_") and n != "G_Area_plaza"),
            "seoullo_e": (EXISTING_BLEND, lambda n: n.startswith("SL_"))}
tmp_objs, tmp_cols = [], []
mats_before = set(bpy.data.materials)
for lid, (path, pick) in EXTERNAL.items():
    if not os.path.exists(path):
        print("외부 레이어 건너뜀 (파일 없음):", path)
        continue
    with bpy.data.libraries.load(path, link=False) as (df, dt):
        dt.objects = [n for n in df.objects if pick(n)]
    col = bpy.data.collections.new("TMP_" + lid)
    bpy.context.scene.collection.children.link(col)
    for o in dt.objects:
        if o is not None:
            col.objects.link(o)
            tmp_objs.append(o)
    tmp_cols.append(col)
    LAYERS[lid] = [col.name]

vl = bpy.context.view_layer
lcs, parent = {}, {}


def collect(l):
    lcs[l.name] = l
    for c in l.children:
        parent[c.name] = l.name
        collect(c)


collect(vl.layer_collection)
saved = {n: (l.exclude, l.hide_viewport) for n, l in lcs.items()}


def colors_upstream(sock, seen=None, out=None, d=0):
    seen = set() if seen is None else seen
    out = [] if out is None else out
    for l in sock.links:
        n = l.from_node
        if n in seen or d > 8:
            continue
        seen.add(n)
        if n.type == 'RGB':
            out.append(tuple(n.outputs[0].default_value[:3]))
        elif n.type == 'VALTORGB':
            out += [tuple(e.color[:3]) for e in n.color_ramp.elements]
        elif n.type in ('MIX', 'MIX_RGB'):
            for nm in ('A', 'B', 'Color1', 'Color2'):
                s = n.inputs.get(nm)
                if s and not s.is_linked and s.type == 'RGBA':
                    out.append(tuple(s.default_value[:3]))
        elif n.type in ('TEX_BRICK', 'TEX_CHECKER'):
            for nm in ('Color1', 'Color2'):
                s = n.inputs.get(nm)
                if s and not s.is_linked:
                    out.append(tuple(s.default_value[:3]))
        for i in n.inputs:
            if i.is_linked:
                colors_upstream(i, seen, out, d + 1)
    return out


restore_links, restore_emis = [], []


def patch_materials():
    for m in bpy.data.materials:
        if not (m.use_nodes and m.node_tree):
            continue
        nt = m.node_tree
        p = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if p:
            bc = p.inputs['Base Color']
            if bc.is_linked and m.name != 'M_Satellite':
                cs = colors_upstream(bc)
                if cs:
                    avg = tuple(sum(c[i] for c in cs) / len(cs) for i in range(3))
                    lk = bc.links[0]
                    restore_links.append((nt, lk.from_socket, bc, tuple(bc.default_value)))
                    nt.links.remove(lk)
                    bc.default_value = (*avg, 1.0)
        else:
            out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
            em = next((n for n in nt.nodes if n.type == 'EMISSION'), None)
            if not out or not em:
                continue
            col = tuple(em.inputs['Color'].default_value[:3])
            alpha = 1.0
            mix = next((n for n in nt.nodes if n.type == 'MIX_SHADER'), None)
            if mix is not None:
                f = mix.inputs[0].default_value
                alpha = max(0.15, min(1.0, f if 0 < f < 1 else 0.4))
            pn = nt.nodes.new('ShaderNodeBsdfPrincipled')
            pn.inputs['Base Color'].default_value = (*col, 1.0)
            pn.inputs['Emission Color'].default_value = (*col, 1.0)
            pn.inputs['Emission Strength'].default_value = 1.0
            pn.inputs['Alpha'].default_value = alpha
            surf = out.inputs['Surface']
            old = surf.links[0].from_socket if surf.is_linked else None
            nt.links.new(pn.outputs['BSDF'], surf)
            bm = m.blend_method
            if alpha < 1.0:
                try:
                    m.blend_method = 'BLEND'
                except Exception:
                    pass
            restore_emis.append((nt, pn, surf, old, m, bm))


def unpatch():
    for nt, pn, surf, old, m, bm in restore_emis:
        if old is not None:
            nt.links.new(old, surf)
        nt.nodes.remove(pn)
        try:
            m.blend_method = bm
        except Exception:
            pass
    for nt, fs, bc, dv in restore_links:
        nt.links.new(fs, bc)
        bc.default_value = dv


EYE_RE = re.compile(r"(Eye_|Hall_|Concourse|OculusCurtain|Gallery|INT_|_UG_|MoonJar)")


def y_up(v):
    return [round(v.x, 2), round(v.z, 2), round(-v.y, 2)]


def export_cameras_markers():
    sc = bpy.context.scene
    aspect = sc.render.resolution_x / sc.render.resolution_y
    cams, marks = {}, {}
    for o in bpy.data.objects:
        if o.type == 'CAMERA' and o.name != 'Camera':
            pos = o.matrix_world.translation
            fwd = (o.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
            d = o.data
            if d.type == 'ORTHO':
                cams[o.name] = {"ortho": True, "pos": y_up(pos), "target": y_up(pos + fwd * 100), "scale": d.ortho_scale}
                continue
            hfov = 2 * math.atan(d.sensor_width / (2 * d.lens))
            vfov = math.degrees(2 * math.atan(math.tan(hfov / 2) / aspect))
            dist = 60.0
            if fwd.z < -0.05:
                dist = min(max(-pos.z / fwd.z, 20.0), 900.0)
            cams[o.name] = {"pos": y_up(pos), "target": y_up(pos + fwd * dist), "fov": round(vfov, 1)}
            # 눈높이(제자리 둘러보기) 시점: 지상 8m 미만이거나, 홀·대합실·지하처럼 실내에 있는 카메라
            if pos.z < 8 or EYE_RE.search(o.name):
                cams[o.name]["eye"] = True
        elif o.type == 'EMPTY' and o.instance_type != 'COLLECTION':
            marks[o.name] = y_up(o.matrix_world.translation)
    json.dump(cams, open(os.path.join(DATA, "cameras.json"), "w"), indent=1)
    json.dump(marks, open(os.path.join(DATA, "markers.json"), "w"), indent=1)
    return len(cams), len(marks)


# ---------------------------------------------------------------------------
# Geometry Nodes 인스턴스 수집 (나무·사람·의자·랜턴 등)
#   glTF 내보내기는 GN 인스턴스를 버리고, Object > Convert > Mesh 도 실체화하지 못함.
#   -> 소품 원본(마스터)은 한 번만 내보내고, 각 인스턴스의 변환행렬만 JSON으로 저장.
# ---------------------------------------------------------------------------
C = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64)  # Blender(z-up) -> glTF(y-up)
all_masters = {}   # 마스터 이름 -> 평가된 메시
inst_json = {}     # 레이어 id -> { 마스터 이름: [r00..r22(9개 회전·스케일), tx,ty,tz] * n }


def collect_instances(gn_objs, dg):
    names = {o.name for o in gn_objs}
    rows, n = {}, 0
    for i in dg.object_instances:
        if not i.is_instance or i.parent is None:
            continue
        if i.parent.original.name not in names or i.object.type != 'MESH':
            continue
        key = i.object.original.name
        if key not in all_masters:
            all_masters[key] = bpy.data.meshes.new_from_object(i.object)
        M = np.array(i.matrix_world)
        R = C @ M[:3, :3] @ C.T
        t = C @ M[:3, 3]
        rows.setdefault(key, []).extend(round(float(x), 4) for x in np.concatenate([R.ravel(), t]))
        n += 1
    return rows, n


GLTF_ARGS = dict(
    export_format='GLB', export_apply=True, export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    # 기본 14비트는 1.4km 메시에서 ~9cm 단위로 반올림돼, 5~20mm 간격으로 겹친 도로/차선/광장이
    # 같은 높이로 뭉개짐 -> 20비트(~1.4mm)로 올림
    export_draco_position_quantization=20,
    export_image_format='WEBP', export_yup=True)

report, gn_counts = {}, {}
buf = io.StringIO()
master_objs = []
try:
    patch_materials()
    for lid, cols in LAYERS.items():
        need = set()
        for cn in cols:
            n = cn
            while n is not None and n in lcs:
                need.add(n)
                n = parent.get(n)
        for n, l in lcs.items():
            l.exclude = n not in need
            if n in need:
                l.hide_viewport = False
        for o in vl.objects:
            o.select_set(False)
        sel = []
        for cn in cols:
            for o in bpy.data.collections[cn].objects:
                ok = o.type in {'MESH', 'CURVE', 'FONT', 'SURFACE', 'META'} or \
                     (o.type == 'EMPTY' and o.instance_type == 'COLLECTION')
                if ok and o.name in vl.objects and not o.hide_get() and not o.hide_viewport:
                    o.select_set(True)
                    sel.append(o.name)
        path = os.path.join(OUT, f"{lid}.glb")
        gn = [vl.objects[n] for n in sel if any(m.type == 'NODES' for m in vl.objects[n].modifiers)]
        if gn:
            vl.update()
            rows, cnt = collect_instances(gn, bpy.context.evaluated_depsgraph_get())
            if rows:
                inst_json[lid] = rows
            gn_counts[lid] = f"GN {len(gn)}개 -> 인스턴스 {cnt}개"
        if not sel:
            report[lid] = (0, 0)
            continue
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            bpy.ops.export_scene.gltf(filepath=path, use_selection=True, **GLTF_ARGS)
        report[lid] = (len(sel), round(os.path.getsize(path) / 1e6, 2))

    # 소품 원본(마스터)을 원점·무회전 상태로 한 파일에 내보냄. 노드 이름 = "M__" + 마스터 이름
    if all_masters:
        for k, me in all_masters.items():
            ob = bpy.data.objects.new("M__" + k, me)
            bpy.context.scene.collection.objects.link(ob)
            master_objs.append(ob)
        vl.update()
        for o in vl.objects:
            o.select_set(False)
        for o in master_objs:
            o.select_set(True)
        mpath = os.path.join(OUT, "masters.glb")
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            bpy.ops.export_scene.gltf(filepath=mpath, use_selection=True, **GLTF_ARGS)
        report["masters"] = (len(master_objs), round(os.path.getsize(mpath) / 1e6, 2))
        json.dump(inst_json, open(os.path.join(DATA, "instances.json"), "w"), separators=(',', ':'))
finally:
    unpatch()
    for n, (ex, hv) in saved.items():
        lcs[n].exclude = ex
        lcs[n].hide_viewport = hv
    for o in master_objs:
        bpy.data.objects.remove(o)
    for me in all_masters.values():
        if me.users == 0:
            bpy.data.meshes.remove(me)
    # 임시로 가져온 외부 오브젝트 정리
    for o in tmp_objs:
        m = o.data
        bpy.data.objects.remove(o)
        if m is not None and m.users == 0:
            bpy.data.meshes.remove(m)
    for c in tmp_cols:
        bpy.data.collections.remove(c)
    for m in set(bpy.data.materials) - mats_before:
        if m.users == 0:
            bpy.data.materials.remove(m)

nc, nm = export_cameras_markers()
for k, v in report.items():
    print(f"{k:18s} objects={v[0]:5d}  {v[1]} MB  {gn_counts.get(k, '')}")
print("TOTAL MB", round(sum(v[1] for v in report.values()), 2), "| cameras", nc, "markers", nm)
if inst_json:
    tot = {k: sum(len(v) // 12 for v in r.values()) for k, r in inst_json.items()}
    print("instances.json:", tot, "| masters:", len(all_masters))
