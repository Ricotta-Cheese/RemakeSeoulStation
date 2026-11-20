/* 오큘러스 위 원형 전광판 링
 *  - 오큘러스(타원 구멍) 위에 16장의 LED 패널을 타원으로 매달아요. 안팎 양면 모두 글자가 바로 보여요.
 *  - 패널마다 더미 열차 출발 정보를 보여 주고, 움직임 ON이면 시계·남은 시간·상태가 실시간으로 바뀌며
 *    몇 초마다 다음 열차로 '넘김' 애니메이션을 해요. OFF면 한 장면을 그대로 멈춰 둬요.
 *  - 한 장의 캔버스(4×4 칸)를 16장 패널이 나눠 쓰므로 텍스처 업로드는 한 번이면 돼요. */
import * as THREE from 'three';

const CX = -95, CZ = 115;          // 오큘러스 중심
const RX = 30, RZ = 42;            // 링 반지름(나무 기둥 안쪽, 물방울 샹들리에 바깥)
const N = 16;
const PW = 7.2, PH = 3.6;          // 패널 크기(m)
const Y0 = 17.6;                   // 패널 아래 끝 높이(홀 바닥 +16m 위 1.6m, 오큘러스 난간 위)
const CELL_W = 512, CELL_H = 256, COLS = 4;

const TYPES = [
  { name: 'KTX', color: '#2f6bff' },
  { name: 'KTX-산천', color: '#12c2e9' },
  { name: 'KTX-이음', color: '#a35cff' },
  { name: 'ITX-새마을', color: '#ff4a3d' },
  { name: 'ITX-마음', color: '#3ddc84' },
  { name: '무궁화호', color: '#ff9d1c' },
];
const DEST = ['부산', '목포', '강릉', '여수엑스포', '광주송정', '포항', '진주', '익산', '마산', '동해', '안동', '대전', '전주', '순천', '울산', '경주'];
const DEST_EN = ['Busan', 'Mokpo', 'Gangneung', 'Yeosu-EXPO', 'Gwangju-Songjeong', 'Pohang', 'Jinju', 'Iksan', 'Masan', 'Donghae', 'Andong', 'Daejeon', 'Jeonju', 'Suncheon', 'Ulsan', 'Gyeongju'];

/* 고정 씨앗으로 만든 더미 시간표: 하루 0시부터 약 4분 간격 */
function makeSchedule() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const list = [];
  for (let k = 0; k < 360; k++) {
    const t = TYPES[Math.floor(rnd() * TYPES.length)];
    const d = Math.floor(rnd() * DEST.length);
    list.push({
      type: t, dest: DEST[d], destEn: DEST_EN[d],
      no: String(100 + Math.floor(rnd() * 900)),
      dep: k * 240 + Math.floor(rnd() * 90),          // 자정부터 초
      plat: 1 + Math.floor(rnd() * 14),
      delay: rnd() < 0.18 ? 5 * (1 + Math.floor(rnd() * 3)) : 0,
    });
  }
  return list;
}

export function createTrainBoard() {
  const SCHED = makeSchedule();
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * Math.ceil(N / COLS);
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const group = new THREE.Group();
  group.name = 'TrainBoardRing';

  /* ---------- 패널 배치 ---------- */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.7, roughness: 0.35 });
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.0), toneMapped: false });
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = CX + Math.cos(a) * RX, z = CZ + Math.sin(a) * RZ;
    // 타원 접선 방향으로 돌려 세우기(바깥 법선이 패널 앞쪽)
    const nx = Math.cos(a) / RX, nz = Math.sin(a) / RZ;
    const yaw = Math.atan2(nx, nz);
    const panel = new THREE.Group();
    panel.position.set(x, Y0 + PH / 2, z);
    panel.rotation.y = yaw;

    // 칸 하나만 보이도록 UV를 잘라 쓰는 화면(앞·뒤 각각 한 장)
    const col = i % COLS, row = Math.floor(i / COLS);
    const rows = canvas.height / CELL_H;
    const u0 = col / COLS, u1 = (col + 1) / COLS, v1 = 1 - row / rows, v0 = 1 - (row + 1) / rows;
    const geo = new THREE.PlaneGeometry(PW, PH);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    const front = new THREE.Mesh(geo, screenMat);
    front.position.z = 0.09;
    const back = new THREE.Mesh(geo, screenMat);
    back.rotation.y = Math.PI;
    back.position.z = -0.09;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.3, PH + 0.3, 0.16), frameMat);
    // 위아래 얇은 빛줄
    const edgeGeo = new THREE.BoxGeometry(PW + 0.3, 0.05, 0.2);
    const top = new THREE.Mesh(edgeGeo, edgeMat); top.position.y = PH / 2 + 0.17;
    const bot = new THREE.Mesh(edgeGeo, edgeMat); bot.position.y = -PH / 2 - 0.17;
    panel.add(frame, front, back, top, bot);
    // 지붕에 매다는 가는 줄 두 개
    for (const sx of [-PW / 2 + 0.6, PW / 2 - 0.6]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 7, 4), cableMat);
      c.position.set(sx, PH / 2 + 3.5, 0);
      panel.add(c);
    }
    group.add(panel);
  }

  /* ---------- 그리기 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (s) => `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}`;
  function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

  function drawCell(i, now, tAnim) {
    const ox = (i % COLS) * CELL_W, oy = Math.floor(i / COLS) * CELL_H;
    g.save();
    g.translate(ox, oy);
    g.beginPath(); g.rect(0, 0, CELL_W, CELL_H); g.clip();

    // 다음 출발 열차 중 패널마다 다른 것을 골라, 8초마다 다음 칸으로 넘김
    const first = SCHED.findIndex((s) => s.dep + s.delay * 60 > now - 30);
    const CYCLE = 8;
    const step = Math.floor(tAnim / CYCLE);
    const k = (first < 0 ? 0 : first) + ((i * 3 + step) % 14);
    const tr = SCHED[k % SCHED.length];
    const phase = (tAnim % CYCLE) / CYCLE;

    // 배경: 짙은 남색 + 천천히 흐르는 빛 띠
    const bg = g.createLinearGradient(0, 0, CELL_W, CELL_H);
    bg.addColorStop(0, '#050b1f'); bg.addColorStop(1, '#0b1638');
    g.fillStyle = bg; g.fillRect(0, 0, CELL_W, CELL_H);
    const sweep = ((tAnim * 0.25 + i * 0.13) % 1.6) - 0.3;
    const sg = g.createLinearGradient((sweep - 0.15) * CELL_W, 0, (sweep + 0.15) * CELL_W, CELL_H);
    sg.addColorStop(0, 'rgba(80,160,255,0)'); sg.addColorStop(0.5, 'rgba(80,160,255,0.10)'); sg.addColorStop(1, 'rgba(80,160,255,0)');
    g.fillStyle = sg; g.fillRect(0, 0, CELL_W, CELL_H);

    // 머리줄: 출발 / 시계
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, CELL_W, 40);
    g.font = '700 20px "Noto Sans KR", sans-serif'; g.fillStyle = '#9fc4ff'; g.textBaseline = 'middle';
    g.fillText('출발  DEPARTURES', 18, 21);
    g.font = '700 22px ui-monospace, "SF Mono", Menlo, monospace'; g.fillStyle = '#ffffff'; g.textAlign = 'right';
    const blink = Math.floor(tAnim * 2) % 2 ? ':' : ' ';
    g.fillText(`${pad(Math.floor(now / 3600) % 24)}${blink}${pad(Math.floor(now / 60) % 60)}:${pad(Math.floor(now) % 60)}`, CELL_W - 18, 21);
    g.textAlign = 'left';

    // 넘김 애니메이션: 칸이 바뀔 때 0.35초 동안 위아래로 접혔다 펴짐
    const flip = Math.min(phase * CYCLE / 0.35, 1);
    const sy = flip < 1 ? Math.abs(Math.cos(flip * Math.PI)) : 1;
    g.save();
    g.translate(0, 132); g.scale(1, Math.max(sy, 0.04)); g.translate(0, -132);

    // 열차 종류 꼬리표
    g.fillStyle = tr.type.color; rr(18, 56, 142, 40, 8); g.fill();
    g.font = '800 22px "Noto Sans KR", sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center';
    g.fillText(tr.type.name, 89, 77);
    g.textAlign = 'left';
    g.font = '600 20px ui-monospace, Menlo, monospace'; g.fillStyle = '#7f93bf';
    g.fillText(tr.no + '열차', 172, 77);

    // 행선지
    g.font = '800 46px "Noto Sans KR", sans-serif'; g.fillStyle = '#ffffff';
    g.fillText(tr.dest, 18, 132);
    g.font = '500 18px "Noto Sans KR", sans-serif'; g.fillStyle = '#7f93bf';
    g.fillText(tr.destEn, 20, 166);

    // 출발 시각 · 타는 곳
    g.textAlign = 'right';
    g.font = '800 44px ui-monospace, "SF Mono", Menlo, monospace'; g.fillStyle = '#ffd34d';
    g.fillText(hm(tr.dep), CELL_W - 108, 116);
    g.beginPath(); g.arc(CELL_W - 52, 108, 32, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.font = '800 30px "Noto Sans KR", sans-serif'; g.fillStyle = '#0b1638'; g.textAlign = 'center';
    g.fillText(String(tr.plat), CELL_W - 52, 110);
    g.font = '600 14px "Noto Sans KR", sans-serif'; g.fillStyle = '#9fc4ff';
    g.fillText('타는 곳', CELL_W - 52, 156);

    // 상태
    const left = tr.dep + tr.delay * 60 - now;
    let st, sc;
    if (left < 60) { st = '탑승 마감'; sc = '#ff5a5a'; }
    else if (left < 300) { st = '탑승 중'; sc = '#3ddc84'; }
    else if (tr.delay) { st = `${tr.delay}분 지연`; sc = '#ffb02e'; }
    else { st = '정시'; sc = '#7fd1ff'; }
    const pulse = left < 300 ? 0.55 + 0.45 * Math.abs(Math.sin(tAnim * 3)) : 1;
    g.globalAlpha = pulse;
    g.textAlign = 'right'; g.font = '800 24px "Noto Sans KR", sans-serif'; g.fillStyle = sc;
    g.fillText(st, CELL_W - 108, 160);
    g.globalAlpha = 1;
    g.restore();

    // 남은 시간 막대
    const span = 20 * 60, f = THREE.MathUtils.clamp(1 - left / span, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.08)'; rr(18, 192, CELL_W - 36, 8, 4); g.fill();
    const bar = g.createLinearGradient(18, 0, CELL_W - 18, 0);
    bar.addColorStop(0, tr.type.color); bar.addColorStop(1, '#ffffff');
    g.fillStyle = bar; rr(18, 192, Math.max(8, (CELL_W - 36) * f), 8, 4); g.fill();

    // 아래 흐르는 안내 문구
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 214, CELL_W, 42);
    g.font = '500 17px "Noto Sans KR", sans-serif'; g.fillStyle = '#b9c8e6'; g.textAlign = 'left';
    const msg = `출발까지 ${Math.max(0, Math.floor(left / 60))}분 ${pad(Math.max(0, Math.floor(left) % 60))}초   ·   ${tr.type.name} ${tr.no} ${tr.dest}행은 ${tr.plat}번 타는 곳에서 출발해요   ·   서울의 거실, 서울역에 오신 것을 환영해요   ·   `;
    const w = g.measureText(msg).width;
    const off = (tAnim * 60 + i * 97) % w;
    g.fillText(msg + msg, 18 - off, 236);
    g.restore();
  }

  function draw(now, tAnim) {
    for (let i = 0; i < N; i++) drawCell(i, now, tAnim);
    tex.needsUpdate = true;
  }

  let live = false, last = -1;
  const t0 = performance.now();
  const clockNow = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; };
  // 움직임 OFF일 때 늘 같은 사진: 저녁 6시 30분 장면으로 고정
  const FROZEN = 18 * 3600 + 30 * 60;
  draw(FROZEN, 1.2);

  return {
    group,
    setMotion(on) { live = on; if (!on) draw(FROZEN, 1.2); },
    setNight(k) { screenMat.color.setScalar(1 + 0.25 * k); edgeMat.color.setRGB(0.55 + 0.9 * k, 0.85 + 0.9 * k, 1 + 1.2 * k); },
    /* 움직임 ON일 때 렌더 루프에서 호출: 초당 약 12번만 다시 그려요 */
    update(camera) {
      if (!live) return false;
      let vis = true;
      for (let o = group; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis || !group.parent) return false;
      if (camera.position.distanceToSquared(new THREE.Vector3(CX, 20, CZ)) > 700 * 700) return false;
      const t = (performance.now() - t0) / 1000;
      if (t - last < 1 / 12) return false;
      last = t;
      draw(clockNow(), t);
      return true;
    },
  };
}
