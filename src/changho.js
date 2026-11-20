/* 그늘 지붕 창호 무늬
 * 새 서울역 지붕은 한 변 6m 정사각형을 45° 돌린 마름모 칸(나무 리브 사이)으로 이뤄져 있어요.
 * 칸 하나하나를 한국 창호 한 짝으로 보고, 칸 안에 나무 살 무늬를 넣어요.
 *  - 한지색 판 칸: 살 + 한지. 밤에는 한지 뒤에서 불을 켠 것처럼 따뜻하게 비쳐요.
 *  - 유리 칸: 살만 들어가고 나머지는 그대로 유리.
 *  - 무늬: 정자살 · 띠살 · 아자살 · 빗살을 칸마다 섞어요(위치로 정해지는 값이라 늘 같은 배치).
 * 모델에는 UV가 없어서, 셰이더에서 월드 좌표로 마름모 칸 좌표를 계산해 무늬 그림(2×2 칸)을 입혀요. */
import * as THREE from 'three';

// 마름모 격자: x+z, x−z 방향으로 8.48m(= 6m × √2) 간격
const CELL = 8.485, OFF_U = 3.03, OFF_V = -125.15;
const WOOD = new THREE.Color(0.36, 0.2, 0.09);   // 리브보다 한 톤 진한 살
const HANJI_GLOW = new THREE.Color(1.0, 0.78, 0.5);

function latticeAtlas() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  const W = 15;                                  // 살 두께(px) ≈ 25cm, 멀리서도 읽히게
  const line = (x0, y0, x1, y1) => {             // 가로·세로 살
    if (x0 === x1) g.fillRect(x0 - W / 2, Math.min(y0, y1), W, Math.abs(y1 - y0));
    else g.fillRect(Math.min(x0, x1), y0 - W / 2, Math.abs(x1 - x0), W);
  };
  const frame = () => { g.fillRect(0, 0, S, 16); g.fillRect(0, S - 16, S, 16); g.fillRect(0, 0, 16, S); g.fillRect(S - 16, 0, 16, S); };

  // 0: 정자살 — 바둑판
  g.save(); g.translate(0, 0); frame();
  for (let k = 1; k < 6; k++) { const t = (S / 6) * k; line(t, 0, t, S); line(0, t, S, t); }
  g.restore();

  // 1: 띠살 — 촘촘한 세로살 + 위·가운데·아래 가로살 띠
  g.save(); g.translate(S, 0); frame();
  for (let x = 32; x < S; x += 32) line(x, 0, x, S);
  for (const y0 of [70, 240, 410]) for (let k = 0; k < 3; k++) line(0, y0 + k * 18, S, y0 + k * 18);
  g.restore();

  // 2: 아자살 — 가운데 큰 네모와 그를 둘러싼 亞자 줄
  g.save(); g.translate(0, S); frame();
  const a = 150, b = S - 150;
  line(a, 0, a, S); line(b, 0, b, S); line(0, a, S, a); line(0, b, S, b);
  line(S / 2, 0, S / 2, a); line(S / 2, b, S / 2, S); line(0, S / 2, a, S / 2); line(b, S / 2, S, S / 2);
  const m = 215, n = S - 215;                     // 가운데 네모 안의 작은 네모
  line(m, m, n, m); line(m, n, n, n); line(m, m, m, n); line(n, m, n, n);
  g.restore();

  // 3: 빗살 — 대각선 살(마름모 칸 안에서는 지붕 축에 나란하게 보여요)
  g.save(); g.translate(S, S); frame();
  g.beginPath(); g.rect(0, 0, S, S); g.clip();
  g.lineWidth = W; g.strokeStyle = '#fff';
  for (let d = -S; d <= S * 2; d += 72) {
    g.beginPath(); g.moveTo(d, 0); g.lineTo(d - S, S); g.stroke();
    g.beginPath(); g.moveTo(d - S, 0); g.lineTo(d, S); g.stroke();
  }
  g.restore();

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

export function createChangho() {
  const atlas = latticeAtlas();
  const uNight = { value: 0 };
  const patched = [];

  function patch(mat, { panel }) {
    const m = mat.clone();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uChangho = { value: atlas };
      sh.uniforms.uWood = { value: WOOD };
      sh.uniforms.uGlow = { value: HANJI_GLOW };
      sh.uniforms.uNight = uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vChWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vChWPos;
uniform sampler2D uChangho;
uniform vec3 uWood;
uniform vec3 uGlow;
uniform float uNight;
float chMask() {
  vec2 gq = vec2((vChWPos.x + vChWPos.z - ${OFF_U.toFixed(3)}) / ${CELL.toFixed(3)}, (vChWPos.x - vChWPos.z - (${OFF_V.toFixed(3)})) / ${CELL.toFixed(3)});
  vec2 cid = floor(gq);
  vec2 f = clamp(fract(gq), 0.004, 0.996);
  // 칸 가운데의 월드 좌표 → 지붕 타원(중심 -95,115 · 반지름 84×114) 안에서의 상대 거리
  float su = (cid.x + 0.5) * ${CELL.toFixed(3)} + ${OFF_U.toFixed(3)};
  float sv = (cid.y + 0.5) * ${CELL.toFixed(3)} + (${OFF_V.toFixed(3)});
  vec2 cxz = vec2((su + sv) * 0.5, (su - sv) * 0.5);
  float d = length(vec2((cxz.x + 95.0) / 84.0, (cxz.y - 115.0) / 114.0));
  // 가운데부터 동심원 띠: 빗살 → 아자살 → 정자살 → 띠살 → 가장자리 아자살
  float idx = d < 0.2 ? 3.0 : d < 0.42 ? 2.0 : d < 0.64 ? 0.0 : d < 0.86 ? 1.0 : 2.0;
  vec2 tile = vec2(mod(idx, 2.0), floor(idx / 2.0));
  vec2 uvA = (tile + f) * 0.5;
  // 칸 경계에서 밉맵이 튀지 않게, 칸 안 좌표의 미분으로 샘플
  return texture2DGradEXT(uChangho, uvA, dFdx(gq) * 0.5, dFdy(gq) * 0.5).a;
}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float chM = chMask();
diffuseColor.rgb = mix(diffuseColor.rgb, uWood, chM);
diffuseColor.a = mix(diffuseColor.a, 1.0, chM);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${panel ? 'totalEmissiveRadiance += uGlow * (1.0 - chM) * uNight * 0.55;' : ''}`);
      // WebGL2에서는 texture2DGradEXT 대신 textureGrad
      sh.fragmentShader = sh.fragmentShader.replace('texture2DGradEXT', 'textureGrad');
    };
    m.customProgramCacheKey = () => 'changho-' + (panel ? 'p' : 'g');
    m.needsUpdate = true;
    patched.push(m);
    return m;
  }

  return {
    attach(proposalGroup) {
      const glass = proposalGroup.getObjectByName('PR_Canopy_Glass');
      if (!glass) return;
      const meshes = glass.isMesh ? [glass] : glass.children.filter((o) => o.isMesh);
      for (const o of meshes) {
        if (/Canopy_Panel/.test(o.material.name)) o.material = patch(o.material, { panel: true });
        else if (/Glass_Tint/.test(o.material.name)) o.material = patch(o.material, { panel: false });
      }
    },
    setNight(k) { uNight.value = k; },
    materials: patched,
  };
}
