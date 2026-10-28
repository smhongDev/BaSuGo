import { DEFAULT_WEIGHT_KG } from "./calories.ts";
import { haversineKm } from "./gpx.ts";
import type { DayInfo, Place, SavedTrip, SwimRecord } from "./types.ts";

// 로그인 없이 이 기기의 브라우저에만 저장한다 (기본값). 서버 저장이 필요해지면 이 파일만 바꾸면 된다.
const TRIPS_KEY = "basugo.trips.v1";
const RECORDS_KEY = "basugo.records.v1";
const WEIGHT_KEY = "basugo.weight.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 없거나 사생활 보호 모드면 저장하지 못한다
  }
  if (key === TRIPS_KEY) window.dispatchEvent(new Event(TRIPS_EVENT));
}

/** 저장한 날짜가 바뀌면 알림 구독의 일정도 다시 보내도록 알린다 */
export const TRIPS_EVENT = "basugo:trips";

export const tripId = (place: Place, date: string) => `${place.lat.toFixed(3)},${place.lng.toFixed(3)}|${date}`;

/** 같은 지역: 1km 안이거나, 이름이 같고 30km 안 (검색·지도·최근 장소로 고른 좌표가 조금씩 달라도 같은 곳으로 본다) */
export function sameRegion(a: Place, b: Place): boolean {
  const km = haversineKm(a, b);
  return km <= 1 || (a.name.trim() === b.name.trim() && km <= 30);
}

/** 같은 날짜·같은 지역은 가장 최근에 저장한 것 하나만 남긴다 */
export function dedupeTrips(trips: SavedTrip[]): SavedTrip[] {
  const newestFirst = [...trips].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  const kept: SavedTrip[] = [];
  for (const t of newestFirst) {
    if (!kept.some((k) => k.date === t.date && sameRegion(k.place, t.place))) kept.push(t);
  }
  return kept;
}

export function loadTrips(): SavedTrip[] {
  const all = read<SavedTrip[]>(TRIPS_KEY, []);
  const trips = dedupeTrips(all);
  // 예전에 겹쳐 저장된 것이 있으면 정리해 둔다
  if (trips.length !== all.length) write(TRIPS_KEY, trips);
  return trips.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 같은 날짜·같은 지역은 새로 저장한 것만 남기고 이전 것은 지운다. */
export function saveTrip(place: Place, date: string, day?: DayInfo): void {
  const id = tripId(place, date);
  const all = read<SavedTrip[]>(TRIPS_KEY, []);
  const same = (t: SavedTrip) => t.id === id || (t.date === date && sameRegion(t.place, place));
  const trips = all.filter((t) => !same(t));
  const prev = all.filter(same).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0];
  trips.push({
    id,
    place,
    date,
    savedAt: new Date().toISOString(),
    rating: day?.rating ?? prev?.rating ?? "unknown",
    weatherText: day?.weatherText ?? prev?.weatherText ?? "",
    weatherIcon: day?.weatherIcon ?? prev?.weatherIcon ?? "",
    windMax: day?.windMax ?? prev?.windMax ?? null,
    tMax: day?.tMax ?? prev?.tMax ?? null,
  });
  write(TRIPS_KEY, trips);
}

/** 최근에 저장한 장소 (같은 곳은 한 번만, 최근 순) */
export function recentPlaces(limit = 5): Place[] {
  const trips = read<SavedTrip[]>(TRIPS_KEY, []).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const t of trips) {
    const k = `${t.place.lat.toFixed(3)},${t.place.lng.toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t.place);
    if (out.length >= limit) break;
  }
  return out;
}

export function deleteTrips(ids: string[]): void {
  const set = new Set(ids);
  write(
    TRIPS_KEY,
    read<SavedTrip[]>(TRIPS_KEY, []).filter((t) => !set.has(t.id)),
  );
}

export function clearTrips(): void {
  write(TRIPS_KEY, []);
}

export function loadRecords(): SwimRecord[] {
  return read<SwimRecord[]>(RECORDS_KEY, []).sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

export function addRecord(rec: SwimRecord): void {
  write(RECORDS_KEY, [...read<SwimRecord[]>(RECORDS_KEY, []), rec]);
}

export function deleteRecords(ids: string[]): void {
  const set = new Set(ids);
  write(
    RECORDS_KEY,
    read<SwimRecord[]>(RECORDS_KEY, []).filter((r) => !set.has(r.id)),
  );
}

export function loadWeight(): number {
  const w = read<number>(WEIGHT_KEY, DEFAULT_WEIGHT_KG);
  return Number.isFinite(w) && w >= 20 && w <= 300 ? w : DEFAULT_WEIGHT_KG;
}

export function saveWeight(kg: number): void {
  write(WEIGHT_KEY, kg);
}
