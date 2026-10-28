import { haversineKm } from "./gpx.ts";

/**
 * 해안 기준점: 위치(위도·경도)를 기상청 특보 구역 이름과 국립해양조사원 조위관측소로 이어 준다.
 * 인터넷 없이 가장 가까운 기준점을 고르는 방식이라 대략적인 매칭이다.
 */
export type CoastPoint = {
  name: string;
  lat: number;
  lng: number;
  /** 특보 문구에서 광역 지역을 찾을 때 쓰는 이름들 (예: "강원도", "강원") */
  province: string[];
  /** 특보 문구의 괄호 안 시·군 이름 (예: "강릉") */
  cities: string[];
  /** 해상 특보 구역 (예: "강원중부앞바다") */
  seas: string[];
};

const GANGWON = ["강원도", "강원"];
const GYEONGBUK = ["경상북도", "경북"];
const GYEONGNAM = ["경상남도", "경남"];
const JEONNAM = ["전라남도", "전남"];
const JEONBUK = ["전라북도", "전북"];
const CHUNGNAM = ["충청남도", "충남"];
const JEJU = ["제주도", "제주"];

export const COAST_POINTS: CoastPoint[] = [
  { name: "인천", lat: 37.45, lng: 126.6, province: ["인천"], cities: ["인천"], seas: ["인천·경기북부앞바다", "인천·경기남부앞바다", "서해중부앞바다"] },
  { name: "을왕리", lat: 37.447, lng: 126.372, province: ["인천"], cities: ["인천"], seas: ["인천·경기북부앞바다", "서해중부앞바다"] },
  { name: "안산·대부도", lat: 37.24, lng: 126.58, province: ["경기도", "경기"], cities: ["안산", "화성"], seas: ["인천·경기남부앞바다", "서해중부앞바다"] },
  { name: "평택", lat: 36.97, lng: 126.82, province: ["경기도", "경기"], cities: ["평택"], seas: ["인천·경기남부앞바다", "서해중부앞바다"] },
  { name: "서산·대산", lat: 37.0, lng: 126.35, province: CHUNGNAM, cities: ["서산", "당진"], seas: ["충남북부앞바다", "서해중부앞바다"] },
  { name: "태안", lat: 36.79, lng: 126.14, province: CHUNGNAM, cities: ["태안"], seas: ["충남북부앞바다", "서해중부앞바다"] },
  { name: "보령", lat: 36.31, lng: 126.51, province: CHUNGNAM, cities: ["보령"], seas: ["충남남부앞바다", "서해중부앞바다"] },
  { name: "서천", lat: 36.0, lng: 126.69, province: CHUNGNAM, cities: ["서천"], seas: ["충남남부앞바다", "서해중부앞바다"] },
  { name: "군산", lat: 35.98, lng: 126.56, province: JEONBUK, cities: ["군산"], seas: ["전북북부앞바다", "서해남부앞바다"] },
  { name: "부안", lat: 35.68, lng: 126.53, province: JEONBUK, cities: ["부안", "고창"], seas: ["전북남부앞바다", "서해남부앞바다"] },
  { name: "영광", lat: 35.43, lng: 126.42, province: JEONNAM, cities: ["영광"], seas: ["전남북부서해앞바다", "서해남부앞바다"] },
  { name: "목포", lat: 34.78, lng: 126.38, province: JEONNAM, cities: ["목포", "신안", "무안"], seas: ["전남중부서해앞바다", "서해남부앞바다"] },
  { name: "흑산도", lat: 34.68, lng: 125.43, province: JEONNAM, cities: ["흑산도", "신안"], seas: ["흑산도·홍도", "서해남부먼바다"] },
  { name: "진도", lat: 34.38, lng: 126.31, province: JEONNAM, cities: ["진도", "해남"], seas: ["전남남부서해앞바다", "남해서부앞바다"] },
  { name: "완도", lat: 34.31, lng: 126.76, province: JEONNAM, cities: ["완도", "강진"], seas: ["전남중부남해앞바다", "남해서부앞바다"] },
  { name: "고흥", lat: 34.48, lng: 127.34, province: JEONNAM, cities: ["고흥", "보성"], seas: ["전남동부남해앞바다", "남해서부앞바다"] },
  { name: "여수", lat: 34.75, lng: 127.77, province: JEONNAM, cities: ["여수"], seas: ["전남동부남해앞바다", "남해서부앞바다"] },
  { name: "남해·사천", lat: 34.85, lng: 127.98, province: GYEONGNAM, cities: ["남해", "사천", "하동"], seas: ["경남서부남해앞바다", "남해동부앞바다"] },
  { name: "통영", lat: 34.83, lng: 128.43, province: GYEONGNAM, cities: ["통영", "고성"], seas: ["경남중부남해앞바다", "남해동부앞바다"] },
  { name: "거제", lat: 34.8, lng: 128.7, province: GYEONGNAM, cities: ["거제"], seas: ["거제시동부앞바다", "남해동부앞바다"] },
  { name: "부산", lat: 35.1, lng: 129.04, province: ["부산"], cities: ["부산"], seas: ["부산앞바다", "남해동부앞바다"] },
  { name: "해운대", lat: 35.16, lng: 129.16, province: ["부산"], cities: ["부산"], seas: ["부산앞바다", "남해동부앞바다"] },
  { name: "울산", lat: 35.5, lng: 129.38, province: ["울산"], cities: ["울산"], seas: ["울산앞바다", "동해남부앞바다"] },
  { name: "경주", lat: 35.75, lng: 129.48, province: GYEONGBUK, cities: ["경주"], seas: ["경북남부앞바다", "동해남부앞바다"] },
  { name: "포항", lat: 36.05, lng: 129.38, province: GYEONGBUK, cities: ["포항"], seas: ["경북남부앞바다", "동해남부앞바다"] },
  { name: "영덕", lat: 36.41, lng: 129.37, province: GYEONGBUK, cities: ["영덕"], seas: ["경북북부앞바다", "동해남부앞바다"] },
  { name: "울진", lat: 36.68, lng: 129.45, province: GYEONGBUK, cities: ["울진"], seas: ["경북북부앞바다", "동해남부앞바다"] },
  { name: "울릉도", lat: 37.49, lng: 130.91, province: GYEONGBUK, cities: ["울릉"], seas: ["울릉도·독도", "동해중부먼바다"] },
  { name: "삼척", lat: 37.44, lng: 129.17, province: GANGWON, cities: ["삼척"], seas: ["강원남부앞바다", "동해중부앞바다"] },
  { name: "동해", lat: 37.55, lng: 129.12, province: GANGWON, cities: ["동해"], seas: ["강원남부앞바다", "동해중부앞바다"] },
  { name: "강릉", lat: 37.8, lng: 128.91, province: GANGWON, cities: ["강릉"], seas: ["강원중부앞바다", "동해중부앞바다"] },
  { name: "양양", lat: 38.07, lng: 128.63, province: GANGWON, cities: ["양양"], seas: ["강원중부앞바다", "동해중부앞바다"] },
  { name: "속초", lat: 38.2, lng: 128.59, province: GANGWON, cities: ["속초"], seas: ["강원북부앞바다", "동해중부앞바다"] },
  { name: "고성(강원)", lat: 38.38, lng: 128.47, province: GANGWON, cities: ["고성"], seas: ["강원북부앞바다", "동해중부앞바다"] },
  { name: "제주시", lat: 33.52, lng: 126.53, province: JEJU, cities: ["제주도북부", "제주시"], seas: ["제주도북부앞바다", "제주도앞바다"] },
  { name: "협재·모슬포", lat: 33.3, lng: 126.25, province: JEJU, cities: ["제주도서부"], seas: ["제주도서부앞바다", "제주도앞바다"] },
  { name: "서귀포", lat: 33.24, lng: 126.56, province: JEJU, cities: ["제주도남부", "서귀포"], seas: ["제주도남부앞바다", "제주도앞바다"] },
  { name: "성산", lat: 33.46, lng: 126.93, province: JEJU, cities: ["제주도동부"], seas: ["제주도동부앞바다", "제주도앞바다"] },
];

/** 국립해양조사원 조위관측소 (조석예보 obsCode) */
export type TideStation = { code: string; name: string; lat: number; lng: number };

export const TIDE_STATIONS: TideStation[] = [
  { code: "DT_0001", name: "인천", lat: 37.4519, lng: 126.5922 },
  { code: "DT_0002", name: "평택", lat: 36.9667, lng: 126.8228 },
  { code: "DT_0003", name: "영광", lat: 35.4261, lng: 126.4206 },
  { code: "DT_0004", name: "제주", lat: 33.5275, lng: 126.5431 },
  { code: "DT_0005", name: "부산", lat: 35.0961, lng: 129.0353 },
  { code: "DT_0006", name: "묵호", lat: 37.5503, lng: 129.1164 },
  { code: "DT_0007", name: "목포", lat: 34.7797, lng: 126.3756 },
  { code: "DT_0008", name: "안산", lat: 37.1922, lng: 126.6472 },
  { code: "DT_0010", name: "서귀포", lat: 33.24, lng: 126.5617 },
  { code: "DT_0011", name: "후포", lat: 36.6772, lng: 129.4533 },
  { code: "DT_0012", name: "속초", lat: 38.2072, lng: 128.5942 },
  { code: "DT_0013", name: "울릉도", lat: 37.4914, lng: 130.9136 },
  { code: "DT_0014", name: "통영", lat: 34.8278, lng: 128.4347 },
  { code: "DT_0016", name: "여수", lat: 34.7472, lng: 127.7656 },
  { code: "DT_0017", name: "대산", lat: 37.0072, lng: 126.3522 },
  { code: "DT_0018", name: "군산", lat: 35.9756, lng: 126.5631 },
  { code: "DT_0020", name: "울산", lat: 35.5017, lng: 129.3872 },
  { code: "DT_0022", name: "성산포", lat: 33.4747, lng: 126.9275 },
  { code: "DT_0023", name: "모슬포", lat: 33.2142, lng: 126.2511 },
  { code: "DT_0024", name: "장항", lat: 36.0067, lng: 126.6878 },
  { code: "DT_0025", name: "보령", lat: 36.4064, lng: 126.4861 },
  { code: "DT_0026", name: "고흥발포", lat: 34.4811, lng: 127.3428 },
  { code: "DT_0027", name: "완도", lat: 34.3153, lng: 126.7597 },
  { code: "DT_0028", name: "진도", lat: 34.3772, lng: 126.3086 },
  { code: "DT_0029", name: "거제도", lat: 34.8014, lng: 128.6992 },
  { code: "DT_0035", name: "흑산도", lat: 34.6842, lng: 125.4353 },
  { code: "DT_0050", name: "태안", lat: 36.9131, lng: 126.2381 },
  { code: "DT_0091", name: "포항", lat: 36.0472, lng: 129.3836 },
];

/** 이보다 멀면 매칭하지 않는다 (내륙·먼 바다) */
const COAST_MAX_KM = 60;
const TIDE_MAX_KM = 35;
/** 가까운 곳 정보가 없을 때 대신 쓸 수 있는 거리 (그보다 멀면 쓰지 않는다) */
export const FALLBACK_MAX_KM = 120;

function byDistance<T extends { lat: number; lng: number }>(items: T[], lat: number, lng: number, maxKm: number) {
  return items
    .map((item) => ({ item, km: haversineKm({ lat, lng }, item) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km);
}

export function nearestCoastPoint(lat: number, lng: number) {
  return byDistance(COAST_POINTS, lat, lng, COAST_MAX_KM)[0] ?? null;
}

export function nearestTideStation(lat: number, lng: number) {
  return byDistance(TIDE_STATIONS, lat, lng, TIDE_MAX_KM)[0] ?? null;
}

/** 가까운 순서의 해안 기준점 (대신 쓸 지역 찾기) */
export function coastPointsByDistance(lat: number, lng: number, limit = 3, maxKm = FALLBACK_MAX_KM) {
  return byDistance(COAST_POINTS, lat, lng, maxKm).slice(0, limit);
}

/** 가까운 순서의 조위관측소 */
export function tideStationsByDistance(lat: number, lng: number, limit = 3, maxKm = FALLBACK_MAX_KM) {
  return byDistance(TIDE_STATIONS, lat, lng, maxKm).slice(0, limit);
}
