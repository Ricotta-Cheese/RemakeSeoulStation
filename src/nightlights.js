/* 제안안 밤 조명
 *  - 옥상 정원(레일 파크, +16m): 산책로 가장자리를 따라 가는 기둥 + 빛 고리 가로등
 *  - 물(아트리움 물커튼 · 물의 정원 물벽): 가로등 대신 물 자체가 빛나고 주변 바닥이 밝아짐
 *  - 버스환승센터 내부: 1층 다운라이트, 승강장 가장자리 LED 줄, 2층 홀 펜던트 조명
 * 실제 광원 대신 '빛 웅덩이'(더하기 합성 원판)로 바닥이 밝아 보이게 해서 가볍게 그려요.
 * 모두 제안안 레이어 그룹 안에 넣어, 제안안이 보일 때만 함께 보여요. */
import * as THREE from 'three';
import LAMPS from './night_lamps.json';

const WARM = new THREE.Color(1.0, 0.82, 0.58);
const COOL = new THREE.Color(0.85, 0.93, 1.0);
const AQUA = new THREE.Color(0.45, 0.9, 1.0);
const TEAL = new THREE.Color(0.25, 1.0, 0.8);
const AMBER = new THREE.Color(1.0, 0.66, 0.32);   // 지하로 내려가는 아트리움: 물벽(푸른빛)과 구분되는 따뜻한 호박색

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createNightLights() {
  const tex = poolTexture();
  const group = new THREE.Group();
  group.name = 'NightLights';
  const glowMats = [];   // { mat, base: Color, day: Color, gain }
  const poolMats = [];   // { mat, alpha }
  let level = 0;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const UP = new THREE.Euler(-Math.PI / 2, 0, 0);
  const qFlat = new THREE.Quaternion().setFromEuler(UP);

  function glowMat(color, gain, day = new THREE.Color(0.82, 0.82, 0.8)) {
    const mat = new THREE.MeshBasicMaterial({ color: day.clone() });
    glowMats.push({ mat, base: color.clone(), day: day.clone(), gain });
    return mat;
  }
  function poolMat(color, alpha) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    poolMats.push({ mat, alpha });
    return mat;
  }
  function instanced(geo, mat, list, setup) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, k) => { setup(it); im.setMatrixAt(k, m4); });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  }
  /* 바닥 빛 웅덩이: [x, y, z, 반지름] 목록 */
  function pools(list, color, alpha) {
    instanced(new THREE.PlaneGeometry(2, 2), poolMat(color, alpha), list, ([x, y, z, r]) => {
      m4.compose(p.set(x, y, z), qFlat, s.set(r, r, 1));
    });
  }

  /* ---------- 옥상 정원 가로등 ---------- */
  function roofLamps() {
    // 위치는 미리 계산해 둔 값이에요: 덱 위를 15m 격자로 훑어 위에서 광선을 쏘고,
    // 처음 닿는 면이 포장(산책로·덱 바닥)이고 1.5m 안에 나무·화분이 없는 곳만 골랐어요.
    // (그늘 지붕 홀 아래는 제외) 모델이 바뀌면 다시 뽑아야 해요.
    const pts = LAMPS.map(([x, y, z]) => new THREE.Vector3(x, y, z));

    const H = 4.6;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.4 });
    instanced(new THREE.CylinderGeometry(0.06, 0.09, H, 8).translate(0, H / 2, 0), poleMat, pts, (v) => {
      m4.compose(v, q.identity(), s.set(1, 1, 1));
    });
    // 기둥 끝의 얇은 빛 고리 + 가운데 작은 원판
    const ring = new THREE.TorusGeometry(0.42, 0.045, 8, 32).rotateX(Math.PI / 2);
    instanced(ring, glowMat(WARM, 5), pts, (v) => m4.compose(p.set(v.x, v.y + H, v.z), q.identity(), s.set(1, 1, 1)));
    const cap = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 24);
    instanced(cap, poleMat, pts, (v) => m4.compose(p.set(v.x, v.y + H + 0.06, v.z), q.identity(), s.set(1, 1, 1)));
    pools(pts.map((v) => [v.x, v.y + 0.06, v.z, 7.5]), WARM, 0.7);
    return pts.length;
  }

  /* ---------- 빛나는 물 ---------- */
  // 물커튼·물벽은 은은하게 스스로 빛나고, 그 둘레 바닥에 푸른 빛 웅덩이를 깔아요.
  const waterCells = new Map();
  function water(root) {
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      // 아트리움 물커튼은 재질을 따로 떼어 호박색으로(광장 물벽과 같은 재질을 쓰고 있어서)
      if (/^PR_Atrium/.test(o.name) && !Array.isArray(o.material) && /WaterCurtain|AtriumCurtain|Water$/.test(o.material.name) && !o.material.userData.atrium) {   // Blender에서 다시 내보내면 MPR_AtriumCurtain·MPR_AtriumWater 이름으로 옴
        const curtainMat = /Curtain/.test(o.material.name);
        o.material = o.material.clone();
        o.material.userData.atrium = true;
        o.material.userData.nightGlow = true;
        glowMats.push({ std: o.material, base: AMBER, gain: curtainMat ? 0.55 : 0.3 });
        return;
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let curtain = false;
      mats.forEach((m) => {
        if (!/WaterCurtain|Water$/.test(m.name)) return;
        if (/Curtain/.test(m.name)) curtain = true;
        if (m.userData.nightGlow || !m.emissive) return;
        m.userData.nightGlow = true;
        glowMats.push({ std: m, base: /Curtain/.test(m.name) ? AQUA : new THREE.Color(0.1, 0.45, 0.6), gain: /Curtain/.test(m.name) ? 0.42 : 0.8 });
      });
      if (!curtain || o.isInstancedMesh) return;
      // 물벽 둘레 바닥: 정점을 8m 칸으로 묶어 칸마다 웅덩이 하나
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y > 12) continue;   // 옥상(+16m) 위 물은 빼고 지상·지하만
        const k = `${Math.round(v.x / 8)},${Math.round(v.z / 8)}`;
        const c = waterCells.get(k);
        if (c) { c[0] += v.x; c[1] = Math.min(c[1], v.y); c[2] += v.z; c[3]++; }
        else waterCells.set(k, [v.x, v.y, v.z, 1]);
      }
    });
  }
  function waterPools() {
    const list = [...waterCells.values()].map(([x, y, z, n]) => [x / n, y + 0.3, z / n, 9]);
    pools(list, AQUA, 0.55);
    // 아트리움(중심 48,48 · 반지름 18): 둘레 광장과 계단식 테라스 바닥에 호박색 빛
    pools([[48, 0.3, 48, 28]], AMBER, 0.3);
    pools([[48, -5.6, 44, 13], [40, -3.6, 52, 8], [56, -3.6, 52, 8], [48, -2.2, 58, 8]], AMBER, 0.5);
    // 난간 위 가는 호박색 테두리 빛
    const rim = new THREE.TorusGeometry(18.15, 0.05, 6, 160).rotateX(Math.PI / 2);
    instanced(rim, glowMat(AMBER, 2.2, new THREE.Color(0.75, 0.72, 0.68)), [[48, 1.15, 48]], ([x, y, z]) => m4.compose(p.set(x, y, z), q.identity(), s.set(1, 1, 1)));
  }

  /* ---------- 버스환승센터 내부 ---------- */
  function busTerminal() {
    // 1층: 2층 슬래브 아래 다운라이트(차가운 흰빛), 승강장 세 줄
    const down = [];
    for (const x of [115.5, 131, 147.5]) for (let z = -94; z <= 62; z += 8) down.push([x, z]);
    const disc = new THREE.CircleGeometry(0.35, 20).rotateX(Math.PI / 2);   // 아래를 보는 면
    instanced(disc, glowMat(COOL, 4), down, ([x, z]) => m4.compose(p.set(x, 4.36, z), q.identity(), s.set(1, 1, 1)));   // 2층 슬래브 밑면 4.40m
    const floorY = (z) => (z > -68 && z < 80 ? 0.33 : 0.07);   // 승강장 윗면 0.30m
    pools(down.map(([x, z]) => [x, floorY(z), z, 4.2]), COOL, 0.3);

    // 승강장 가장자리 LED 줄(청록) — 버스 타는 곳을 따라 이어지는 길잡이 빛
    const strips = [119.3, 126.7, 135.3, 142.7].map((x) => [x, 6, 148]);   // 승강장 가장자리(119.5 · 126.5 · 135.5 · 142.5)
    const bar = new THREE.BoxGeometry(0.14, 0.05, 1);
    instanced(bar, glowMat(TEAL, 3.2, new THREE.Color(0.75, 0.78, 0.78)), strips, ([x, z, len]) =>
      m4.compose(p.set(x, 0.33, z), q.identity(), s.set(1, 1, len)));
    pools(strips.flatMap(([x]) => Array.from({ length: 19 }, (_, k) => [x, 0.33, -68 + k * 8, 2.4])), TEAL, 0.3);

    // 2층 홀: 따뜻한 원통 펜던트(높이 9.6m)와 바닥 빛
    const pend = [];
    for (const x of [124, 134, 144]) for (let z = -46; z <= 56; z += 8.5) pend.push([x, z]);
    const lantern = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 20);
    instanced(lantern, glowMat(WARM, 2.3), pend, ([x, z]) => m4.compose(p.set(x, 9.6, z), q.identity(), s.set(1, 1, 1)));
    const cord = new THREE.CylinderGeometry(0.015, 0.015, 1, 4);
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    instanced(cord, cordMat, pend, ([x, z]) => m4.compose(p.set(x, 12.5, z), q.identity(), s.set(1, 5, 1)));
    pools(pend.map(([x, z]) => [x, 5.12, z, 4.8]), WARM, 0.5);

    // 지붕이 열린 북쪽 끝(z 66~92)과 남쪽 끝: 높은 펜던트
    const ends = [];
    for (const x of [121, 135, 149]) for (const z of [72, 82, -102]) ends.push([x, z]);
    instanced(lantern, glowMat(WARM, 2.3), ends, ([x, z]) => m4.compose(p.set(x, 11, z), q.identity(), s.set(1.2, 1.2, 1.2)));
    instanced(cord, cordMat, ends, ([x, z]) => m4.compose(p.set(x, 14, z), q.identity(), s.set(1, 5, 1)));
    pools(ends.map(([x, z]) => [x, floorY(z), z, 6]), WARM, 0.45);
  }

  /* ---------- 덱 아래 천장 조명(새 서울역 중층 위) ----------
   * 원래는 1m 폭 연속 LED 띠 7줄이 덱 전체를 관통해 오큘러스 빈 공간까지 가로질렀어요.
   * 폭 22cm 슬림 바를 3.2m 길이 · 5m 간격으로 끊어 리듬을 주고, 오큘러스 위는 비워요.
   * 바마다 양 끝을 짙은 홈(리세스)으로 감싸 천장에 묻힌 느낌을 줘요. */
  function soffit(root) {
    const old = root.getObjectByName('PR_Side_SoffitLights');
    if (old) old.visible = false;
    const LINES = [[8, 150, 328], [-13, -173, 328], [-38, 27, 328], [-62, -173, 328], [-80, -173, 328], [-97, -173, 328], [-115, -173, 328]];
    const inOculus = (x, z) => ((x + 95) / 42) ** 2 + ((z - 115) / 56) ** 2 < 1;
    const bars = [];
    for (const [x, z0, z1] of LINES) {
      for (let z = z0 + 2; z + 3.2 <= z1; z += 5) {
        const zc = z + 1.6;
        if (inOculus(x, zc)) continue;
        bars.push([x, zc]);
      }
    }
    const bar = new THREE.BoxGeometry(0.22, 0.04, 3.2);
    instanced(bar, glowMat(new THREE.Color(1.0, 0.9, 0.74), 2.0, new THREE.Color(1.0, 0.96, 0.88)), bars, ([x, z]) =>
      m4.compose(p.set(x, 14.29, z), q.identity(), s.set(1, 1, 1)));
    const trim = new THREE.BoxGeometry(0.5, 0.03, 3.6);
    instanced(trim, new THREE.MeshStandardMaterial({ color: 0x23252a, metalness: 0.5, roughness: 0.5 }), bars, ([x, z]) =>
      m4.compose(p.set(x, 14.315, z), q.identity(), s.set(1, 1, 1)));
  }

  function attach(proposalGroup) {
    soffit(proposalGroup);
    proposalGroup.updateMatrixWorld(true);
    roofLamps();
    water(proposalGroup);
    waterPools();
    busTerminal();
    proposalGroup.add(group);
    group.updateMatrixWorld(true);
    group.traverse((o) => { o.matrixAutoUpdate = false; });
    setLevel(level);
  }

  function setLevel(k) {
    level = k;
    for (const g of glowMats) {
      if (g.std) {
        g.std.emissive.copy(g.base);
        g.std.emissiveIntensity = g.gain * k;
        continue;
      }
      // 낮에는 무광 회색, 밤에는 1보다 밝은 색으로 빛 번짐(블룸)을 받게
      g.mat.color.copy(g.day).lerp(g.base.clone().multiplyScalar(g.gain), k);
    }
    for (const pm of poolMats) pm.mat.opacity = pm.alpha * k;
    group.visible = true;
    for (const pm of poolMats) pm.mat.visible = k > 0.01;
  }

  return { attach, setLevel, addWater: (root) => { water(root); setLevel(level); } };
}
