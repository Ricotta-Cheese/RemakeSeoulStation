/* ------------------------------------------------------------------ *
 *  참고 · 출처 (도움말 창의 두 번째 탭)
 *  사진 출처는 tools/build_credits.py 가 data/references 폴더별 CREDITS.md 에서 모아 photo_credits.json 으로 만들어요.
 * ------------------------------------------------------------------ */
import PHOTOS from './photo_credits.json';

export const SOURCES = [
  {
    title: '현장답사 자료',
    note: '팀이 직접 촬영한 서울역 현장답사 사진 17장과 영상 1편(장면 12컷)을 사용했어요. 구역사·신역사의 입면과 색감, 광장의 실제 이용 모습, 문제점이 생기는 위치를 정하는 데 참고했어요.',
    items: [],
  },
  {
    title: '지도 · 기본 데이터',
    note: '건물 윤곽과 높이, 도로·철도·서울로 선형은 아래 데이터를 바탕으로 팀이 Blender에서 다시 모델링했어요.',
    items: [
      ['OpenStreetMap — 건물·도로·철도·보행로 (© OpenStreetMap contributors, ODbL)', 'https://www.openstreetmap.org/copyright'],
      ['Esri World Imagery — 평면 윤곽 확인용 위성사진 (화면에는 쓰지 않음)', 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9'],
      ['서울 열린데이터광장 — 도시철도 역사 심도 정보', 'https://data.seoul.go.kr/dataList/OA-13305/F/1/datasetView.do'],
      ['서울로7017 안내지도 (PDF)', 'https://parks.seoul.go.kr/maps/seoullo7017/seoullo_map.pdf'],
      ['MVRDV — Seoullo 7017 Skygarden', 'https://mvrdv.com/projects/208/seoullo-7017-skygarden'],
      ['서울시 — 서울로7017 자문 자료', 'https://news.seoul.go.kr/citybuild/archives/233417'],
      ['서울시 — 서울역 버스환승센터 정류장 안내', 'https://mediahub.seoul.go.kr/archives/163121'],
      ['서울시 — 서울역 환승센터 계획 (2008)', 'https://mediahub.seoul.go.kr/archives/160425'],
      ['시대일보 — GTX-A 서울역 환승 동선', 'https://www.sidae.com/article/2026082714173373916'],
      ['위키트리 — 깊은 지하철역', 'https://www.wikitree.co.kr/articles/647835'],
    ],
  },
  {
    title: '② 문제점 근거',
    items: [
      ['서울시 복지 — 노숙인 밀집지역 시설 24시간 운영', 'https://news.seoul.go.kr/welfare/archives/9697'],
      ['뉴시스 — 폭염 속 서울역 노숙인 (2026-07)', 'https://mobile.newsis.com/view/NISX20260729_0003728559'],
      ['경향신문 — 서울역 노숙인 (2021)', 'https://www.khan.co.kr/article/202112090600031'],
      ['노컷뉴스 — 서울역 노숙인', 'https://www.nocutnews.co.kr/news/5498730'],
      ['더팩트 — 천막·소음에 몸살 앓는 서울역', 'https://news.tf.co.kr/read/life/2181537.htm'],
      ['위키트리 — 서울역광장 음주 문제', 'https://www.wikitree.co.kr/articles/1018271'],
      ['비즈한국 — 서울역 광장 종교 집회', 'https://bizhankook.com/articles/31681.html'],
      ['경향신문 — 서울역광장 금주구역 (2026-10)', 'https://khan.co.kr/article/202610121138001'],
      ['위키트리 — 서울역광장 금주구역 시행', 'https://www.wikitree.co.kr/articles/1173091'],
      ['한국센터 — 지하도까지 금주구역 확대, 노숙인 자립지원', 'https://www.koreancenter.or.kr/news/articleView.html?idxno=1437322'],
      ['서울시 — 서울역 공간대개조 아이디어 공모 (2024)', 'https://mediahub.seoul.go.kr/archives/2011548'],
      ['아주경제 — 서울역 공간대개조 국제공모 (2024)', 'https://www.ajunews.com/view/20240729100342562'],
      ['뉴데일리 — 서울역 일대 마스터플랜 (2024)', 'https://www.newdaily.co.kr/site/data/html/2024/06/17/2024061700192.html'],
      ['경향신문 — 서울역 일대 개조 계획 (2024)', 'https://www.khan.co.kr/article/202406021115011'],
      ['서울시 — 동서 보행축·철도 상부 데크 구상 (2010)', 'https://mediahub.seoul.go.kr/archives/153702'],
      ['서울시 교통 — 환승역 5곳 맞춤형 개선 (2025-12)', 'https://news.seoul.go.kr/traffic/archives/515812'],
      ['헤럴드경제 — 환승역 개선 계획', 'https://www.heraldk.com/article/2025120400023651158'],
      ['서울신문 — 서울역 지하철 환승로 확장 (2012)', 'https://m.go.seoul.co.kr/news/2012/02/17/20120217014009'],
    ],
  },
  {
    title: '③ 제안 — 핵심 선례',
    items: [
      ['위트레흐트 중앙역 (Benthem Crouwel)', 'https://benthemcrouwel.com/projects/utrecht-central-station/'],
      ['위트레흐트 중앙역 이용객 (ArchDaily)', 'https://www.archdaily.com/801731/utrecht-central-station-benthem-crouwel-architects'],
      ['위트레흐트 역세권 설계 (OKRA)', 'https://www.okra.nl/project/utrecht-station-quarter/'],
      ['위트레흐트 운하 복원 (가디언 기사 요약)', 'https://camdencyclists.org.uk/2021/11/utrecht-restores-historic-canal-made-into-motorway-in-1970s-the-guardian/'],
      ['브라이언트 파크 역사 (공식)', 'https://bryantpark.org/blog/history-of-bryant-park-modern-times'],
      ['브라이언트 파크 사례 (PPS)', 'https://www.pps.org/greatesthits2'],
      ['오르세 미술관 (프랑스 관광청)', 'https://www.france.fr/ko/article/musee-orsay/'],
    ],
  },
  {
    title: '③ 제안 — 디자인 참고',
    items: [
      ['서울역 초대형 전광판 "플랫폼111" (스마트투데이) → 출발 전광판', 'https://www.smarttoday.co.kr/ko-kr/articles/89526'],
      ['뉴욕 그랜드 센트럴 메인 콘코스 4면 시계 (위키백과) → 만남의 시계', 'https://en.wikipedia.org/wiki/Main_Concourse'],
      ['창이공항 Kinetic Rain (Dezeen) → 물방울 구름', 'https://www.dezeen.com/?p=228702'],
      ['Legible London 길찾기 모노리스 (위키백과) → 안내판', 'https://en.wikipedia.org/wiki/Legible_London'],
      ['코펜하겐 수퍼킬렌 (Dezeen) → 광장 가구', 'https://www.dezeen.com/?p=258000'],
      ['나폴리 톨레도역 "빛의 분화구" (위키백과) → 빛우물', 'https://en.wikipedia.org/wiki/Toledo_station_(Naples)'],
      ['코펜하겐 메트로 천창 (KHR) → 빛우물', 'https://khr.dk/en/?p=5974'],
      ['뮌헨 베스트프리드호프역 조명 돔 (Ingo Maurer) → 오방색 빛 돔', 'https://ingo-maurer.com/en/projects/westfriedhof'],
      ['런던 엘리자베스선 공통 디자인 (Grimshaw) → 지하 환승 대로', 'https://grimshaw.global/projects/crossrail-id/'],
      ['도쿄역 GRANSTA 에키벤야 마쓰리 (GLTJP) → 도시락 전문점', 'https://www.gltjp.com/en/directory/item/14714/'],
      ['서울시 — 서울역 상업시설·짐 보관 서비스', 'https://mediahub.seoul.go.kr/archives/2019938'],
      ['롯데쇼핑 — 서울역점', 'https://www.lotteshopping.com/store/convenience?cstrCd=0343'],
      ['세계일보 — 역사 상업시설 리뉴얼', 'https://www.segye.com/newsView/20250803506473'],
      ['서울시 — 버스환승센터 미디어파사드', 'https://mediahub.seoul.go.kr/archives/986869'],
    ],
  },
  {
    title: '만든 도구',
    items: [
      ['Blender — 3D 모델링·렌더', 'https://www.blender.org/'],
      ['three.js — 웹 3D 뷰어', 'https://threejs.org/'],
      ['Vite — 웹 빌드', 'https://vite.dev/'],
    ],
  },
];

export const NOTES = [
  '건물 높이, 실내 배치, 지하 깊이 일부는 자료가 없어 사진과 비례로 추정했어요.',
  '문제점 위치는 기사에 나온 장소를 모델 위에 대략 옮긴 것으로, 측량 위치가 아니에요.',
  '제안안의 수치(면적·개수 등)는 모델 기준이며 실제 설계값이 아니에요.',
  '사진은 화면에 직접 쓰지 않고 모델링 참고로만 썼어요.',
];

export { PHOTOS };
