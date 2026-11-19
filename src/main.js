import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { STAGES, PROBLEMS, PLACES, LANDMARKS } from './content.js';

const BASE = import.meta.env.BASE_URL;
const $ = (s) => document.querySelector(s);

/* 단계별로 켜지는 레이어 */
function layersFor(state) {
  const s = new Set(['base', 'keep']);
  const { stage, tog, focus } = state;
  const showProposal = stage === 'proposal' && !tog.has('cmp');
  if (showProposal) {
    s.add('proposal');
    s.add('props');
    if (tog.has('int')) s.add('proposal_interior');
    if (tog.has('ug')) { s.add('proposal_ug'); s.add('ug_interiors'); }
    s.add('water_garden');
    if (tog.has('tags')) s.add('proposal_tags');
  } else {
    s.add('existing_station');
    s.add('existing_vehicles');
    s.add('existing_roads');
    if (tog.has('ug')) { s.add('ug_transit'); s.add('ug_interiors'); }
    if (stage === 'problems') {
      for (const p of PROBLEMS) if (focus == null || focus === p.n) s.add(p.layer);
    }
  }
  return s;
}

/* ------------------------------------------------------------------ *
 *  three.js 기본 세팅
 * ------------------------------------------------------------------ */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const DAY = { sky: new THREE.Color(0xdbe3e8), sun: 2.1, hemi: 0.9, env: 0.55, ground: 0x777a75, emis: 1 };
const NIGHT = { sky: new THREE.Color(0x0b1424), sun: 0.12, hemi: 0.16, env: 0.07, ground: 0x1a1f26, emis: 1.0 };

const scene = new THREE.Scene();
scene.background = DAY.sky.clone();
scene.fog = new THREE.Fog(DAY.sky.clone(), 1400, 4200);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = DAY.env;

const sun = new THREE.DirectionalLight(0xfff4e0, DAY.sun);
sun.position.set(-300, 500, 250);
const hemi = new THREE.HemisphereLight(0xdfeaf2, 0x6f6a60, DAY.hemi);
scene.add(sun, hemi);

const groundMat = new THREE.MeshBasicMaterial({ color: DAY.ground });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.25;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 5200);
camera.position.set(380, 520, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;

/* 밤 모드용 빛 번짐(블룸) — 밤에만 사용 */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.35, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let dirty = true;
controls.addEventListener('change', () => (dirty = true));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ *
 *  모델 로딩
 * ------------------------------------------------------------------ */
const draco = new DRACOLoader().setDecoderPath(`${BASE}draco/`);
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const layers = new Map();      // id -> { group, promise, mats }
const groundMeshes = [];
const XRAY_EXEMPT = new Set(['ug_transit', 'ug_interiors', 'proposal_ug']);
let xray = false;
let night = false;
let pending = 0;

function applyXray(id, entry) {
  if (!entry.mats || XRAY_EXEMPT.has(id)) return;
  for (const m of entry.mats) {
    if (xray) {
      if (!m.userData.xr) m.userData.xr = { t: m.transparent, o: m.opacity, d: m.depthWrite };
      m.transparent = true;
      m.opacity = Math.min(m.userData.xr.o, 0.13);
      m.depthWrite = false;
    } else if (m.userData.xr) {
      const s = m.userData.xr;
      m.transparent = s.t; m.opacity = s.o; m.depthWrite = s.d;
      m.userData.xr = null;
    }
    m.needsUpdate = true;
  }
}

/* 발광 재질(조명·전광판·한지 등)은 밤에 더 밝게 */
function applyNightMats(entry) {
  if (!entry.mats) return;
  for (const m of entry.mats) {
    if (!m.emissive || m.emissive.getHex() === 0) continue;
    if (m.userData.ei == null) m.userData.ei = m.emissiveIntensity;
    m.emissiveIntensity = m.userData.ei * (night ? NIGHT.emis : DAY.emis);
  }
}

let INSTANCES = {};
let mastersPromise = null;
function loadMasters() {
  if (!mastersPromise) {
    mastersPromise = gltfLoader.loadAsync(`${BASE}models/masters.glb`).then((gltf) => {
      const map = new Map();
      gltf.scene.traverse((o) => { if (o.name.startsWith('M__')) map.set(o.name.slice(3), o); });
      return map;
    });
  }
  return mastersPromise;
}

async function attachInstances(id, g) {
  const data = INSTANCES[id];
  if (!data) return;
  const masters = await loadMasters();
  const m4 = new THREE.Matrix4();
  for (const [key, arr] of Object.entries(data)) {
    const node = masters.get(THREE.PropertyBinding.sanitizeNodeName(key));
    if (!node) { console.warn('master missing:', key); continue; }
    const n = arr.length / 12;
    node.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      const im = new THREE.InstancedMesh(mesh.geometry, mat, n);
      for (let k = 0; k < n; k++) {
        const o = k * 12;
        m4.set(arr[o], arr[o + 1], arr[o + 2], arr[o + 9],
               arr[o + 3], arr[o + 4], arr[o + 5], arr[o + 10],
               arr[o + 6], arr[o + 7], arr[o + 8], arr[o + 11],
               0, 0, 0, 1);
        im.setMatrixAt(k, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      g.add(im);
    });
  }
}

function loadLayer(id) {
  if (layers.has(id)) return layers.get(id).promise;
  const entry = { group: null };
  entry.promise = new Promise((resolve, reject) => {
    pending++; updateLoadbar();
    gltfLoader.load(
      `${BASE}models/${id}.glb`,
      (gltf) => {
        const g = gltf.scene;
        g.visible = false;
        attachInstances(id, g)
          .catch((e) => console.warn('instances fail', id, e))
          .then(() => {
            entry.mats = new Set();
            g.traverse((o) => {
              if (!o.isMesh) return;
              if (/^(G_|T_)/.test(o.name)) groundMeshes.push(o);
              if (id === 'base' && o.name.startsWith('G_')) o.userData.baseRoad = true;
              (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => entry.mats.add(m));
            });
            applyXray(id, entry);
            applyNightMats(entry);
            updateGround();
            g.updateMatrixWorld(true);
            g.traverse((o) => { o.matrixAutoUpdate = false; });
            scene.add(g);
            entry.group = g;
            pending--; updateLoadbar(); dirty = true;
            resolve(g);
          });
      },
      undefined,
      (err) => { pending--; updateLoadbar(); console.error('load fail', id, err); reject(err); },
    );
  });
  layers.set(id, entry);
  return entry.promise;
}

function updateLoadbar() { $('#loadbar').classList.toggle('on', pending > 0); }

async function applyLayers() {
  const want = layersFor(state);
  updateGround();
  const nextXray = state.tog.has('ug');
  if (nextXray !== xray) {
    xray = nextXray;
    for (const [id, e] of layers) applyXray(id, e);
    updateGround();
  }
  const loads = [];
  for (const id of want) loads.push(loadLayer(id).catch(() => null));
  for (const [id, e] of layers) if (e.group) e.group.visible = want.has(id);
  await Promise.all(loads);
  for (const [id, e] of layers) if (e.group) e.group.visible = want.has(id);
  dirty = true;
}

/* ------------------------------------------------------------------ *
 *  낮 / 밤
 * ------------------------------------------------------------------ */
function setNight(on) {
  night = on;
  const P = on ? NIGHT : DAY;
  scene.background.copy(P.sky);
  scene.fog.color.copy(P.sky);
  sun.intensity = P.sun;
  sun.color.set(on ? 0x9fb4ff : 0xfff4e0);
  hemi.intensity = P.hemi;
  scene.environmentIntensity = P.env;
  groundMat.color.set(P.ground);
  for (const e of layers.values()) applyNightMats(e);
  document.body.classList.toggle('night', on);
  $('#btn-night').setAttribute('aria-pressed', String(on));
  $('#btn-night').textContent = on ? '☀' : '☾';
  $('#btn-night').title = on ? '낮으로' : '밤으로';
  dirty = true;
}

/* ------------------------------------------------------------------ *
 *  카메라 이동
 * ------------------------------------------------------------------ */
let CAMS = {}, MARKS = {};
let tween = null;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

let eyeMode = false;
function setConstraints(eye) {
  eyeMode = eye;
  if (eye) {
    controls.minDistance = 0.5; controls.maxDistance = 0.5;
    controls.rotateSpeed = -0.45;
    controls.enablePan = false; controls.enableZoom = false;
    controls.maxPolarAngle = Math.PI * 0.98; controls.minPolarAngle = Math.PI * 0.02;
    camera.near = 0.2;
  } else {
    controls.minDistance = 6; controls.maxDistance = 2500;
    controls.rotateSpeed = 0.9;
    controls.enablePan = true; controls.enableZoom = true;
    controls.maxPolarAngle = Math.PI * 0.495; controls.minPolarAngle = 0;
    camera.near = 1;
  }
  camera.updateProjectionMatrix();
}

function flyTo(camId, { instant = false } = {}) {
  const c = CAMS[camId];
  if (!c || c.ortho) return;
  const pos = V(c.pos);
  let target = V(c.target);
  const eye = c.eye ?? c.pos[1] < 8;
  if (eye) target = pos.clone().add(target.clone().sub(pos).normalize().multiplyScalar(0.5));
  const to = { pos, target, fov: c.fov || 45, eye };
  if (instant) {
    camera.position.copy(pos); controls.target.copy(target); camera.fov = to.fov;
    setConstraints(eye); camera.updateProjectionMatrix(); controls.update(); dirty = true;
    return;
  }
  controls.enabled = false;
  controls.minDistance = 0; controls.maxDistance = Infinity;
  controls.maxPolarAngle = Math.PI; controls.minPolarAngle = 0;
  camera.near = 0.2; camera.updateProjectionMatrix();
  tween = {
    t: 0, dur: eye ? 1.3 : 1.6,
    fromPos: camera.position.clone(), fromTgt: controls.target.clone(), fromFov: camera.fov,
    to,
  };
}

function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = ease(tween.t);
  camera.position.lerpVectors(tween.fromPos, tween.to.pos, k);
  controls.target.lerpVectors(tween.fromTgt, tween.to.target, k);
  camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.to.fov, k);
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  dirty = true;
  if (tween.t >= 1) {
    const eye = tween.to.eye;
    tween = null;
    setConstraints(eye);
    controls.enabled = true;
    controls.update();
    if (tour.on) tour.arrivedAt = performance.now();
  }
}

/* ------------------------------------------------------------------ *
 *  UI 상태
 * ------------------------------------------------------------------ */
const state = { stage: 'existing', tog: new Set(), focus: null, cam: 'CAM_Site_Overview' };

/* 현재 단계에서 차례로 넘겨 볼 수 있는 시점 목록 */
function sequence() {
  if (state.stage === 'problems') return [{ kind: 'map' }, ...PROBLEMS.map((p) => ({ kind: 'problem', p }))];
  return STAGES[state.stage].views.filter((v) => CAMS[v.cam]).map((v) => ({ kind: 'view', v }));
}
function seqIndex() {
  const seq = sequence();
  if (state.stage === 'problems') return state.focus == null ? 0 : PROBLEMS.findIndex((p) => p.n === state.focus) + 1;
  return Math.max(0, seq.findIndex((s) => s.v.cam === state.cam));
}
function goSeq(i) {
  const seq = sequence();
  const it = seq[(i + seq.length) % seq.length];
  if (it.kind === 'map') showProblemMap();
  else if (it.kind === 'problem') selectProblem(it.p);
  else goView(it.v);
}

function renderChips() {
  const st = STAGES[state.stage];
  const box = $('#chips');
  box.innerHTML = '';
  if (state.stage === 'problems') {
    box.append(chip('전체 지도', state.focus == null, showProblemMap));
    for (const p of PROBLEMS) box.append(chip(`${p.n} ${p.title}`, state.focus === p.n, () => selectProblem(p), 'prob'));
  } else {
    let group = null;
    for (const v of st.views) {
      if (!CAMS[v.cam]) continue;
      if (v.group && v.group !== group) {
        group = v.group;
        const g = document.createElement('span');
        g.className = 'grp';
        g.textContent = group;
        box.append(g);
      }
      box.append(chip(v.label, state.cam === v.cam, () => goView(v)));
    }
  }
  const tg = $('#toggles');
  tg.innerHTML = '';
  for (const [id, label] of st.toggles) {
    const b = chip(label, state.tog.has(id), () => {
      state.tog.has(id) ? state.tog.delete(id) : state.tog.add(id);
      refresh();
    });
    b.setAttribute('aria-pressed', String(state.tog.has(id)));
    if (id === 'cmp') b.classList.add('cmp');
    tg.append(b);
  }
  // 선택된 칩이 보이도록 스크롤
  requestAnimationFrame(() => box.querySelector('.chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
}

function chip(label, on, fn, extra = '') {
  const b = document.createElement('button');
  b.className = 'chip' + (on ? ' on' : '') + (extra ? ' ' + extra : '');
  b.textContent = label;
  b.addEventListener('click', () => { stopTour(); fn(); });
  return b;
}

function goView(v) {
  state.cam = v.cam;
  state.tog.delete('cmp');
  if (v.needs) for (const n of v.needs) state.tog.add(n);
  else if (state.stage === 'proposal') { state.tog.delete('ug'); }
  refresh();
  flyTo(v.cam);
}

function showProblemMap() {
  state.focus = null; state.cam = 'CAM_P_Map'; state.tog.delete('ug');
  refresh(); flyTo('CAM_P_Map');
}

function selectProblem(p) {
  state.focus = p.n;
  state.cam = p.cam;
  if (p.needs) p.needs.forEach((n) => state.tog.add(n)); else state.tog.delete('ug');
  refresh();
  flyTo(p.cam);
}

/* 문제 → 해법: 제안 단계의 해당 시점으로 바로 이동 */
function goSolution(p) {
  const v = STAGES.proposal.views.find((x) => x.cam === p.sol);
  setStage('proposal', { fly: false });
  if (v) goView(v); else flyTo(p.sol);
}

function refresh() {
  renderChips();
  renderCard();
  applyLayers();
  buildLabels();
  writeHash();
}

function currentView() {
  return STAGES[state.stage].views?.find((v) => v.cam === state.cam);
}

function renderCard() {
  const card = $('#card');
  const seq = sequence();
  const idx = seqIndex();
  let html = '';
  if (state.stage === 'problems') {
    if (state.focus == null) {
      html = `<h3>${STAGES.problems.title}</h3><p>${STAGES.problems.caption}</p>`;
    } else {
      const p = PROBLEMS.find((x) => x.n === state.focus);
      html = `<h3><span class="num bad">${p.n}</span>${p.title}</h3>
        <dl><dt>어디서</dt><dd>${p.where}</dd><dt>왜</dt><dd>${p.why}</dd><dt>해법</dt><dd>${p.fix}</dd></dl>
        <button class="sol" id="btn-sol">제안에서 해법 보기 →</button>`;
    }
  } else {
    const v = currentView();
    const cmp = state.tog.has('cmp');
    html = `<h3>${v ? v.label : STAGES[state.stage].title}${cmp ? ' <em class="was">현황</em>' : ''}</h3>
      <p>${v?.desc || STAGES[state.stage].caption}</p>
      ${v?.ref ? `<p class="ref">참고 · ${v.ref}</p>` : ''}`;
  }
  card.innerHTML = `<div class="card-top"><button class="nav" id="btn-prev" aria-label="이전 시점">‹</button>
    <span class="count">${idx + 1} / ${seq.length}</span>
    <button class="nav" id="btn-next" aria-label="다음 시점">›</button></div>${html}`;
  $('#btn-prev').addEventListener('click', () => { stopTour(); goSeq(seqIndex() - 1); });
  $('#btn-next').addEventListener('click', () => { stopTour(); goSeq(seqIndex() + 1); });
  const sol = $('#btn-sol');
  if (sol) sol.addEventListener('click', () => { stopTour(); goSolution(PROBLEMS.find((x) => x.n === state.focus)); });
}

function setStage(stage, { fly = true } = {}) {
  state.stage = stage;
  state.focus = null;
  state.tog = new Set();
  document.querySelectorAll('#stages button').forEach((b) => {
    b.classList.toggle('on', b.dataset.stage === stage);
    b.setAttribute('aria-selected', String(b.dataset.stage === stage));
  });
  $('#stage-title').textContent = STAGES[stage].title;
  const first = stage === 'problems' ? 'CAM_P_Map' : STAGES[stage].views[0].cam;
  state.cam = first;
  if (fly) { refresh(); flyTo(first); }
}

/* ------------------------------------------------------------------ *
 *  자동 둘러보기
 * ------------------------------------------------------------------ */
const tour = { on: false, arrivedAt: 0, dwell: 4500 };
function startTour() {
  tour.on = true; tour.arrivedAt = 0;
  $('#btn-tour').classList.add('on'); $('#btn-tour').textContent = '■ 멈추기';
  goSeq(seqIndex() + 1);
}
function stopTour() {
  if (!tour.on) return;
  tour.on = false;
  $('#btn-tour').classList.remove('on'); $('#btn-tour').textContent = '▶ 자동 둘러보기';
}
function stepTour() {
  if (!tour.on || tween || !tour.arrivedAt) return;
  if (performance.now() - tour.arrivedAt > tour.dwell) { tour.arrivedAt = 0; goSeq(seqIndex() + 1); }
}

/* ------------------------------------------------------------------ *
 *  주소(#단계/시점)로 공유
 * ------------------------------------------------------------------ */
function writeHash() {
  const key = state.stage === 'problems' ? (state.focus == null ? 'map' : `p${state.focus}`) : state.cam;
  const h = `#${state.stage}/${key}${night ? '/night' : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const [stage, key, n] = location.hash.slice(1).split('/');
  if (!STAGES[stage]) return false;
  if (n === 'night') setNight(true);
  setStage(stage, { fly: false });
  if (stage === 'problems') {
    const p = PROBLEMS.find((x) => `p${x.n}` === key);
    if (p) { state.focus = p.n; state.cam = p.cam; if (p.needs) p.needs.forEach((t) => state.tog.add(t)); }
  } else {
    const v = STAGES[stage].views.find((x) => x.cam === key);
    if (v) { state.cam = v.cam; (v.needs || []).forEach((t) => state.tog.add(t)); }
  }
  flyTo(state.cam, { instant: true });
  return true;
}

/* ------------------------------------------------------------------ *
 *  3D 위치에 붙는 HTML 라벨
 * ------------------------------------------------------------------ */
let labels = [];
const labelBox = $('#labels');

function buildLabels() {
  labelBox.innerHTML = '';
  labels = [];
  for (const [key, text] of Object.entries(LANDMARKS)) {
    if (!MARKS[key]) continue;
    const el = document.createElement('div');
    el.className = 'lbl';
    el.textContent = text;
    labelBox.append(el);
    const p = V(MARKS[key]); p.y = 30;
    labels.push({ el, pos: p, kind: 'landmark' });
  }
  const showPlaces = state.stage === 'proposal' && !state.tog.has('cmp');
  const list = state.stage === 'problems' ? PROBLEMS : showPlaces ? PLACES : [];
  for (const it of list) {
    if (!MARKS[it.badge]) continue;
    const el = document.createElement('button');
    el.className = 'lbl badge' + (state.stage === 'proposal' ? ' good' : '');
    el.innerHTML = `<span class="n">${it.n}</span><span>${it.title}</span>`;
    el.addEventListener('click', () => {
      stopTour();
      if (state.stage === 'problems') return selectProblem(it);
      const v = STAGES.proposal.views.find((x) => x.cam === it.cam) || { cam: it.cam, needs: it.needs };
      goView(v);
    });
    labelBox.append(el);
    labels.push({ el, pos: V(MARKS[it.badge]), kind: 'badge' });
  }
  dirty = true;
}

const _v = new THREE.Vector3();
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  const dist = camera.position.distanceTo(controls.target);
  const aerial = dist > 90 && !eyeMode;
  for (const l of labels) {
    _v.copy(l.pos).project(camera);
    const behind = _v.z > 1 || _v.z < -1;
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    const off = behind || x < -40 || x > w + 40 || y < -20 || y > h + 20;
    // 눈높이·실내 시점에서는 벽 너머 라벨이 겹쳐 보여서 숨김
    const hide = off || eyeMode || (l.kind === 'landmark' && !aerial);
    l.el.classList.toggle('hide', hide);
    if (!hide) l.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

/* ------------------------------------------------------------------ *
 *  지하 시점: 지상 바닥 숨기기
 * ------------------------------------------------------------------ */
let underground = false;
function updateGround() {
  ground.visible = !(underground || xray);
  for (const m of groundMeshes) {
    const hiddenByStage = m.userData.baseRoad && (state.stage !== 'proposal' || state.tog.has('cmp'));
    m.visible = !underground && !hiddenByStage;
  }
  dirty = true;
}
function updateUnderground() {
  const ug = camera.position.y < -0.3;
  if (ug === underground) return;
  underground = ug;
  scene.fog.far = ug ? 600 : 4200;
  scene.fog.near = ug ? 200 : 1400;
  updateGround();
}

/* ------------------------------------------------------------------ *
 *  시작
 * ------------------------------------------------------------------ */
const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05);
  stepTween(dt);
  stepTour();
  if (controls.enabled) controls.update();
  updateUnderground();
  if (!eyeMode && !tween) {
    const near = THREE.MathUtils.clamp((camera.position.y - 140) * 0.25, 1, 60);
    if (Math.abs(near - camera.near) > camera.near * 0.1) { camera.near = near; camera.updateProjectionMatrix(); dirty = true; }
  }
  if (dirty) {
    if (night) composer.render(); else renderer.render(scene, camera);
    updateLabels();
    dirty = false;
  }
});

function bindUI() {
  document.querySelectorAll('#stages button').forEach((b) => b.addEventListener('click', () => { stopTour(); setStage(b.dataset.stage); }));
  $('#btn-fold').addEventListener('click', () => $('#panel').classList.toggle('folded'));
  $('#btn-help').addEventListener('click', () => ($('#help').hidden = false));
  $('#btn-help-close').addEventListener('click', () => ($('#help').hidden = true));
  $('#help').addEventListener('click', (e) => { if (e.target.id === 'help') $('#help').hidden = true; });
  $('#btn-night').addEventListener('click', () => { setNight(!night); writeHash(); });
  $('#btn-tour').addEventListener('click', () => (tour.on ? stopTour() : startTour()));
  $('#btn-share').addEventListener('click', async () => {
    writeHash();
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href });
      else { await navigator.clipboard.writeText(location.href); toast('이 시점의 링크를 복사했어요'); }
    } catch { /* 공유 취소 */ }
  });
  canvas.addEventListener('pointerdown', stopTour);
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') { $('#help').hidden = true; stopTour(); }
    else if (e.key === 'ArrowRight') { stopTour(); goSeq(seqIndex() + 1); }
    else if (e.key === 'ArrowLeft') { stopTour(); goSeq(seqIndex() - 1); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') { stopTour(); setStage(['existing', 'problems', 'proposal'][+e.key - 1]); }
    else if (e.key === 'n' || e.key === 'N') { setNight(!night); writeHash(); }
    else if (e.key === ' ') { e.preventDefault(); tour.on ? stopTour() : startTour(); }
  });
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

async function boot() {
  [CAMS, MARKS, INSTANCES] = await Promise.all([
    fetch(`${BASE}data/cameras.json`).then((r) => r.json()),
    fetch(`${BASE}data/markers.json`).then((r) => r.json()),
    fetch(`${BASE}data/instances.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  bindUI();

  if (!readHash()) {
    flyTo('CAM_Site_Overview', { instant: true });
    setStage('existing', { fly: false });
  }
  refresh();

  const need = ['base', 'keep', ...layersFor(state)];
  const uniq = [...new Set(need)];
  let done = 0;
  const bar = $('.intro-bar i');
  await Promise.all(uniq.map((id) => loadLayer(id).catch(() => null).then(() => { done++; bar.style.width = `${(done / uniq.length) * 100}%`; })));
  await applyLayers();
  dirty = true;
  $('#intro').classList.add('done');

  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  idle(() => ['existing_station', 'existing_roads', 'existing_vehicles', 'proposal', 'props', 'water_garden', 'p1', 'p2', 'p3', 'p4', 'p5', 'proposal_interior']
    .forEach((id) => loadLayer(id).catch(() => {})));
}

boot().catch((e) => {
  console.error(e);
  $('#intro-msg').textContent = '불러오지 못했어요. 새로고침해 주세요.';
});
