import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BASE = import.meta.env.BASE_URL;
const $ = (s) => document.querySelector(s);

/* ------------------------------------------------------------------ *
 *  콘텐츠 설정 (여기만 고치면 라벨/버튼이 바뀜)
 * ------------------------------------------------------------------ */
const STAGES = {
  existing: {
    title: '현황',
    caption: '<b>현재의 서울역과 주변.</b> 구역사(문화역서울284)와 신역사, 선로가 도시를 가르고 있어요.',
    cams: [
      ['CAM_Site_Overview', '대지 전경'],
      ['CAM_Old_Aerial', '구역사'],
      ['CAM_NewStation_Aerial', '신역사'],
      ['CAM_Ref_MainEntrance', '신역사 정문 앞'],
      ['CAM_Old_Front', '구역사 정면'],
      ['CAM_BusCenter', '버스환승센터'],
      ['CAM_Tracks_Close', '선로'],
      ['CAM_Seoullo_Aerial', '서울로7017'],
      ['CAM_Underground_Xray', '지하 환승', ['ug']],
    ],
    toggles: [['ug', '지하 보기']],
  },
  problems: {
    title: '문제점 5가지',
    caption: '<b>현장답사에서 찾은 다섯 가지 문제.</b> 번호를 눌러 자세히 보세요.',
    cams: [],
    toggles: [['ug', '지하 보기']],
  },
  proposal: {
    title: '제안',
    caption: '<b>끊어진 곳을 잇고, 머물고 싶은 역으로.</b> 레일 파크·물의 정원·새 맞이방을 제안해요.',
    cams: [
      ['CAM_PR_Aerial', '제안 전경'],
      ['CAM_PR_Plaza', '광장'],
      ['CAM_PR_Eye_Forecourt', '광장 눈높이'],
      ['CAM_PR_WaterGarden', '물의 정원'],
      ['CAM_PR_SkyRouteAerial', '스카이루트'],
      ['CAM_PR_SeoulloLink2', '서울로 연결'],
      ['CAM_PR_Eye_RailPark', '레일 파크'],
      ['CAM_PR_BusTerminal', '버스환승센터'],
      ['CAM_PR_Concourse', '맞이방 내부', ['int']],
      ['CAM_PR_Atrium', '아트리움', ['int']],
      ['CAM_PR_B1_Atrium', '선큰 아트리움', ['ug']],
      ['CAM_PR_UG_Diagram', '지하 구조', ['ug']],
    ],
    toggles: [
      ['int', '내부 공간'],
      ['ug', '지하 공간'],
      ['wg1', '물의 정원 A안(한글)'],
      ['wg2', '물의 정원 B안(선형)'],
      ['tags', '3D 해설 태그'],
    ],
  },
};

const PROBLEMS = [
  { n: 1, title: '노숙 · 음주', cam: 'CAM_P1_Homeless', layer: 'p1', badge: 'P1_Badge' },
  { n: 2, title: '종교 전도 · 집회 소음', cam: 'CAM_P2_Rally', layer: 'p2', badge: 'P2_Badge' },
  { n: 3, title: '도로 · 정류장 단절', cam: 'CAM_P3_Road', layer: 'p3', badge: 'P3_Badge' },
  { n: 4, title: '철도 동서 단절', cam: 'CAM_P4_Rail', layer: 'p4', badge: 'P4_Badge' },
  { n: 5, title: '지하 환승 미로', cam: 'CAM_P5_Underground', layer: 'p5', badge: 'P5_Badge', needs: ['ug'] },
];

const PLACES = [
  { n: '★', title: '새 서울역 · 그늘 지붕 홀', cam: 'CAM_PR_Eye_Forecourt', badge: 'PRT0_Badge' },
  { n: 1, title: '공공 라운지 · 돌봄센터', cam: 'CAM_PR_Atrium', badge: 'PRT1_Badge', needs: ['int'] },
  { n: 2, title: '그늘 숲 · 물거울', cam: 'CAM_PR_WaterGarden', badge: 'PRT2_Badge' },
  { n: 3, title: '버스환승센터', cam: 'CAM_PR_BusTerminal', badge: 'PRT3_Badge' },
  { n: 4, title: '레일 파크 (서울로7017)', cam: 'CAM_PR_SkyRouteAerial', badge: 'PRT4_Badge' },
  { n: 5, title: '선큰 아트리움', cam: 'CAM_PR_B1_Atrium', badge: 'PRT5_Badge', needs: ['ug'] },
];

const LANDMARKS = {
  LM_CultureStation284: '문화역서울284',
  LM_SeoulStation_New: '서울역',
  LM_SeoulSquare: '서울스퀘어',
  LM_Severance: '세브란스빌딩',
  LM_SeobuStation: '서부역',
  LM_Seoullo_W: '서울로7017 서',
  LM_Seoullo_E: '서울로7017 동',
  LM_Sungnyemun: '숭례문',
};

/* 단계별로 켜지는 레이어 */
function layersFor(state) {
  const s = new Set(['base', 'keep']);
  const { stage, tog, focus } = state;
  if (stage === 'proposal') {
    s.add('proposal');
    s.add('props');
    if (tog.has('int')) s.add('proposal_interior');
    if (tog.has('ug')) { s.add('proposal_ug'); s.add('ug_interiors'); }
    if (tog.has('wg1')) s.add('wg_opt1');
    if (tog.has('wg2')) s.add('wg_opt2');
    if (tog.has('tags')) s.add('proposal_tags');
  } else {
    s.add('existing_station');
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

const SKY = new THREE.Color(0xdbe3e8);
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 1400, 4200);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
sun.position.set(-300, 500, 250);
scene.add(sun, new THREE.HemisphereLight(0xdfeaf2, 0x6f6a60, 0.9));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(9000, 9000),
  new THREE.MeshBasicMaterial({ color: 0x777a75 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.25;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 7000);
camera.position.set(380, 520, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;

let dirty = true;
controls.addEventListener('change', () => (dirty = true));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
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
const groundMeshes = [];       // 지하 시점에서 숨길 도로/선로
const XRAY_EXEMPT = new Set(['ug_transit', 'ug_interiors', 'proposal_ug']);
let xray = false;              // '지하 보기'가 켜지면 지상 요소를 반투명하게
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
        entry.mats = new Set();
        g.traverse((o) => {
          if (!o.isMesh) return;
          if (/^(G_|T_)/.test(o.name)) groundMeshes.push(o);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => entry.mats.add(m));
        });
        applyXray(id, entry);
        g.updateMatrixWorld(true);
        g.traverse((o) => { o.matrixAutoUpdate = false; });
        scene.add(g);
        entry.group = g;
        pending--; updateLoadbar(); dirty = true;
        resolve(g);
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
 *  카메라 이동
 * ------------------------------------------------------------------ */
let CAMS = {}, MARKS = {};
let tween = null;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function setConstraints(eye) {
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
  const eye = c.pos[1] < 8;           // 높이 8m 미만 = 눈높이/지하 시점
  if (eye) target = pos.clone().add(target.clone().sub(pos).normalize().multiplyScalar(0.5));
  const to = { pos, target, fov: c.fov || 45, eye };
  if (instant) {
    camera.position.copy(pos); controls.target.copy(target); camera.fov = to.fov;
    setConstraints(eye); camera.updateProjectionMatrix(); controls.update(); dirty = true;
    return;
  }
  // 이동 중에는 제약을 풀어 둠
  controls.enabled = false;
  controls.minDistance = 0; controls.maxDistance = Infinity;
  controls.maxPolarAngle = Math.PI; controls.minPolarAngle = 0;
  tween = {
    t: 0, dur: eye ? 1.1 : 1.6,
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
  }
}

/* ------------------------------------------------------------------ *
 *  UI 상태
 * ------------------------------------------------------------------ */
const state = { stage: 'existing', tog: new Set(), focus: null, cam: 'CAM_Site_Overview' };

function renderChips() {
  const st = STAGES[state.stage];
  const box = $('#chips');
  box.innerHTML = '';
  if (state.stage === 'problems') {
    box.append(chip('전체', state.focus == null, () => { state.focus = null; state.tog.delete('ug'); refresh(); flyTo('CAM_P_Map'); }));
    for (const p of PROBLEMS) {
      box.append(chip(`${p.n} ${p.title}`, state.focus === p.n, () => selectProblem(p)));
    }
  } else {
    for (const [id, label, needs] of st.cams) {
      box.append(chip(label, state.cam === id, () => goCam(id, needs)));
    }
  }
  const tg = $('#toggles');
  tg.innerHTML = '';
  for (const [id, label] of st.toggles) {
    tg.append(chip(label, state.tog.has(id), () => {
      state.tog.has(id) ? state.tog.delete(id) : state.tog.add(id);
      refresh();
    }));
  }
}

function chip(label, on, fn) {
  const b = document.createElement('button');
  b.className = 'chip' + (on ? ' on' : '');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function goCam(id, needs = []) {
  state.cam = id;
  for (const n of needs) state.tog.add(n);
  refresh();
  flyTo(id);
}

function selectProblem(p) {
  state.focus = p.n;
  state.cam = p.cam;
  if (p.needs) p.needs.forEach((n) => state.tog.add(n)); else state.tog.delete('ug');
  refresh();
  flyTo(p.cam);
}

function refresh() {
  renderChips();
  $('#caption').innerHTML = captionText();
  applyLayers();
  buildLabels();
}

function captionText() {
  if (state.stage === 'problems' && state.focus != null) {
    const p = PROBLEMS.find((x) => x.n === state.focus);
    return `<b>문제 ${p.n}. ${p.title}</b>`;
  }
  return STAGES[state.stage].caption;
}

function setStage(stage) {
  state.stage = stage;
  state.focus = null;
  state.tog = new Set();
  if (stage === 'proposal') { state.tog.add('wg1'); }
  document.querySelectorAll('#stages button').forEach((b) => b.classList.toggle('on', b.dataset.stage === stage));
  $('#stage-title').textContent = STAGES[stage].title;
  const first = stage === 'problems' ? 'CAM_P_Map' : STAGES[stage].cams[0][0];
  state.cam = first;
  refresh();
  flyTo(first);
}

/* ------------------------------------------------------------------ *
 *  3D 위치에 붙는 HTML 라벨
 * ------------------------------------------------------------------ */
let labels = []; // { el, pos, kind }
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
  const list = state.stage === 'problems' ? PROBLEMS : state.stage === 'proposal' ? PLACES : [];
  for (const it of list) {
    if (!MARKS[it.badge]) continue;
    const el = document.createElement('div');
    el.className = 'lbl badge' + (state.stage === 'proposal' ? ' good' : '');
    el.innerHTML = `<span class="n">${it.n}</span><span>${it.title}</span>`;
    el.addEventListener('click', () => {
      if (state.stage === 'problems') return selectProblem(it);
      state.cam = it.cam; (it.needs || []).forEach((n) => state.tog.add(n)); refresh(); flyTo(it.cam);
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
  const aerial = dist > 90;
  for (const l of labels) {
    _v.copy(l.pos).project(camera);
    const behind = _v.z > 1 || _v.z < -1;
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    const off = behind || x < -40 || x > w + 40 || y < -20 || y > h + 20;
    const hide = off || (l.kind === 'landmark' && !aerial);
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
  for (const m of groundMeshes) m.visible = !underground;
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
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  stepTween(dt);
  if (controls.enabled) controls.update();
  updateUnderground();
  if (dirty) {
    renderer.render(scene, camera);
    updateLabels();
    dirty = false;
  }
});

async function boot() {
  [CAMS, MARKS] = await Promise.all([
    fetch(`${BASE}data/cameras.json`).then((r) => r.json()),
    fetch(`${BASE}data/markers.json`).then((r) => r.json()),
  ]);

  document.querySelectorAll('#stages button').forEach((b) => b.addEventListener('click', () => setStage(b.dataset.stage)));
  $('#btn-fold').addEventListener('click', () => $('#panel').classList.toggle('folded'));
  $('#btn-help').addEventListener('click', () => ($('#help').hidden = false));
  $('#btn-help-close').addEventListener('click', () => ($('#help').hidden = true));

  flyTo('CAM_Site_Overview', { instant: true });
  state.stage = 'existing';
  refresh();

  // 첫 화면에 필요한 레이어가 모두 올라올 때까지 소개 화면 유지
  const need = ['base', 'keep', 'existing_station'];
  let done = 0;
  const bar = $('.intro-bar i');
  await Promise.all(need.map((id) => loadLayer(id).then(() => { done++; bar.style.width = `${(done / need.length) * 100}%`; })));
  await applyLayers();
  dirty = true;
  $('#intro').classList.add('done');

  // 나머지는 백그라운드에서 미리 받아 두기 (제안 단계가 바로 뜨도록)
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  idle(() => ['proposal', 'props', 'wg_opt1', 'p1', 'p2', 'p3', 'p4', 'p5'].forEach((id) => loadLayer(id).catch(() => {})));
}

boot().catch((e) => {
  console.error(e);
  $('#intro-msg').textContent = '불러오지 못했어요. 새로고침해 주세요.';
});
