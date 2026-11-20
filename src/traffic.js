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
  return g.toNonIndexed();
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
/* 정점 색을 함수로 칠하는 지오메트리 (앞코처럼 모양을 깎은 차량용) */
function paint(g, fn) {
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = fn(v); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
/* KTX: 흰 차체에 진한 파랑 띠, 동력차는 길고 낮게 깎인 앞코 */
const KTX_NAVY = [0.06, 0.16, 0.42], SILVER = [0.78, 0.8, 0.82];
function ktxCarGeo() {
  return mergeGeometries([
    cbox(2.95, 3.0, 18.4, 0, 2.05, 0, W),
    cbox(2.97, 0.62, 17.0, 0, 2.7, 0, GL),
    cbox(2.98, 0.42, 18.4, 0, 1.55, 0, KTX_NAVY),
    cbox(2.6, 0.6, 18.0, 0, 0.35, 0, TY),
    cbox(2.4, 0.2, 18.0, 0, 3.62, 0, SILVER),
  ]);
}
function ktxHeadGeo() {
  // 뒤쪽 12m는 보통 차체, 앞 7m(z 2.3~9.3)는 위·옆이 점점 좁아지는 앞코
  const body = cbox(2.95, 3.0, 11.6, 0, 2.05, -3.5, W);
  const band = cbox(2.98, 0.42, 11.6, 0, 1.55, -3.5, KTX_NAVY);
  const win = cbox(2.97, 0.62, 8.0, 0, 2.7, -5.0, GL);
  const nose = new THREE.BoxGeometry(2.95, 3.0, 7.0, 8, 8, 14);
  const P = nose.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i) + 1.5, z = P.getZ(i) + 3.5;  // y 0~3, z 0~7
    const t = z / 7;
    x *= 1 - 0.5 * Math.pow(t, 1.6);
    y *= 1 - 0.72 * Math.pow(t, 1.25);
    P.setXYZ(i, x, y + 0.55, z + 2.3);
  }
  nose.computeVertexNormals();
  paint(nose, (v) => {
    const t = (v.z - 2.3) / 7, top = 3.55 * (1 - 0.72 * Math.pow(Math.max(0, t), 1.25)) + 0.55;
    if (t > 0.08 && t < 0.62 && v.y > top - 0.75) return GL;                 // 앞 유리
    return W;
  });
  return mergeGeometries([body, band, win, nose, cbox(2.6, 0.6, 18.0, 0, 0.35, 0, TY)].map((g) => g.index ? g.toNonIndexed() : g));
}
/* 무궁화호: 남색·주황 디젤기관차 + 둥근 지붕의 연회색 객차 (파랑·빨강 띠) */
const LOCO_BLUE = [0.07, 0.16, 0.36], ORANGE = [0.92, 0.42, 0.1], COACH = [0.86, 0.87, 0.86], RED = [0.75, 0.12, 0.1], BLUE2 = [0.12, 0.32, 0.7];
function roof(len, y, rgb) {
  const g = new THREE.CylinderGeometry(1.48, 1.48, len, 16, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2); g.scale(1, 0.32, 1); g.translate(0, y, 0);   // 위쪽 반원
  return paint(g.toNonIndexed(), () => rgb);
}
function mugCoachGeo() {
  return mergeGeometries([
    cbox(2.95, 2.75, 18.8, 0, 1.95, 0, COACH),
    roof(18.8, 3.32, [0.7, 0.72, 0.72]),
    cbox(2.97, 0.8, 17.6, 0, 2.5, 0, GL),
    cbox(2.98, 0.32, 18.8, 0, 1.45, 0, BLUE2),
    cbox(2.98, 0.1, 18.8, 0, 1.68, 0, RED),
    cbox(2.6, 0.6, 18.4, 0, 0.35, 0, TY),
  ].map((g) => g.index ? g.toNonIndexed() : g));
}
function mugLocoGeo() {
  return mergeGeometries([
    cbox(2.9, 2.9, 15.0, 0, 2.05, -1.6, LOCO_BLUE),
    cbox(2.92, 0.5, 15.0, 0, 1.6, -1.6, ORANGE),
    cbox(2.9, 3.1, 3.2, 0, 2.15, 7.4, LOCO_BLUE),          // 운전실
    cbox(2.6, 0.9, 0.06, 0, 3.0, 9.02, GL),                  // 앞 유리
    cbox(2.92, 0.5, 3.2, 0, 1.6, 7.4, ORANGE),
    cbox(2.94, 0.9, 0.08, 0, 1.15, 9.03, ORANGE),            // 앞면 주황
    roof(15.0, 3.5, [0.2, 0.22, 0.26]),
    cbox(2.6, 0.7, 18.4, 0, 0.4, 0, TY),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
}
function lampGeo(len, w, y, back) {
  const g = [];
  for (const s of [-1, 1]) g.push(new THREE.BoxGeometry(0.28, 0.16, 0.06).translate(s * w, y, back ? -len : len).toNonIndexed());
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
  setNightLevel(k) { for (const l of this.lights) l.material.emissiveIntensity = 0.4 + 2.6 * k; }
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
  // 열차 종류별 칸 (현재 모델 / KTX 동력차·객차 / 무궁화호 기관차·객차)
  const TF = {
    gen: train,
    ktxHead: new Fleet(scene, ktxHeadGeo(), 200, [[lampGeo(9.1, 0.55, 1.05, false), 0xfff6e0]]),
    ktxCar: new Fleet(scene, ktxCarGeo(), 600, [[cbox(2.99, 0.08, 17.0, 0, 3.05, 0, W), 0xcfe4ff]]),
    mugLoco: new Fleet(scene, mugLocoGeo(), 100, [[lampGeo(9.06, 0.9, 1.6, false), 0xfff2d0]]),
    mugCar: new Fleet(scene, mugCoachGeo(), 600, [[cbox(2.99, 0.08, 17.6, 0, 2.95, 0, W), 0xffe2b0]]),
  };

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
      // 짧은 차로에도 꼭 한 대씩 생기지 않게: 길이에 비례한 확률로
      const n = Math.floor(ln.path.len / gap + Math.random());
      if (!n) continue;
      const s0 = Math.random() * gap;
      for (let i = 0; i < n; i++) v.push({ ln, s: s0 + i * gap + rand(-0.15, 0.15) * gap, col: new THREE.Color(pick(colors)) });
    }
    return v;
  }

/* 현황 버스환승센터: 정차 중이던 버스 모델 자리(=정류장)를 지나는 7개 차로.
     Blender 좌표 x = x0 - 0.03*y (도로가 살짝 휘어 있음), dir +1 북행 / -1 남행 */
  const BTC = [
    // 서쪽 세 차로는 구역사 정면·버스센터 눈높이 카메라 자리(y 40~46)를 피해 y 32부터 시작
    { x0: 89.5, dir: -1, stops: [14.9, -7.0], top: 32 }, { x0: 96.5, dir: -1, stops: [23.4], top: 32 },
    { x0: 102.7, dir: -1, stops: [-18.9, -38.6], top: 32 }, { x0: 105.6, dir: 1, stops: [0.9, -19.1] },
    { x0: 112.6, dir: 1, stops: [24.2, 2.7, -14.7] }, { x0: 122.9, dir: -1, stops: [34.2, -42.6] },
    { x0: 129.6, dir: 1, stops: [37.4, 15.5, 0.8, -29.1] },
  ];
  const btcLanes = BTC.map((l) => {
    const ys = [];
    const top = l.top ?? 108;
    for (let y = -118; y <= top; y += 2) ys.push(y);
    if (l.dir < 0) ys.reverse();
    const path = new Path(ys.map((y) => [l.x0 - 0.03 * y, 0.12, -y]));
    // 정류장 위치를 경로 거리로 (버스 중심이 정차 위치에 오도록)
    const stops = l.stops.map((y) => (l.dir > 0 ? y + 118 : top - y)).sort((p, q) => p - q);
    return { path, off: 0, v: 8.5, stops, r: { cls: 'busway' } };
  });

  const sets = {};
  for (const st of ['e', 'p']) {
    const carLanes = lanesFor(data.cars.filter((c) => c.st === st));
    // 현황의 버스환승센터 차로에는 정차 중인 버스 모델이 이미 있어서, 움직이는 버스는 제안안 버스 거리에만
    const busLanes = st === 'p' ? lanesFor(data.buses.filter((c) => c.st.includes(st))) : [];
    // 현황: 큰길에는 버스도 섞어서
    const mixBus = st === 'e' ? lanesFor(data.cars.filter((c) => c.st === st && c.cls === 'primary')) : [];
    sets[st] = {
      cars: spawn(carLanes, 28, 60, CAR_COLORS),
      buses: [...spawn(busLanes, 34, 60, BUS_COLORS), ...spawn(mixBus, 600, 1000, BUS_COLORS)],
      // 정류장에 서는 버스 (앞차와 간격 유지)
      btc: st === 'e' ? spawn(btcLanes, 40, 70, BUS_COLORS) : [],
    };
  }
  /* 기차: 선로마다 1편성(8~10칸), 방향은 선로마다 무작위, 지나간 뒤 잠시 쉬었다 다시 */
  const trains = data.trains.map((t) => {
    const path = new Path(Math.random() < 0.5 ? t.pts : [...t.pts].reverse());
    // 편성: 칸마다 [종류, 뒤집기]. 종류는 무작위 비율로 (KTX 40% · 무궁화호 35% · 기존 25%)
    const r = Math.random();
    let cars, v;
    if (r < 0.4) {        // KTX: 앞뒤 동력차 + 객차 8
      cars = [['ktxHead', false], ...Array(8).fill(['ktxCar', false]), ['ktxHead', true]]; v = rand(12, 17);
    } else if (r < 0.75) { // 무궁화호: 기관차 + 객차 5~7
      cars = [['mugLoco', false], ...Array((Math.random() * 3 | 0) + 5).fill(['mugCar', false])]; v = rand(8, 12);
    } else {
      cars = Array((Math.random() * 3 | 0) + 8).fill(['gen', false]); v = rand(9, 15);
    }
    return { path, cars, n: cars.length, v, s: rand(-path.len * 0.6, path.len), rest: 0 };
  });

  let stage = 'e', visible = true;
  let crowd = null;
  const colorDirty = { car: true, bus: true };

  function writeColors(fleet, list) {
    for (let i = 0; i < list.length; i++) fleet.mesh.setColorAt(i, list[i].col);
    if (fleet.mesh.instanceColor) fleet.mesh.instanceColor.needsUpdate = true;
  }

  function moveVehicles(fleet, list, dt, commit = true) {
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
    if (commit) { fleet.setCount(list.length); fleet.commit(); }
  }

  /* 앞차를 따라가고 정류장에서 잠깐 서는 버스 */
  function moveStopping(list, dt, start) {
    const byLane = new Map();
    for (const c of list) { if (!byLane.has(c.ln)) byLane.set(c.ln, []); byLane.get(c.ln).push(c); }
    let i = start;
    for (const [ln, arr] of byLane) {
      const L = ln.path.len;
      arr.sort((p, q) => p.s - q.s);
      for (let k = 0; k < arr.length; k++) {
        const c = arr[k], lead = arr[(k + 1) % arr.length];
        if (c.v == null) { c.v = ln.v; c.wait = 0; c.served = -1; }
        let gap = lead === c ? Infinity : (lead.s - c.s + L) % L;
        if (c.wait > 0) { c.wait -= dt; c.v = 0; }
        else {
          const want = gap < 15 ? 0 : gap < 30 ? ln.v * (gap - 15) / 15 : ln.v;
          // 다음 정류장에 다가가면 속도를 줄이고 서기
          const nx = ln.stops.findIndex((p) => p > c.s - 0.5 && ln.stops.indexOf(p) > c.served);
          let brake = Infinity;
          if (nx >= 0) {
            const d = ln.stops[nx] - c.s;
            if (d < 0.6) { c.wait = rand(6, 12); c.served = nx; }
            else brake = Math.sqrt(2 * 1.2 * d);
          }
          c.v = THREE.MathUtils.lerp(c.v, Math.min(want, brake), Math.min(1, dt * 2));
        }
        c.s += c.v * dt;
        if (c.s > L) { c.s -= L; c.served = -1; }
      }
      for (const c of arr) {
        ln.path.at(c.s, _p, _d);
        const edge = Math.min(c.s, L - c.s);
        place(bus, i++, _p, _d, edge < 6 ? Math.max(0.001, edge / 6) : 1);
      }
    }
    return i;
  }

  const _back = new THREE.Vector3();
  function moveTrains(dt) {
    const cnt = { gen: 0, ktxHead: 0, ktxCar: 0, mugLoco: 0, mugCar: 0 };
    for (const t of trains) {
      const L = t.path.len, span = t.n * 19.5;
      if (t.rest > 0) { t.rest -= dt; continue; }
      t.s += t.v * dt;
      if (t.s - span > L) { t.s = -rand(0, 40); t.rest = rand(6, 30); continue; }
      for (let k = 0; k < t.n; k++) {
        const sk = t.s - k * 19.5 - 9.75;
        if (sk < 0 || sk > L) continue;
        t.path.at(sk, _p, _d);
        const [kind, flip] = t.cars[k];
        place(TF[kind], cnt[kind]++, _p, flip ? _back.copy(_d).negate() : _d);
      }
    }
    for (const [k, f] of Object.entries(TF)) { f.setCount(cnt[k]); f.commit(); }
  }

  return {
    setStage(st) {
      if (st === stage) return;
      stage = st; colorDirty.car = colorDirty.bus = true;
    },
    setVisible(v) { visible = v; car.setVisible(v); bus.setVisible(v); for (const f of Object.values(TF)) f.setVisible(v); crowd?.setVisible(v); },
    /* 거리 보행자: masters(사람 원본 모델)가 준비되면 붙임 */
    addPeople(masters) {
      if (crowd || !data.walk) return;
      crowd = createCrowd(scene, data.walk, masters);
      crowd.setVisible(visible);
    },
    setNightLevel(k) { car.setNightLevel(k); bus.setNightLevel(k); for (const f of Object.values(TF)) f.setNightLevel(k); },
    update(dt) {
      if (!visible) return;
      const S = sets[stage];
      if (colorDirty.car) { writeColors(car, S.cars); colorDirty.car = false; }
      if (colorDirty.bus) { writeColors(bus, [...S.buses, ...S.btc]); colorDirty.bus = false; }
      moveVehicles(car, S.cars, dt);
      moveVehicles(bus, S.buses, dt, false);
      const nb = moveStopping(S.btc, dt, S.buses.length);
      bus.setCount(nb); bus.commit();
      moveTrains(dt);
      crowd?.update(dt, stage);
    },
    _trains: trains,
    counts() { const S = sets[stage]; return { cars: S.cars.length, buses: S.buses.length + S.btc.length, trains: trains.length, people: crowd?.count(stage) || 0 }; },
  };
}

/* ------------------------------------------------------------------ *
 *  거리 보행자: 보도·횡단보도·광장·서울로를 따라 양방향으로 걷는 사람들
 * ------------------------------------------------------------------ */
function createCrowd(scene, walks, masters) {
  const kinds = [];
  for (let k = 0; k < 6; k++) {
    const node = masters.get(`PRA_Person_stand_${k}`);
    if (!node) continue;
    const parts = [];
    node.updateMatrixWorld(true);
    node.traverse((m) => { if (m.isMesh) parts.push(m); });
    kinds.push(parts);
  }
  if (!kinds.length) return null;
  const people = [];
  for (const w of walks) {
    const fwd = new Path(w.pts);
    if (fwd.len < 6) continue;
    const rev = new Path([...w.pts].reverse());
    const n = Math.max(1, Math.round(fwd.len / (w.cross ? 6 : 9)));
    for (let i = 0; i < n; i++) {
      const path = i % 2 ? rev : fwd;
      people.push({
        path, st: w.st, s: Math.random() * path.len, v: rand(1.0, 1.55),
        off: (i % 2 ? 1 : -1) * rand(0.3, Math.max(0.4, (w.w || 2) / 2 - 0.2)),
        kind: (Math.random() * kinds.length) | 0, ph: Math.random() * 10,
      });
    }
  }
  // 종류(사람 모델)별로 몸의 각 부분마다 InstancedMesh
  const fleets = kinds.map((parts, k) => {
    const cap = people.filter((p) => p.kind === k).length || 1;
    return parts.map((m) => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      im.userData.local = m.matrixWorld.clone();   // 원본 안에서의 부분 위치
      scene.add(im);
      return im;
    });
  });
  const _yaw = new THREE.Quaternion(), _pm = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
  let t = 0, visible = true;
  return {
    setVisible(v) { visible = v; for (const f of fleets) for (const im of f) im.visible = v; },
    count(stage) { return people.filter((p) => p.st.includes(stage)).length; },
    update(dt, stage) {
      if (!visible) return;
      t += dt;
      const idx = fleets.map(() => 0);
      for (const p of people) {
        if (!p.st.includes(stage)) continue;
        const L = p.path.len;
        p.s += p.v * dt;
        if (p.s > L) p.s -= L;
        p.path.at(p.s, _p, _d);
        _r.set(-_d.z, 0, _d.x);
        _p.addScaledVector(_r, p.off);
        _p.y += Math.abs(Math.sin((t + p.ph) * p.v * 5)) * 0.04;
        const edge = Math.min(p.s, L - p.s);
        const sc = edge < 3 ? Math.max(0.001, edge / 3) : 1;
        // 사람 모델의 앞은 -Z
        _yaw.setFromAxisAngle(_up, Math.atan2(_d.x, _d.z) + Math.PI);
        _pm.compose(_p, _yaw, _s.setScalar(sc));
        const f = fleets[p.kind], k = idx[p.kind]++;
        for (const im of f) { _m.multiplyMatrices(_pm, im.userData.local); im.setMatrixAt(k, _m); }
      }
      fleets.forEach((f, k) => { for (const im of f) { im.count = idx[k]; im.instanceMatrix.needsUpdate = true; } });
    },
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
