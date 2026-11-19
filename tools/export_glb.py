"""
서울역 Blender 씬 -> 웹앱용 GLB 레이어 + 카메라/마커 JSON 내보내기.

사용법: Blender에서 .blend를 열고, Scripting 탭에 이 파일을 열어 Run Script.
  - 결과: web/public/models/*.glb, web/public/data/cameras.json, markers.json
  - 뷰레이어에서 제외(exclude)된 컬렉션도 내보내며, 끝나면 표시 상태와 재질을 원래대로 복구함.
  - 프로시저럴 재질(색이 노드로 만들어진 것)은 노드 안의 색들의 평균으로 대표색을 정해서 내보냄.
  - Emission 재질(MCH_/MOD_)은 Principled(발광)로 임시 변환해서 내보냄.
레이어 구성을 바꾸려면 아래 LAYERS만 고치면 됨 (웹의 src/main.js layersFor()와 id를 맞출 것).
"""
import bpy, os, io, json, math, contextlib
from mathutils import Vector

ROOT = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(ROOT, "web", "public", "models")
DATA = os.path.join(ROOT, "web", "public", "data")
os.makedirs(OUT, exist_ok=True)
os.makedirs(DATA, exist_ok=True)

LAYERS = {
    "base": ["Buildings_Height_OSM", "Buildings_Height_Estimated", "Roads_Ground", "Rail_Tracks"],
    "keep": ["OldStation_1925", "Seoullo7017"],
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
    "wg_opt1": ["PR_WG_Opt1_Hangul", "NL_WG_Opt1"],
    "wg_opt2": ["PR_WG_Opt2_Linear", "NL_WG_Opt2"],
    "props": ["PR_TreeSet", "PR_ChairSet", "PR_LampSet", "PR_PeopleSet", "PR_PeopleSit", "PR_PropLib",
              "06_People_Vehicles"],
}

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
        elif o.type == 'EMPTY' and o.instance_type != 'COLLECTION':
            marks[o.name] = y_up(o.matrix_world.translation)
    json.dump(cams, open(os.path.join(DATA, "cameras.json"), "w"), indent=1)
    json.dump(marks, open(os.path.join(DATA, "markers.json"), "w"), indent=1)
    return len(cams), len(marks)


report = {}
buf = io.StringIO()
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
        if not sel:
            report[lid] = (0, 0)
            continue
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            bpy.ops.export_scene.gltf(
                filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                export_cameras=False, export_lights=False,
                export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                export_image_format='WEBP', export_yup=True)
        report[lid] = (len(sel), round(os.path.getsize(path) / 1e6, 2))
finally:
    unpatch()
    for n, (ex, hv) in saved.items():
        lcs[n].exclude = ex
        lcs[n].hide_viewport = hv

nc, nm = export_cameras_markers()
for k, v in report.items():
    print(f"{k:18s} objects={v[0]:5d}  {v[1]} MB")
print("TOTAL MB", round(sum(v[1] for v in report.values()), 2), "| cameras", nc, "markers", nm)
