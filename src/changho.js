/* 그늘 지붕 4안 + 버스환승센터·연결 회랑·서울로 보행로 지붕(콘크리트 띠살)
 * Blender에서 만들어 canopy_changho.glb로 내보낸 모델이에요
 *  - 그늘 지붕: web/tools/pr_canopy_concrete.py (비틀린 리본 병풍 지붕, 공포 받침 기둥)
 *  - 볼트 지붕 셋: web/tools/pr_vault_changho.py (콘크리트 아치 + 띠살 핀·가로띠 + 한지 막)
 *  - 환승 마당: web/tools/pr_transfer_hall.py (버스환승센터 계단 ~ 지하 아트리움을 잇는 단정한 볼트, 아래 예약제 무대)
 *  - 서쪽 보행 마당: web/tools/pr_west_edge.py (서쪽 유리벽~차도 사이 포장, 가로수, 가로등)
 * 이 파일은 원래 지붕·기둥을 숨기고, 재질을 웹에 맞게 다듬고, 밤에 한지 막이 빛나게 해요. */
import * as THREE from 'three';

const HANJI_GLOW = new THREE.Color(1.0, 0.86, 0.66);
// 제안안 모델에서 새 지붕으로 바뀐 원래 부재
const OLD = [
  'PR_Canopy_Ribs', 'PR_Canopy_Glass', 'PR_Canopy_TreeColumns', 'PR_Canopy_EdgeBeam',
  'PR_Canopy_FacadeGlass', 'PR_Canopy_Mullions',
  'PR_BT_RoofPanels', 'PR_BT_RoofRibs', 'PR_CX_RoofPanels', 'PR_CX_RoofRibs', 'PR_SK_Roof', 'PR_SK_Ribs',
  'PR_EV_Roof', 'PR_EV_Columns', 'PR_EV_SignBand',   // 행사 마당 평지붕 → 환승 마당 볼트
];
// Blender의 노드 결(얼룩·거푸집 무늬)은 glTF로 넘어오지 않아서 대표 톤을 지정
const TONE = {
  MPR_CF_Concrete: { color: 0xa19e98, rough: 0.85 },
  MPR_CF_Fin: { color: 0xb8b5af, rough: 0.85 },
};

// 서쪽 가로수 잎·껍질 대표색(웹에 같은 이름 재질이 아직 없을 때)
const LEAF = {
  MPR_Leaf_0: [0.3, 0.5, 0.18], MPR_Leaf_1: [0.46, 0.56, 0.2], MPR_Leaf_2: [0.72, 0.58, 0.22],
  MPR_Leaf_3: [0.22, 0.42, 0.16], MPR_Bark: [0.32, 0.22, 0.15],
};

export function createChangho() {
  const hanji = new Set(), lamps = new Set();
  let level = 0;
  const apply = () => {
    for (const m of hanji) { m.emissive.copy(HANJI_GLOW); m.emissiveIntensity = 0.75 * level; }
    for (const m of lamps) { m.emissive.setRGB(1.0, 0.82, 0.58); m.emissiveIntensity = 0.4 + 3.6 * level; }   // 서쪽 가로등 빛 고리
  };
  return {
    hideOld(proposalGroup) {
      for (const n of OLD) {
        const o = proposalGroup.getObjectByName(n);
        if (o) o.visible = false;
      }
    },
    attach(group, scene) {
      // 나무 잎·껍질처럼 색이 노드로 만들어진 재질은 내보낼 때 흰색이 돼서, 웹에 이미 있는 같은 이름 재질의 색을 빌려 씀
      const known = new Map();
      scene?.traverse((o) => {
        if (!o.isMesh || o === group) return;
        let inGroup = false; for (let p = o; p; p = p.parent) if (p === group) { inGroup = true; break; }
        if (inGroup) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (/^MPR_(Leaf|Bark)/.test(m.name) && !known.has(m.name)) known.set(m.name, m.color.clone());
      });
      group.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (known.has(m.name)) m.color.copy(known.get(m.name));
          else if (LEAF[m.name]) m.color.setRGB(...LEAF[m.name]);   // 아직 못 찾았으면 대표색
          const t = TONE[m.name];
          if (t) { m.color.setHex(t.color); m.roughness = t.rough; m.metalness = 0; }
          if (/CH_Hanji|CH_Membrane/.test(m.name)) {
            m.transmission = 0;          // 빛 투과(무거운 렌더 패스) 대신 밤 빛만
            m.side = THREE.DoubleSide;
            hanji.add(m);
          }
          if (/WebLampRing/.test(m.name)) lamps.add(m);
          if (/CC_Glass/.test(m.name)) { m.transparent = true; m.opacity = Math.min(m.opacity, 0.35); m.depthWrite = false; m.side = THREE.DoubleSide; }
          m.needsUpdate = true;
        }
      });
      apply();
    },
    setNight(k) { level = k; apply(); },
  };
}
