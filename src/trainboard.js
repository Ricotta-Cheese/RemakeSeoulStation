/* 오큘러스 원형 전광판 — '기차가 지나가는 링'
 *  - 오큘러스(중층 +9m ~ 홀 바닥 +16m 사이 타원 구멍) 둘레의 물커튼 자리에 곡면 LED 패널 20장을 둘러 세워요.
 *    네 방향 통로 틈은 그대로 두고, 틈 사이 호마다 5장씩이에요.
 *  - 20장을 하나의 긴 띠로 이어 써요. 곧 출발할 열차가 열차 모양 빛띠가 되어 패널에서 패널로 달려와
 *    '출발 게이트'에 닿고, 출발하면 점점 빨라지며 게이트를 지나 사라져요.
 *    열차 옆면에 행선지·출발 시각·타는 곳이 적혀 있어요.
 *  - 바깥 면과 안쪽 면은 각각 따로 이어진 띠라서, 어느 쪽에서 봐도 열차가 왼쪽→오른쪽으로 달리고 글자가 바로 읽혀요.
 *  - 움직임 ON이면 열차만 연출용 가상 시계로 달려요: 10배 빠르게 10초 → 5초 감속 → 8초 정차 → 5초 가속을 반복.
 *    큰 시계·출발 시각은 실제 시간이고, 남은 시간 카운트다운은 보여 주지 않아요.
 *    OFF면 한 장면에 멈춰요. */
import * as THREE from 'three';

const CX = -95, CZ = 115;          // 오큘러스 중심
const RX = 37.4, RZ = 51.2;        // 원래 물커튼 타원 반지름
const N = 20;
const Y0 = 9.2, Y1 = 14.2;         // 패널 아래·위 끝 높이(중층 바닥 +9m 위, 중층 천장 14.4m 아래라 중층에서도 다 보여요)
const GAP = (6 * Math.PI) / 180;   // 네 방향 통로 틈(반쪽 각)
const MULLION = (0.7 * Math.PI) / 180;
const CW = 409, CH = 256, COLS = 10;   // 패널 한 장 = 409×256px, 캔버스 = 10칸 × 2줄
const W = CW * N;                      // 띠 전체 길이(가상 px)
const GATE = CW * 12.5;                // 출발 게이트 위치(12번째 칸 가운데, 통로 틈과 겹치지 않음)

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
  canvas.width = CW * COLS;
  canvas.height = CH * (N / COLS);
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const group = new THREE.Group();
  group.name = 'TrainBoardRing';

  /* ---------- 패널 배치 ---------- */
  // 타원 위 각 a의 점과 바깥 법선
  const at = (a, y, off = 0) => {
    const nx = Math.cos(a) / RX, nz = Math.sin(a) / RZ, l = Math.hypot(nx, nz);
    return new THREE.Vector3(CX + Math.cos(a) * RX + (nx / l) * off, y, CZ + Math.sin(a) * RZ + (nz / l) * off);
  };
  // a0→a1 사이 곡면 띠. outward=true면 바깥에서, false면 안쪽에서 보이는 면. uv는 [u0,u1]×[v0,v1]
  function strip(a0, a1, y0, y1, off, outward, uvr) {
    const SEG = 14, pos = [], uv = [], idx = [];
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG, a = a0 + (a1 - a0) * t;
      const b = at(a, y0, off), c = at(a, y1, off);
      pos.push(b.x, b.y, b.z, c.x, c.y, c.z);
      // 각이 커지는 방향은 바깥에서 보면 오른쪽→왼쪽이라, 바깥 면은 u를 뒤집어 글자가 바로 읽히게
      const u = outward ? uvr[1] - (uvr[1] - uvr[0]) * t : uvr[0] + (uvr[1] - uvr[0]) * t;
      uv.push(u, uvr[2], u, uvr[3]);
      if (k < SEG) {
        const i = k * 2;
        if (outward) idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
        else idx.push(i, i + 3, i + 1, i, i + 2, i + 3);
      }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g2.setIndex(idx);
    g2.computeVertexNormals();
    return g2;
  }
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.0), toneMapped: false, side: THREE.DoubleSide });
  const rows = canvas.height / CH;
  for (let q = 0; q < 4; q++) {
    // 틈은 a = 0, 90, 180, 270도. 호 하나 = q*90+GAP ~ (q+1)*90-GAP
    const qa0 = (q * Math.PI) / 2 + GAP, qa1 = ((q + 1) * Math.PI) / 2 - GAP;
    // 호 전체 뒤판(검은 틀)과 위아래 빛줄
    group.add(new THREE.Mesh(strip(qa0 - 0.004, qa1 + 0.004, Y0 - 0.25, Y1 + 0.25, 0, true, [0, 1, 0, 1]), frameMat));
    group.add(new THREE.Mesh(strip(qa0, qa1, Y1 + 0.12, Y1 + 0.2, 0.12, true, [0, 1, 0, 1]), edgeMat));
    group.add(new THREE.Mesh(strip(qa0, qa1, Y0 - 0.2, Y0 - 0.12, 0.12, true, [0, 1, 0, 1]), edgeMat));
    group.add(new THREE.Mesh(strip(qa0, qa1, Y1 + 0.12, Y1 + 0.2, -0.12, false, [0, 1, 0, 1]), edgeMat));
    group.add(new THREE.Mesh(strip(qa0, qa1, Y0 - 0.2, Y0 - 0.12, -0.12, false, [0, 1, 0, 1]), edgeMat));
    for (let j = 0; j < 5; j++) {
      const i = q * 5 + j;
      const span = (qa1 - qa0) / 5;
      const a0 = qa0 + span * j + MULLION / 2, a1 = qa0 + span * (j + 1) - MULLION / 2;
      // 띠의 칸 번호: 바깥 면은 각이 커질수록 왼쪽이라 거꾸로(19-i), 안쪽 면은 그대로(i)
      const uvOf = (slot) => {
        const col = slot % COLS, row = Math.floor(slot / COLS);
        return [col / COLS, (col + 1) / COLS, 1 - (row + 1) / rows, 1 - row / rows];
      };
      group.add(new THREE.Mesh(strip(a0, a1, Y0, Y1, 0.1, true, uvOf(N - 1 - i)), screenMat));
      group.add(new THREE.Mesh(strip(a0, a1, Y0, Y1, -0.1, false, uvOf(i)), screenMat));
    }
  }

  /* ---------- 그리기 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (s2) => `${pad(Math.floor(s2 / 3600) % 24)}:${pad(Math.floor(s2 / 60) % 60)}`;
  const hms = (s2) => `${hm(s2)}:${pad(Math.floor(s2) % 60)}`;
  const KR = '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
  const L = 1080, TH = 112, TY = 78;   // 열차 길이·높이·윗변
  const SPAN = 32 * 60;                 // 32분 앞까지 보여 줌(링이 열차로 거의 채워지게)

  function trainShape(x) {
    // x = 앞코 끝. 뒤는 둥근 끝, 앞은 유선형 코
    const y0 = TY, y1 = TY + TH, nose = 150;
    g.beginPath();
    g.moveTo(x - L + 28, y0);
    g.lineTo(x - nose, y0);
    g.bezierCurveTo(x - nose * 0.35, y0, x, y1 - TH * 0.45, x, y1 - 8);
    g.quadraticCurveTo(x, y1, x - 10, y1);
    g.lineTo(x - L + 28, y1);
    g.quadraticCurveTo(x - L, y1, x - L, y1 - 28);
    g.lineTo(x - L, y0 + 28);
    g.quadraticCurveTo(x - L, y0, x - L + 28, y0);
    g.closePath();
  }

  function drawTrain(tr, x, now, tAnim, speed) {
    const left = tr.dep + tr.delay * 60 - now;
    const c = tr.type.color;
    // 속도에 비례하는 빛 꼬리
    if (speed > 0.02) {
      const tail = Math.min(1600, 300 + speed * 2600);
      const tg = g.createLinearGradient(x - L - tail, 0, x - L + 40, 0);
      tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, c + 'aa');
      g.fillStyle = tg; g.fillRect(x - L - tail, TY + 18, tail + 40, TH - 36);
    }
    // 탑승 중이면 몸체 둘레가 숨 쉬듯 빛남
    if (left > 0 && left < 300) {
      g.save(); g.shadowColor = c; g.shadowBlur = 18 + 16 * Math.abs(Math.sin(tAnim * 3));
      trainShape(x); g.fillStyle = c; g.fill(); g.restore();
    }
    // 몸체
    trainShape(x);
    const body = g.createLinearGradient(0, TY, 0, TY + TH);
    body.addColorStop(0, '#ffffff'); body.addColorStop(0.18, '#eef3fb'); body.addColorStop(1, '#c9d3e4');
    g.fillStyle = body; g.fill();
    // 종류 색 띠(아래쪽)와 창문 줄
    g.save(); trainShape(x); g.clip();
    g.fillStyle = c; g.fillRect(x - L, TY + TH - 30, L, 30);
    g.fillStyle = '#16213a'; g.fillRect(x - L, TY + 12, L, 24);
    for (let wx = x - L + 40; wx < x - 190; wx += 46) { g.fillStyle = 'rgba(255,236,170,0.85)'; g.fillRect(wx, TY + 16, 30, 16); }
    g.restore();
    // 앞코 전조등
    const hl = g.createRadialGradient(x - 18, TY + TH - 42, 0, x - 18, TY + TH - 42, 60);
    hl.addColorStop(0, 'rgba(255,255,230,0.95)'); hl.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = hl; g.fillRect(x - 80, TY + TH - 100, 160, 120);

    // 옆면 글자
    g.textBaseline = 'middle';
    g.fillStyle = c; g.beginPath(); g.roundRect(x - L + 30, TY + 44, 132, 32, 7); g.fill();
    g.font = `800 19px ${KR}`; g.fillStyle = '#fff'; g.textAlign = 'center';
    g.fillText(tr.type.name, x - L + 96, TY + 61);
    g.textAlign = 'left'; g.font = `700 17px ${MONO}`; g.fillStyle = '#4a5878';
    g.fillText(tr.no, x - L + 172, TY + 61);
    g.font = `900 50px ${KR}`; g.fillStyle = '#0d1630';
    g.fillText(tr.dest, x - L + 236, TY + 62);
    const dw = g.measureText(tr.dest).width;
    g.font = `600 16px ${KR}`; g.fillStyle = '#5b6886';
    g.fillText(tr.destEn, x - L + 244 + dw, TY + 68);
    g.textAlign = 'right';
    g.font = `800 40px ${MONO}`; g.fillStyle = '#0d1630';
    g.fillText(hm(tr.dep + tr.delay * 60), x - 300, TY + 60);
    g.font = `800 17px ${KR}`; g.fillStyle = '#fff';
    g.fillText(`${tr.plat}번 타는 곳`, x - 200, TY + TH - 15);

    // 위쪽 말풍선: 남은 시간 · 상태
    let st, sc;
    if (left <= 0) { st = '출발했어요'; sc = '#9fc4ff'; }
    else if (left < 60) { st = '탑승 마감'; sc = '#ff5a5a'; }
    else if (left < 300) { st = '탑승 중'; sc = '#3ddc84'; }
    else if (tr.delay) { st = `${tr.delay}분 지연`; sc = '#ffb02e'; }
    else { st = '정시'; sc = '#7fd1ff'; }
    g.textAlign = 'left'; g.font = `800 20px ${KR}`; g.fillStyle = sc;
    g.globalAlpha = left > 0 && left < 300 ? 0.6 + 0.4 * Math.abs(Math.sin(tAnim * 3)) : 1;
    g.fillText(st, x - L + 6, TY - 18);
    g.globalAlpha = 1;
  }

  // 띠 전체(가상 좌표 0..W)를 한 번 그리기
  function paintBand(now, tAnim, real) {
    // 배경
    const bg = g.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#040a1c'); bg.addColorStop(1, '#0a1533');
    g.fillStyle = bg; g.fillRect(0, 0, W, CH);
    // 선로: 두 줄 레일 + 천천히 흐르는 침목
    const ry = TY + TH + 22;
    g.fillStyle = 'rgba(160,190,255,0.10)';
    const sl = (now * 8) % 36;   // 침목은 가상 시계로 흘러, 열차가 서면 같이 멈춤
    for (let sx = -36 + sl; sx < W; sx += 36) g.fillRect(sx, ry - 9, 10, 18);
    g.fillStyle = 'rgba(160,200,255,0.45)'; g.fillRect(0, ry - 7, W, 2); g.fillRect(0, ry + 5, W, 2);
    // 선로 눈금(숫자 없이: 열차 움직임은 연출용 가상 시계라 실제 분과 맞지 않아서)
    for (const m of [1, 3, 5, 10, 15, 20, 25, 30]) {
      const tx = GATE - posOf(m * 60);
      g.fillStyle = 'rgba(160,200,255,0.5)'; g.fillRect(tx - 1, ry - 16, 2, 32);
    }
    // 위쪽 안내 줄: 띠를 따라 반복
    g.textAlign = 'left'; g.font = `700 17px ${KR}`;
    for (let hx = 30; hx < W; hx += CW * 2) {
      g.fillStyle = 'rgba(159,196,255,0.55)'; g.fillText('서울역 출발  DEPARTURES  →', hx, 22);
    }

    // 열차들: 다음 출발 순서대로, 서로 겹치지 않게 뒤로 밀기
    const first = SCHED.findIndex((s2) => s2.dep + s2.delay * 60 > now - 20);
    let prevX = Infinity;
    for (let k = -1; k < 10; k++) {
      const tr = SCHED[(first + k + SCHED.length) % SCHED.length];
      if (!tr) continue;
      const left = tr.dep + tr.delay * 60 - now;
      let x, speed;
      if (left <= 0) {
        // 출발: 점점 빨라지며 게이트를 지나 8초 만에 사라짐(뒤에서 기다리는 열차 줄과 겹치지 않게)
        const s2 = -left;
        if (s2 > 8) continue;
        x = GATE + 0.5 * 50 * s2 * s2;
        speed = 0.3 + s2 / 8;
        g.globalAlpha = 1 - (s2 / 8) ** 2;
      } else {
        if (left > SPAN) break;
        x = GATE - posOf(left);
        speed = left < 120 ? (120 - left) / 400 : 0;
      }
      if (left > 0) { x = Math.min(x, prevX - L - 140); prevX = x; }
      for (const w of [-W, 0, W]) if (x + w > -200 && x + w - L - 1700 < W) drawTrain(tr, x + w, now, tAnim, speed);
      g.globalAlpha = 1;
    }

    // 출발 게이트: 세로 빛 기둥 + 큰 시계
    const pulse = 0.7 + 0.3 * Math.sin(tAnim * 2);
    const gg = g.createLinearGradient(GATE - 40, 0, GATE + 40, 0);
    gg.addColorStop(0, 'rgba(120,200,255,0)'); gg.addColorStop(0.5, `rgba(170,225,255,${0.55 * pulse})`); gg.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = gg; g.fillRect(GATE - 40, 0, 80, CH);
    g.fillStyle = '#e8f6ff'; g.fillRect(GATE - 2, 34, 4, CH - 44);
    g.textAlign = 'left'; g.font = `800 18px ${KR}`; g.fillStyle = '#9fe3ff';
    g.fillText('출발 게이트', GATE + 16, 22);
    g.font = `800 30px ${MONO}`; g.fillStyle = '#ffffff';
    g.fillText(hms(real), GATE + 16, 54);   // 시계는 실제 시간
  }

  // 남은 시간(초) → 게이트 뒤 거리(px). 가까울수록 조금 더 빨리 다가오게 0.9제곱
  function posOf(left) { return W * 0.82 * Math.pow(Math.min(left, SPAN) / SPAN, 0.9); }

  /* now = 열차 움직임용 가상 시계, real = 실제 시계(큰 시계 표시) */
  function draw(now, tAnim, real = now) {
    g.textBaseline = 'middle';
    for (let row = 0; row < N / COLS; row++) {
      g.save();
      g.beginPath(); g.rect(0, row * CH, CW * COLS, CH); g.clip();
      g.translate(-row * CW * COLS, row * CH);
      paintBand(now, tAnim, real);
      g.restore();
    }
    tex.needsUpdate = true;
  }

  let live = false, last = -1;
  const t0 = performance.now();
  /* 가상 시계(열차 움직임·침목 전용): 실제보다 10배 빠르게 10초 → 5초 감속 → 8초 정차 → 5초 가속을 반복.
     큰 시계와 출발 시각은 실제 시간 그대로라, 열차가 서도 시계는 정상으로 흘러요. */
  const CRUISE = 10, BRAKE = 5, STOP = 8, ACCEL = 5, RATE = 10;
  const CYCLE_T = CRUISE + BRAKE + STOP + ACCEL;
  const ease = (x) => x * x * (3 - 2 * x);
  function rateAt(tc) {
    if (tc < CRUISE) return RATE;
    if (tc < CRUISE + BRAKE) return RATE * (1 - ease((tc - CRUISE) / BRAKE));
    if (tc < CRUISE + BRAKE + STOP) return 0;
    return RATE * ease((tc - CRUISE - BRAKE - STOP) / ACCEL);
  }
  let vclock = null;
  const clockNow = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; };
  // 움직임 OFF일 때 늘 같은 사진: 저녁 6시 30분 장면으로 고정
  const FROZEN = 18 * 3600 + 30 * 60;
  draw(FROZEN, 1.2);

  return {
    group,
    setMotion(on) { live = on; if (!on) draw(FROZEN, 1.2); },
    setNight(k) { screenMat.color.setScalar(1 - 0.08 * k);   // 흰 열차 몸체가 밤 빛 번짐에 글자를 뭉개지 않게 살짝 낮춤
      edgeMat.color.setRGB(0.55 + 0.9 * k, 0.85 + 0.9 * k, 1 + 1.2 * k); },
    /* 움직임 ON일 때 렌더 루프에서 호출: 초당 약 12번만 다시 그려요 */
    update(camera) {
      if (!live) return false;
      let vis = true;
      for (let o = group; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis || !group.parent) return false;
      if (camera.position.distanceToSquared(new THREE.Vector3(CX, 20, CZ)) > 700 * 700) return false;
      const t = (performance.now() - t0) / 1000;
      if (t - last < 1 / 12) return false;
      const dt = last < 0 ? 0 : Math.min(0.25, t - last);   // 화면 밖에 있다 돌아와도 시계가 튀지 않게
      last = t;
      if (vclock === null) vclock = clockNow();
      vclock += rateAt(t % CYCLE_T) * dt;
      draw(vclock % 86400, t, clockNow());
      return true;
    },
  };
}
