/* ------------------------------------------------------------------ *
 *  움직임: 자동차 · 버스 · 기차 (paths.json) + 사람 걷기
 *  모두 InstancedMesh 하나씩으로 그려서 수천 대여도 가볍게 돌아가요.
 * ------------------------------------------------------------------ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* 상자 하나를 만들고 정점 색을 칠함 (차체·유리·띠를 한 지오메트리에 합치기 위해) */
function cbox(w, h, l, x, y, z, rgb) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const W = [1, 1, 1], GL = [0.12, 0.14, 0.17], TY = [0.08, 0.08, 0.08];

/* 모델은 +Z가 앞 */
function carGeo() {
  return mergeGeometries([
    cbox(1.8, 0.75, 4.4, 0, 0.55, 0, W),
    cbox(1.6, 0.6, 2.3, 0, 1.2, -0.2, GL),
    cbox(1.62, 0.08, 2.0, 0, 1.52, -0.25, W),
    cbox(1.9, 0.5, 0.7, 0, 0.3, 1.45, TY), cbox(1.9, 0.5, 0.7, 0, 0.3, -1.45, TY),
  ]);
}
function busGeo() {
  return mergeGeometries([
    cbox(2.5, 2.6, 11.5, 0, 1.65, 0, W),
    cbox(2.52, 1.0, 10.6, 0, 2.15, -0.2, GL),
    cbox(2.4, 1.3, 0.05, 0, 2.0, 5.76, GL),
    cbox(2.55, 0.35, 11.6, 0, 0.45, 0, TY),
  ]);
}
const KTX_W = [0.95, 0.96, 0.97], KTX_B = [0.1, 0.25, 0.65];
function trainGeo() {
  return mergeGeometries([
    cbox(3.0, 3.3, 18.6, 0, 2.15, 0, KTX_W),
    cbox(3.02, 0.9, 17.4, 0, 2.75, 0, GL),
    cbox(3.03, 0.35, 18.6, 0, 1.6, 0, KTX_B),
    cbox(2.6, 0.6, 18.0, 0, 0.35, 0, TY),
  ]);
}
function lampGeo(len, w, y, back) {
  const g = [];
  for (const s of [-1, 1]) g.push(new THREE.BoxGeometry(0.28, 0.16, 0.06).translate(s * w, y, back ? -len : len));
  return mergeGeometries(g);
}

const CAR_COLORS = [0xf2f2f0, 0xf2f2f0, 0x1c1d20, 0x9aa1a8, 0x5b6168, 0x1f3b66, 0x8a1e1e, 0xd8d2c4, 0x2c4a3a];
const BUS_COLORS = [0x2a6bd8, 0x2a6bd8, 0x3aa35a, 0x3aa35a, 0xd8432f];

class Path {
  constructor(pts) {
    this.p = pts.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.len = this.cum[this.cum.length - 1];
  }
  /* 거리 s에서의 위치와 진행 방향(단위 벡터) */
  at(s, outP, outD) {
    s = THREE.MathUtils.clamp(s, 0, this.len);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    outP.lerpVectors(a, b, (s - this.cum[lo]) / seg);
    outD.subVectors(b, a).normalize();
  }
}

/* 한 종류(차/버스/기차 칸)를 그리는 인스턴스 묶음 */
class Fleet {
  constructor(scene, geo, max, emissive) {
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.lights = [];
    for (const [g, col] of emissive || []) {
      const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 0.4 }), max);
      m.instanceMatrix = this.mesh.instanceMatrix;   // 같은 행렬 버퍼 공유
      m.frustumCulled = false; m.count = 0;
      scene.add(m); this.lights.push(m);
    }
  }
  setCount(n) { this.mesh.count = n; for (const l of this.lights) l.count = n; }
  setVisible(v) { this.mesh.visible = v; for (const l of this.lights) l.visible = v; }
  setNight(on) { for (const l of this.lights) l.material.emissiveIntensity = on ? 3.0 : 0.4; }
  commit() { this.mesh.instanceMatrix.needsUpdate = true; }
}

const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function place(fleet, i, pos, dir, scale = 1) {
  _q.setFromAxisAngle(_up, Math.atan2(dir.x, dir.z));
  _s.setScalar(scale);
  _m.compose(pos, _q, _s);
  fleet.mesh.setMatrixAt(i, _m);
}

export function createTraffic(scene, data) {
  const car = new Fleet(scene, carGeo(), 4000, [[lampGeo(2.2, 0.62, 0.6, false), 0xfff2d0], [lampGeo(2.2, 0.62, 0.65, true), 0xff2a1a]]);
  const bus = new Fleet(scene, busGeo(), 400, [[lampGeo(5.78, 0.9, 0.7, false), 0xfff2d0], [lampGeo(5.78, 0.9, 0.8, true), 0xff2a1a]]);
  const train = new Fleet(scene, trainGeo(), 600, [[cbox(3.04, 0.12, 18.0, 0, 3.35, 0, W), 0xcfe4ff]]);

  /* 차로마다 차량을 같은 속도·간격으로 띄워 서로 겹치지 않게 */
  function lanesFor(list) {
    const out = [];
    for (const r of list) {
      const fwd = new Path(r.pts);
      if (fwd.len < 25) continue;
      const rev = r.oneway ? null : new Path([...r.pts].reverse());
      const dirs = rev ? [fwd, rev] : [fwd];
      const per = rev ? Math.max(1, Math.ceil(r.lanes / 2)) : r.lanes;
      const vmax = /primary/.test(r.cls) ? 13 : /secondary|tertiary/.test(r.cls) ? 10.5 : r.cls === 'busway' ? 7.5 : 7;
      for (const path of dirs) {
        for (let k = 0; k < per; k++) {
          const off = rev ? (k + 0.5) * 3.2 : (k - (per - 1) / 2) * 3.2;
          out.push({ path, off, v: vmax * rand(0.85, 1.05), r });
        }
      }
    }
    return out;
  }
  function spawn(lanes, gapMin, gapMax, colors) {
    const v = [];
    for (const ln of lanes) {
      const gap = rand(gapMin, gapMax);
      const n = Math.max(1, Math.floor(ln.path.len / gap));
      const s0 = Math.random() * gap;
      for (let i = 0; i < n; i++) v.push({ ln, s: s0 + i * gap + rand(-0.15, 0.15) * gap, col: new THREE.Color(pick(colors)) });
    }
    return v;
  }

  const sets = {};
  for (const st of ['e', 'p']) {
    const carLanes = lanesFor(data.cars.filter((c) => c.st === st));
    // 현황의 버스환승센터 차로에는 정차 중인 버스 모델이 이미 있어서, 움직이는 버스는 제안안 버스 거리에만
    const busLanes = st === 'p' ? lanesFor(data.buses.filter((c) => c.st.includes(st))) : [];
    // 현황: 큰길에는 버스도 섞어서
    const mixBus = st === 'e' ? lanesFor(data.cars.filter((c) => c.st === st && c.cls === 'primary')) : [];
    sets[st] = {
      cars: spawn(carLanes, 28, 60, CAR_COLORS),
      buses: [...spawn(busLanes, 34, 60, BUS_COLORS), ...spawn(mixBus, 220, 380, BUS_COLORS)],
    };
  }
  /* 기차: 선로마다 1편성(8~10칸), 방향은 선로마다 무작위, 지나간 뒤 잠시 쉬었다 다시 */
  const trains = data.trains.map((t) => {
    const path = new Path(Math.random() < 0.5 ? t.pts : [...t.pts].reverse());
    const n = (Math.random() * 3 | 0) + 8;
    return { path, n, v: rand(9, 15), s: rand(-path.len * 0.6, path.len), rest: 0 };
  });

  let stage = 'e', visible = true;
  const colorDirty = { car: true, bus: true };

  function writeColors(fleet, list) {
    for (let i = 0; i < list.length; i++) fleet.mesh.setColorAt(i, list[i].col);
    if (fleet.mesh.instanceColor) fleet.mesh.instanceColor.needsUpdate = true;
  }

  function moveVehicles(fleet, list, dt) {
    let i = 0;
    for (const c of list) {
      const L = c.ln.path.len;
      c.s += c.ln.v * dt;
      if (c.s > L) c.s -= L;
      c.ln.path.at(c.s, _p, _d);
      _r.set(-_d.z, 0, _d.x);
      _p.addScaledVector(_r, c.ln.off);
      // 길 끝에서 갑자기 나타나거나 사라지지 않게 살짝 작게
      const edge = Math.min(c.s, L - c.s);
      const sc = edge < 6 ? Math.max(0.001, edge / 6) : 1;
      place(fleet, i++, _p, _d, sc);
    }
    fleet.setCount(list.length);
    fleet.commit();
  }

  function moveTrains(dt) {
    let i = 0;
    for (const t of trains) {
      const L = t.path.len, span = t.n * 19.5;
      if (t.rest > 0) { t.rest -= dt; continue; }
      t.s += t.v * dt;
      if (t.s - span > L) { t.s = -rand(0, 40); t.rest = rand(6, 30); continue; }
      for (let k = 0; k < t.n; k++) {
        const sk = t.s - k * 19.5 - 9.75;
        if (sk < 0 || sk > L) continue;
        t.path.at(sk, _p, _d);
        place(train, i++, _p, _d);
      }
    }
    train.setCount(i);
    train.commit();
  }

  return {
    setStage(st) {
      if (st === stage) return;
      stage = st; colorDirty.car = colorDirty.bus = true;
    },
    setVisible(v) { visible = v; car.setVisible(v); bus.setVisible(v); train.setVisible(v); },
    setNight(on) { car.setNight(on); bus.setNight(on); train.setNight(on); },
    update(dt) {
      if (!visible) return;
      const S = sets[stage];
      if (colorDirty.car) { writeColors(car, S.cars); colorDirty.car = false; }
      if (colorDirty.bus) { writeColors(bus, S.buses); colorDirty.bus = false; }
      moveVehicles(car, S.cars, dt);
      moveVehicles(bus, S.buses, dt);
      moveTrains(dt);
    },
    counts() { const S = sets[stage]; return { cars: S.cars.length, buses: S.buses.length, trains: trains.length }; },
  };
}

/* ------------------------------------------------------------------ *
 *  사람 걷기: 서 있는 사람 인스턴스를 바라보는 방향으로 몇 m 걸었다가 돌아오게
 * ------------------------------------------------------------------ */
const _base = new THREE.Matrix4(), _fwd = new THREE.Vector3(), _t = new THREE.Vector3(), _flip = new THREE.Matrix4().makeRotationY(Math.PI);
export function createWalkers() {
  const groups = [];   // { mesh, base: Float32Array, prm: Float32Array(4/inst) }
  function seeded(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  return {
    add(mesh) {
      const n = mesh.count;
      const base = new Float32Array(mesh.instanceMatrix.array);
      const prm = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        // 같은 사람의 여러 부분(몸·머리)이 같은 값을 쓰도록 인덱스로 정함
        prm[i * 4] = 1.5 + seeded(i) * 3.5;        // 걷는 거리
        prm[i * 4 + 1] = 1.0 + seeded(i + 7) * 0.5; // 속도
        prm[i * 4 + 2] = seeded(i + 13) * 100;      // 시작 위상
        prm[i * 4 + 3] = seeded(i + 29) < 0.25 ? 0 : 1; // 25%는 서서 이야기 중
      }
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.matrixAutoUpdate = false;
      groups.push({ mesh, base, prm, n });
    },
    update(time) {
      for (const g of groups) {
        if (!g.mesh.visible || !g.mesh.parent?.visible) continue;
        const a = g.mesh.instanceMatrix.array;
        for (let i = 0; i < g.n; i++) {
          if (!g.prm[i * 4 + 3]) continue;
          const L = g.prm[i * 4], v = g.prm[i * 4 + 1];
          const cyc = ((time * v + g.prm[i * 4 + 2]) % (2 * L));
          const back = cyc > L;
          const d = back ? 2 * L - cyc : cyc;
          _base.fromArray(g.base, i * 16);
          // 앞 방향 = 로컬 -Z (Blender +Y)
          _fwd.set(-_base.elements[8], -_base.elements[9], -_base.elements[10]).normalize();
          _t.setFromMatrixPosition(_base).addScaledVector(_fwd, d);
          _t.y += Math.abs(Math.sin(time * v * 5 + i)) * 0.04;
          if (back) _base.multiply(_flip);
          _base.setPosition(_t);
          _base.toArray(a, i * 16);
        }
        g.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    reset() {   // 원래 자리로
      for (const g of groups) { g.mesh.instanceMatrix.array.set(g.base); g.mesh.instanceMatrix.needsUpdate = true; }
    },
    size() { return groups.reduce((s, g) => s + g.n, 0); },
    _groups: groups,
  };
}
