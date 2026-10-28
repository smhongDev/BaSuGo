import { ISLANDS, MAINLAND } from "./coastline.ts";
import { COAST_POINTS, SEA_LABEL, type SeaRegion } from "./regions.ts";
import { haversineKm } from "./gpx.ts";

/** 바다 해안 · 섬 · 내륙 물가(호수·강·저수지) */
export type WaterKind = "coast" | "island" | "inland";

export type WaterClass = {
  kind: WaterKind;
  /** 바다면 어느 바다인지 (내륙 물가는 null) */
  sea: SeaRegion | null;
  /** 가장 가까운 해안선까지 거리 */
  coastKm: number;
  /** 화면에 보여 줄 말 (예: "서해 해안", "남해 섬", "내륙 물가") */
  label: string;
};

/** 해안선에서 이보다 멀면 내륙으로 본다 (해안선 자료가 단순화되어 있어 몇 km 여유를 둔다) */
export const INLAND_KM = 8;

/** 점에서 선분까지 거리 (km, 좁은 범위라 평면으로 계산) */
function segmentKm(lat: number, lng: number, a: [number, number], b: [number, number]): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a[1] - lng) * kx;
  const ay = (a[0] - lat) * ky;
  const dx = (b[1] - a[1]) * kx;
  const dy = (b[0] - a[0]) * ky;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function lineKm(lat: number, lng: number, line: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, segmentKm(lat, lng, line[i], line[i + 1]));
  return best;
}

/** 가장 가까운 해안선까지 거리와 그 해안선이 섬인지 */
export function nearestCoast(lat: number, lng: number): { km: number; island: boolean } {
  let km = lineKm(lat, lng, MAINLAND);
  let island = false;
  for (const line of ISLANDS) {
    const d = lineKm(lat, lng, line);
    if (d < km) {
      km = d;
      island = true;
    }
  }
  return { km, island };
}

/** 가장 가까운 해안 기준점의 바다 (섬은 둘러싼 바다를 따른다) */
export function seaRegionOf(lat: number, lng: number): SeaRegion {
  let best = COAST_POINTS[0];
  let bestKm = Infinity;
  for (const p of COAST_POINTS) {
    const km = haversineKm({ lat, lng }, p);
    if (km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best.sea;
}

/** 해안선에서 멀어서 내륙일 수 있는 곳인가 (바다 예보로 최종 확인하기 전 단계) */
export function maybeInland(lat: number, lng: number): boolean {
  return nearestCoast(lat, lng).km > INLAND_KM;
}

/**
 * 선택한 곳이 바다 해안·섬·내륙 물가 중 어디인지 정한다.
 * 해안선에서 8km 넘게 떨어져 있고 그 자리에 바다 예보(파고)도 없으면 내륙 물가다.
 * 해안선에서 멀어도 파고가 나오면 먼바다로 보고 바다로 둔다.
 */
export function classifyWater(lat: number, lng: number, hasSeaForecast: boolean): WaterClass {
  const { km, island } = nearestCoast(lat, lng);
  if (km > INLAND_KM && !hasSeaForecast) {
    return { kind: "inland", sea: null, coastKm: km, label: "내륙 물가" };
  }
  const sea = seaRegionOf(lat, lng);
  if (km > INLAND_KM) return { kind: "coast", sea, coastKm: km, label: `${SEA_LABEL[sea]} 먼바다` };
  const kind: WaterKind = island ? "island" : "coast";
  return { kind, sea, coastKm: km, label: `${SEA_LABEL[sea]} ${island ? "섬" : "해안"}` };
}
